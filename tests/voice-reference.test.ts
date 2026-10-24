import test from "node:test";
import assert from "node:assert/strict";
import { wavHeader } from "../server/media";
import { scanReferences, wavPcm } from "../server/voice-reference";
import type { Segment } from "../server/providers/google";
import { mapConcurrent } from "../server/pipeline-metrics";
import { setTimeout as delay } from "node:timers/promises";
import { benchmarkLocal } from "../server/scripts/benchmark-local";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ServerConfig } from "../server/config";
const clean = {
  cleanSpeech: true,
  naturalDelivery: true,
  overlappingSpeech: false,
};
function tone(seconds = 30, amplitude = 0.15) {
  const pcm = Buffer.alloc(seconds * 24000 * 2);
  for (let i = 0; i < pcm.length / 2; i++)
    pcm.writeInt16LE(
      Math.round(amplitude * 32767 * Math.sin((i * 2 * Math.PI * 220) / 24000)),
      i * 2,
    );
  return Buffer.concat([wavHeader(pcm.length / 2), pcm]);
}
function segment(start: number, end: number, speaker = 0): Segment {
  return {
    start,
    end,
    speaker,
    text: "A clear natural sentence with varied sounds.",
    referenceQuality: clean,
  };
}
test("reference selection ranks whole sentences, excludes mixed speakers, and favors a representative 20-second passage", () => {
  const wav = tone();
  const result = scanReferences(wav, [
    segment(0, 10),
    segment(10, 20),
    segment(20, 30),
  ]);
  assert.equal(result.candidates[0].end - result.candidates[0].start, 20);
  assert.equal(result.candidates[0].start, 0);
  assert.equal(
    scanReferences(wav, [segment(0, 6), segment(6, 12, 1)]).candidates.length,
    0,
  );
  assert.equal(
    scanReferences(wav, [segment(0, 8), segment(9, 17)]).candidates.length,
    0,
  );
  const shifted = scanReferences(wav, [segment(0, 15)], 120).candidates[0];
  assert.equal(shifted.start, 120);
  assert.equal(shifted.end, 135);
});
test("silence, low level, clipping, overlap, singing/shouting and missing quality flags cannot become clone references", () => {
  assert.equal(
    scanReferences(tone(15, 0), [segment(0, 15)]).candidates.length,
    0,
  );
  assert.equal(
    scanReferences(tone(15, 0.001), [segment(0, 15)]).candidates.length,
    0,
  );
  const clipped = tone(15);
  const pcm = wavPcm(clipped);
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(32767, i);
  assert.ok(scanReferences(clipped, [segment(0, 15)]).rejected.clipping);
  for (const referenceQuality of [
    undefined,
    { ...clean, cleanSpeech: false },
    { ...clean, naturalDelivery: false },
    { ...clean, overlappingSpeech: true },
  ])
    assert.equal(
      scanReferences(tone(15), [{ ...segment(0, 15), referenceQuality }])
        .candidates.length,
      0,
    );
  const silence = tone(15);
  wavPcm(silence).fill(0, 24000 * 2 * 4, 24000 * 2 * 6);
  assert.ok(scanReferences(silence, [segment(0, 15)]).rejected.silence);
});
test("RIFF parsing tolerates metadata chunks and rejects the wrong sample rate or truncated data", () => {
  const wav = tone(1),
    metadata = Buffer.from("JUNK\x02\x00\x00\x00ok", "binary");
  const extended = Buffer.concat([
    wav.subarray(0, 36),
    metadata,
    wav.subarray(36),
  ]);
  assert.deepEqual(wavPcm(extended), wavPcm(wav));
  const wrong = Buffer.from(wav);
  wrong.writeUInt32LE(16000, 24);
  assert.throws(() => wavPcm(wrong), /24 kHz/);
  assert.throws(() => wavPcm(wav.subarray(0, 50)), /Truncated/);
});
test("bounded concurrency preserves result order even when completion order differs", async () => {
  let active = 0,
    maximum = 0;
  const result = await mapConcurrent(
    [40, 5, 20, 2],
    2,
    new AbortController().signal,
    async (ms, index, signal) => {
      maximum = Math.max(maximum, ++active);
      try {
        await delay(ms, undefined, { signal });
        return index;
      } finally {
        active--;
      }
    },
  );
  assert.deepEqual(result, [0, 1, 2, 3]);
  assert.equal(maximum, 2);
  assert.equal(active, 0);
});
test("concurrent failure aborts siblings and drains them before cleanup; no further work starts", async () => {
  let active = 0,
    started = 0;
  await assert.rejects(
    mapConcurrent(
      [0, 1, 2, 3],
      2,
      new AbortController().signal,
      async (_n, index, signal) => {
        started++;
        active++;
        try {
          if (index === 0) {
            await delay(5);
            throw new Error("first failure");
          }
          await delay(1000, undefined, { signal });
          return index;
        } finally {
          active--;
        }
      },
    ),
    /first failure/,
  );
  assert.equal(active, 0);
  assert.equal(started, 2);
});
test("clone concurrency benchmark preserves every PCM sample and reuses one cloned voice across twelve sentences", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "clone-benchmark-"));
  try {
    const report = await benchmarkLocal({
      dataDir: dir,
      ffmpeg: process.env.FFMPEG_PATH || "ffmpeg",
      ffprobe: process.env.FFPROBE_PATH || "ffprobe",
      maxSegments: 600,
    } as ServerConfig);
    assert.equal(report.byteIdenticalAudio, true);
    assert.deepEqual(
      report.runs.map((r) => r.maxActive),
      [1, 3],
    );
    assert.ok(
      report.runs.every(
        (r) => r.replicationCalls === 1 && r.sameVoiceEverySentence,
      ),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
