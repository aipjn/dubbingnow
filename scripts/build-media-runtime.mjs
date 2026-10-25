import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

// Build the audio-only runtime on the deployment host, matching its libc/architecture.
// Keep source provenance and digest fixed; never execute an unverified downloaded binary.
const version = "8.0.3";
const sha256 =
  "6136812ea6d4e68bdba27e33c2a94382711cdf4f8602ffef056ff792bd6f9818";
if (!process.env.VERCEL && !process.argv.includes("--force")) {
  console.log("Using the system media runtime for local builds.");
  process.exit(0);
}
const stamp = `${version}-${process.platform}-${process.arch}-${sha256}`;
const cache = path.resolve(".next/cache/dubbingnow-media", stamp);
const destination = path.resolve("vendor/media/bin");
const execute = (command, args, cwd) =>
  execFileSync(command, args, {
    cwd,
    stdio: "pipe",
    timeout: 600000,
    maxBuffer: 32 * 1024 * 1024,
  });
if (
  !existsSync(path.join(cache, "ffmpeg")) ||
  !existsSync(path.join(cache, "ffprobe"))
) {
  const scratch = mkdtempSync(
    path.join(os.tmpdir(), "dubbingnow-media-build-"),
  );
  try {
    console.log(
      `Building FFmpeg ${version} audio runtime (${process.platform}/${process.arch})…`,
    );
    const archive = path.join(scratch, "ffmpeg.tar.xz");
    if (process.env.MEDIA_SOURCE_ARCHIVE)
      cpSync(process.env.MEDIA_SOURCE_ARCHIVE, archive);
    else
      execute("curl", [
        "--fail",
        "--silent",
        "--show-error",
        "--location",
        "--retry",
        "3",
        "--max-time",
        "180",
        `https://ffmpeg.org/releases/ffmpeg-${version}.tar.xz`,
        "--output",
        archive,
      ]);
    if (
      createHash("sha256").update(readFileSync(archive)).digest("hex") !==
      sha256
    )
      throw new Error("FFmpeg source digest did not match the pinned release.");
    execute("tar", ["-xf", archive, "-C", scratch]);
    const source = path.join(scratch, `ffmpeg-${version}`);
    execute(
      "./configure",
      [
        "--disable-everything",
        "--disable-autodetect",
        "--disable-network",
        "--disable-doc",
        "--disable-debug",
        "--disable-x86asm",
        "--disable-ffplay",
        "--disable-avdevice",
        "--disable-swscale",
        "--enable-ffmpeg",
        "--enable-ffprobe",
        "--enable-protocol=file,pipe",
        "--enable-demuxer=wav,mov,mp3,aac,pcm_s16le",
        "--enable-decoder=aac,aac_fixed,mp3,mp3float,pcm_s16le,pcm_s24le,pcm_s32le,pcm_f32le,pcm_u8,pcm_s16be",
        "--enable-parser=aac,mpegaudio",
        "--enable-encoder=pcm_s16le",
        "--enable-muxer=wav,pcm_s16le",
        "--enable-filter=aresample,aformat,anull,atempo,apad,atrim",
      ],
      source,
    );
    execute(
      "make",
      [
        "-j",
        String(Math.min(os.availableParallelism(), 4)),
        "ffmpeg",
        "ffprobe",
      ],
      source,
    );
    for (const binary of ["ffmpeg", "ffprobe"])
      execute(path.join(source, binary), ["-version"]);
    mkdirSync(cache, { recursive: true });
    for (const filename of ["ffmpeg", "ffprobe", "COPYING.LGPLv2.1"])
      cpSync(path.join(source, filename), path.join(cache, filename));
    writeFileSync(
      path.join(cache, "SOURCE.txt"),
      `FFmpeg ${version}\nhttps://ffmpeg.org/releases/ffmpeg-${version}.tar.xz\nSHA256 ${sha256}\n`,
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Media runtime build failed.",
    );
    if (error?.stderr) console.error(String(error.stderr).slice(-6000));
    process.exitCode = 1;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
if (!process.exitCode) {
  mkdirSync(destination, { recursive: true });
  cpSync(cache, destination, { recursive: true });
  const smoke = mkdtempSync(path.join(os.tmpdir(), "dubbingnow-media-smoke-"));
  try {
    const input = path.resolve("public/demo/english.wav");
    execute(path.join(destination, "ffprobe"), [
      "-v",
      "error",
      "-show_format",
      "-of",
      "json",
      input,
    ]);
    const output = path.join(smoke, "aligned.pcm");
    execute(path.join(destination, "ffmpeg"), [
      "-nostdin",
      "-v",
      "error",
      "-i",
      input,
      "-af",
      "atempo=1.1,apad,atrim=duration=1",
      "-ac",
      "1",
      "-ar",
      "24000",
      "-f",
      "s16le",
      output,
    ]);
    if (readFileSync(output).length !== 48000)
      throw new Error(
        "Bundled audio runtime failed its decode/alignment check.",
      );
  } finally {
    rmSync(smoke, { recursive: true, force: true });
  }
  console.log(`FFmpeg ${version} runtime ready.`);
}
