import { parseArgs } from "node:util";
import path from "node:path";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { loadConfig } from "../config";
import { FishVoice } from "../providers/fish";
import { decodeChunk, probe } from "../media";
import { BackendError } from "../errors";
const { values } = parseArgs({
  options: {
    reference: { type: "string" },
    text: { type: "string" },
    start: { type: "string", default: "0" },
    seconds: { type: "string", default: "20" },
  },
});
async function main() {
  const config = loadConfig(),
    voice = new FishVoice(config),
    signal = AbortSignal.timeout(180000);
  const saved = await voice.existing(signal);
  if (saved) {
    console.log(
      JSON.stringify({ voiceId: saved, reused: true, created: false }),
    );
    return;
  }
  if (!values.reference) {
    console.log(
      JSON.stringify({
        voiceId: null,
        created: false,
        note: "No saved voice. Pass --reference /path/audio.wav to register the single test voice once.",
      }),
    );
    return;
  }
  const start = Number(values.start),
    seconds = Number(values.seconds);
  if (
    !Number.isFinite(start) ||
    start < 0 ||
    !Number.isFinite(seconds) ||
    seconds < 10 ||
    seconds > 30
  )
    throw new Error(
      "Use a 10–30 second reference passage and a nonnegative start.",
    );
  const filename = path.resolve(values.reference),
    info = await probe(config, filename, signal);
  if (info.duration - start < 10)
    throw new Error(
      "The selected reference passage needs at least 10 seconds.",
    );
  const work = path.join(config.dataDir, "work");
  await mkdir(work, { recursive: true, mode: 0o700 });
  const dir = await mkdtemp(path.join(work, "fish-reference-"));
  try {
    const reference = await decodeChunk(
      config,
      filename,
      path.join(dir, "reference.wav"),
      start,
      Math.min(seconds, info.duration - start),
      signal,
      24000,
    );
    const id = await voice.ensure(reference, values.text, signal);
    console.log(
      JSON.stringify({
        voiceId: id,
        created: true,
        note: "This ID is persisted and will be reused. No automatic replacement or deletion.",
      }),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(
    error instanceof BackendError
      ? error.message
      : "Fish voice setup failed. Check reference and configuration.",
  );
  process.exitCode = 1;
});
