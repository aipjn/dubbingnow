import { parseArgs } from "node:util";
import { mkdtemp, mkdir, rm, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../config";
import { speechProvider } from "../providers";
import { probe, decodeChunk } from "../media";
import { PipelineMetrics } from "../pipeline-metrics";
import {
  analyzeRecording,
  dubRecording,
  type PipelineInput,
} from "../dubbing-pipeline";
import { BackendError } from "../errors";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    consent: { type: "string", multiple: true },
    target: { type: "string", default: "es" },
    source: { type: "string", default: "auto" },
    mode: { type: "string", default: "clone" },
    concurrency: { type: "string", default: "3" },
    "analyze-only": { type: "boolean", default: false },
    out: { type: "string" },
    "separate-text": { type: "boolean", default: false },
    "voice-id": { type: "string" },
  },
});
async function main() {
  if (!values.input || !["preset", "clone"].includes(values.mode!))
    throw new Error(
      "Use --input audio.wav --mode clone|preset [--consent 0=consent.wav] [--analyze-only].",
    );
  const concurrency = Number(values.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw new Error("Concurrency must be 1–8.");
  const config = {
    ...loadConfig(),
    synthesisConcurrency: concurrency,
    ...(values["separate-text"] ? { combinedTextPipeline: false } : {}),
    ...(values["voice-id"] ? { fishVoiceId: values["voice-id"] } : {}),
  };
  if (!config.googleKey)
    throw new Error(
      "GEMINI_API_KEY is required. This command makes real Google API calls.",
    );
  const consentFiles = new Map<number, string>();
  for (const entry of values.consent || []) {
    const split = entry.indexOf("="),
      speaker = Number(entry.slice(0, split));
    if (
      split < 1 ||
      !Number.isInteger(speaker) ||
      speaker < 0 ||
      speaker > 7 ||
      consentFiles.has(speaker)
    )
      throw new Error(
        "Each --consent must be a unique 0-based speaker=path mapping.",
      );
    consentFiles.set(speaker, path.resolve(entry.slice(split + 1)));
  }
  if (
    values.mode === "clone" &&
    config.cloneProvider !== "fish" &&
    !values["analyze-only"] &&
    !consentFiles.size
  )
    throw new Error(
      "Add genuine same-speaker consent audio with --consent 0=path, or use --analyze-only.",
    );
  const out = path.resolve(
    values.out ||
      `.runtime/benchmarks/${Date.now()}-${randomUUID().slice(0, 8)}`,
  );
  await mkdir(out, { recursive: true, mode: 0o700 });
  const dir = await mkdtemp(path.join(out, "work-")),
    metrics = new PipelineMetrics();
  const signal = AbortSignal.timeout(15 * 60_000);
  const provider = speechProvider(
    config,
    values.mode as "clone" | "preset",
    metrics.observe,
  );
  try {
    const metadata = await metrics.measure("probe", () =>
      probe(config, path.resolve(values.input!), signal),
    );
    for (const file of consentFiles.values()) {
      const info = await probe(config, file, signal);
      if (info.duration > 30)
        throw new Error("Consent recordings must be at most 30 seconds.");
    }
    const input: PipelineInput = {
      source: path.resolve(values.input!),
      audioDuration: metadata.duration,
      duration: metadata.duration,
      offset: 0,
      sourceLanguage: values.source!,
      targetLanguage: values.target!,
      tier: "high_fidelity",
      mode: values.mode as "clone" | "preset",
      consentFiles,
      dir,
    };
    let report: unknown;
    if (values["analyze-only"]) {
      input.mode = "clone";
      const result = await analyzeRecording(
        config,
        provider,
        input,
        signal,
        metrics,
      );
      for (const [i, c] of result.candidates.entries()) {
        await decodeChunk(
          config,
          input.source,
          path.join(out, `speaker-${c.speaker + 1}-candidate-${i + 1}.wav`),
          c.start,
          c.end - c.start,
          signal,
          24000,
        );
      }
      report = {
        outcome: "analyzed",
        segments: result.count,
        speakers: result.speakers.size,
        candidates: result.candidates,
        referenceRejections: result.rejections,
      };
    } else {
      const result = await dubRecording(
        config,
        provider,
        input,
        signal,
        metrics,
        (stage, progress) => console.log(`${stage} ${Math.round(progress)}%`),
      );
      await copyFile(result.output, path.join(out, "result.wav"));
      report = { outcome: "completed", ...result.report };
    }
    await writeFile(
      path.join(out, "report.json"),
      JSON.stringify(
        {
          ...(report as object),
          timings: metrics.snapshot(),
          scope:
            "server media + configured speech providers; excludes browser extraction, upload, queue, polling and video merge",
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(`Report: ${path.join(out, "report.json")}`);
  } catch (error) {
    await writeFile(
      path.join(out, "report.json"),
      JSON.stringify(
        {
          outcome: "failed",
          code: error instanceof BackendError ? error.code : "BENCHMARK_FAILED",
          timings: metrics.snapshot(),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.error(`Failed; timing report: ${path.join(out, "report.json")}`);
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(
    error instanceof BackendError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Benchmark failed.",
  );
  process.exitCode = 1;
});
