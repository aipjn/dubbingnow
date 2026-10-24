import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { loadConfig, type ServerConfig } from "../config";
import { wavHeader } from "../media";
import { dubRecording } from "../dubbing-pipeline";
import type { SpeechProvider } from "../providers/google";

function tone(seconds: number, frequency = 220) {
  const pcm = Buffer.alloc(Math.round(seconds * 24000) * 2);
  for (let i = 0; i < pcm.length / 2; i++)
    pcm.writeInt16LE(
      Math.round(4000 * Math.sin((i * 2 * Math.PI * frequency) / 24000)),
      i * 2,
    );
  return Buffer.concat([wavHeader(pcm.length / 2), pcm]);
}
/** Controlled latency experiment: real FFmpeg/files, synthetic audio + delayed provider doubles. */
export async function benchmarkLocal(config: ServerConfig) {
  const root = path.join(config.dataDir, "local-benchmark");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const temp = await mkdtemp(path.join(root, "run-"));
  try {
    const source = path.join(temp, "source.wav"),
      consent = path.join(temp, "synthetic-test-consent.wav");
    await writeFile(source, tone(18));
    await writeFile(consent, tone(2));
    const runs = [];
    const hashes = [];
    for (const concurrency of [1, 3]) {
      const dir = path.join(temp, `c${concurrency}`);
      await mkdir(dir);
      let active = 0,
        maxActive = 0,
        replicationCalls = 0;
      const voices: (string | undefined)[] = [];
      const provider: SpeechProvider = {
        transcribe: async () => ({
          language: "en",
          segments: Array.from({ length: 12 }, (_, i) => ({
            start: i * 1.5,
            end: (i + 1) * 1.5,
            speaker: 0,
            text: `Natural complete sentence number ${i}.`,
            referenceQuality: {
              cleanSpeech: true,
              naturalDelivery: true,
              overlappingSpeech: false,
            },
          })),
        }),
        translate: async (segments) => segments,
        replicate: async () => {
          replicationCalls++;
          return "voicekey_SYNTHETIC_TEST_DOUBLE";
        },
        speak: async (
          text,
          _speaker,
          _tier,
          _language,
          signal,
          _presentation,
          voice,
        ) => {
          const index = Number(text.match(/(\d+)\./)![1]);
          voices.push(voice);
          maxActive = Math.max(maxActive, ++active);
          try {
            await delay(200 + (index % 3) * 10, undefined, { signal });
            return tone(1.5, 300 + index * 25);
          } finally {
            active--;
          }
        },
      };
      const result = await dubRecording(
        {
          ...config,
          synthesisConcurrency: concurrency,
          combinedTextPipeline: false,
        },
        provider,
        {
          source,
          audioDuration: 18,
          duration: 18,
          offset: 0,
          sourceLanguage: "en",
          targetLanguage: "es",
          tier: "standard",
          mode: "clone",
          consentFiles: new Map([[0, consent]]),
          dir,
        },
        new AbortController().signal,
      );
      hashes.push(
        createHash("sha256")
          .update(await readFile(result.output))
          .digest("hex"),
      );
      runs.push({
        ...result.report,
        maxActive,
        replicationCalls,
        sameVoiceEverySentence:
          voices.length === 12 &&
          voices.every((v) => v === "voicekey_SYNTHETIC_TEST_DOUBLE"),
      });
    }
    return {
      scope:
        "real FFmpeg; synthetic waveforms and 200–220ms provider test doubles; no real voice clone or model quality measurement",
      runs,
      byteIdenticalAudio: hashes[0] === hashes[1],
      speedup: runs[0].timings.wallMs / runs[1].timings.wallMs,
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void (async () => {
    const config = loadConfig(),
      report = await benchmarkLocal(config);
    const filename = path.resolve(".runtime/benchmarks/local-concurrency.json");
    await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
    await writeFile(filename, JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(
      JSON.stringify(
        {
          serialMs: report.runs[0].timings.wallMs,
          parallelMs: report.runs[1].timings.wallMs,
          speedup: report.speedup,
          byteIdenticalAudio: report.byteIdenticalAudio,
          report: filename,
        },
        null,
        2,
      ),
    );
  })().catch(() => {
    console.error("Local benchmark failed.");
    process.exitCode = 1;
  });
}
