import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, open, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireValue, BackendError } from "./errors";
import type { ServerConfig } from "./config";
const execute = promisify(execFile);
export async function runMedia(
  command: string,
  args: string[],
  signal?: AbortSignal,
) {
  try {
    return await execute(command, args, {
      signal,
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    });
  } catch (err) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if ((err as NodeJS.ErrnoException).code === "ENOENT")
      throw new BackendError(
        "SERVICE_UNAVAILABLE",
        "Audio processing is not configured yet.",
        503,
      );
    throw new BackendError(
      "UNSUPPORTED_MEDIA",
      "This recording cannot be processed.",
      415,
    );
  }
}
export async function probe(
  config: ServerConfig,
  filename: string,
  signal?: AbortSignal,
) {
  const { stdout } = await runMedia(
    config.ffprobe,
    [
      "-v",
      "error",
      "-protocol_whitelist",
      "file,pipe",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      filename,
    ],
    signal,
  );
  const info = JSON.parse(stdout);
  requireValue(
    info.streams?.length === 1 && info.streams[0].codec_type === "audio",
    "UNSUPPORTED_MEDIA",
    "Upload a recording containing audio only.",
    415,
  );
  const stream = info.streams[0],
    duration = Number(stream.duration || info.format?.duration);
  requireValue(
    Number.isFinite(duration) && duration > 0 && duration <= 7200.25,
    "UNSUPPORTED_MEDIA",
    "This recording has an unsupported duration.",
    415,
  );
  requireValue(
    [
      "aac",
      "mp3",
      "pcm_s16le",
      "pcm_s24le",
      "pcm_s32le",
      "pcm_f32le",
      "pcm_u8",
      "pcm_s16be",
    ].includes(stream.codec_name),
    "UNSUPPORTED_MEDIA",
    "This audio codec is not supported.",
    415,
  );
  return {
    duration,
    format: String(info.format?.format_name || ""),
    codec: String(stream.codec_name),
  };
}
export async function decodeChunk(
  config: ServerConfig,
  source: string,
  target: string,
  start: number,
  duration: number,
  signal: AbortSignal,
  rate = 16000,
) {
  await runMedia(
    config.ffmpeg,
    [
      "-nostdin",
      "-v",
      "error",
      "-y",
      "-protocol_whitelist",
      "file,pipe",
      "-ss",
      String(start),
      "-i",
      source,
      "-t",
      String(duration),
      "-map",
      "0:a:0",
      "-ac",
      "1",
      "-ar",
      String(rate),
      "-c:a",
      "pcm_s16le",
      target,
    ],
    signal,
  );
  return readFile(target);
}
export function wavHeader(samples: number, rate = 24000) {
  const dataSize = samples * 2;
  requireValue(
    dataSize < 0xffffffff,
    "PROCESSING_FAILED",
    "The audio result is too large.",
    500,
  );
  const b = Buffer.alloc(44);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + dataSize, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(dataSize, 40);
  return b;
}
function tempoFilters(ratio: number) {
  const parts: string[] = [];
  while (ratio > 2) {
    parts.push("atempo=2");
    ratio /= 2;
  }
  parts.push(`atempo=${ratio.toFixed(6)}`);
  return parts.join(",");
}
export async function alignSegment(
  config: ServerConfig,
  wav: Buffer,
  dir: string,
  index: number,
  duration: number,
  signal: AbortSignal,
) {
  requireValue(
    wav.length >= 44 &&
      wav.toString("ascii", 0, 4) === "RIFF" &&
      wav.toString("ascii", 8, 12) === "WAVE",
    "PROCESSING_FAILED",
    "The speech service returned invalid audio.",
    502,
  );
  const input = path.join(dir, `speech-${index}.wav`),
    output = path.join(dir, `aligned-${index}.pcm`);
  await writeFile(input, wav, { mode: 0o600 });
  const metadata = await probe(config, input, signal),
    ratio = metadata.duration / duration;
  requireValue(
    ratio <= 4,
    "PROCESSING_FAILED",
    "The translated speech is too long for the recording timing.",
    502,
  );
  const filter = [
    ...(ratio > 1.02 ? [tempoFilters(ratio)] : []),
    "apad",
    `atrim=duration=${duration.toFixed(6)}`,
  ].join(",");
  await runMedia(
    config.ffmpeg,
    [
      "-nostdin",
      "-v",
      "error",
      "-y",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      input,
      "-af",
      filter,
      "-ac",
      "1",
      "-ar",
      "24000",
      "-f",
      "s16le",
      output,
    ],
    signal,
  );
  return output;
}
export class AudioWriter {
  private handle: Awaited<ReturnType<typeof open>> | null = null;
  constructor(
    readonly filename: string,
    readonly duration: number,
  ) {}
  async init() {
    await mkdir(path.dirname(this.filename), { recursive: true, mode: 0o700 });
    this.handle = await open(this.filename, "wx", 0o600);
    const samples = Math.round(this.duration * 24000);
    await this.handle.writeFile(wavHeader(samples));
    await this.handle.truncate(44 + samples * 2);
  }
  async add(filename: string, start: number, signal: AbortSignal) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const data = await readFile(filename),
      offset = Math.round(start * 24000) * 2;
    const maxBytes = Math.round(this.duration * 24000) * 2 - offset;
    requireValue(
      offset >= 0 && maxBytes > 0,
      "PROCESSING_FAILED",
      "Invalid segment timing.",
      500,
    );
    const count = Math.min(data.length, maxBytes);
    let written = 0;
    while (written < count) {
      const { bytesWritten } = await this.handle!.write(
        data,
        written,
        count - written,
        44 + offset + written,
      );
      written += bytesWritten;
    }
  }
  async close() {
    await this.handle?.sync();
    await this.handle?.close();
    this.handle = null;
  }
}
