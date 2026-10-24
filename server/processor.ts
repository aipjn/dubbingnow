import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { QuoteRequest, JobResult } from "../lib/api/types";
import { Store, type JobRow } from "./store";
import { PrivateStorage } from "./storage";
import type { SpeechProvider } from "./providers/google";
import { speechProvider } from "./providers";
import { BackendError } from "./errors";
import { dubRecording, type PipelineReport } from "./dubbing-pipeline";
import { PipelineMetrics } from "./pipeline-metrics";
export class Processor {
  constructor(
    readonly store: Store,
    readonly storage: PrivateStorage,
    private provider?: SpeechProvider,
  ) {}
  async runOnce(): Promise<boolean> {
    const row = this.store.claim();
    if (!row) return false;
    await this.process(row);
    return true;
  }
  private async process(row: JobRow) {
    const config = this.store.config,
      controller = new AbortController(),
      signal = controller.signal,
      lease = row.lease!,
      metrics = new PipelineMetrics(),
      queueMs = Math.max(0, Date.now() - row.created);
    const deadline = setTimeout(
      () => controller.abort(),
      config.maxJobRunMs ?? 900000,
    );
    const heartbeat = setInterval(() => {
      try {
        if (!this.store.heartbeat(row.id, lease)) controller.abort();
      } catch {
        controller.abort();
      }
    }, 1000);
    let dir: string | undefined,
      published = false,
      report: PipelineReport | undefined;
    let outcome = "failed";
    try {
      const workDir = path.join(config.dataDir, "work");
      await mkdir(workDir, { recursive: true, mode: 0o700 });
      dir = await mkdtemp(path.join(workDir, row.id + "-"));
      const input: QuoteRequest = JSON.parse(row.input),
        actor = this.store.actor(row.owner),
        upload = this.store.upload(actor, input.uploadId);
      const consentFiles = new Map(
        (input.consentUploads || []).map((c) => {
          this.store.upload(actor, c.uploadId);
          return [c.speaker, this.storage.file(c.uploadId, "upload")] as const;
        }),
      );
      const result = await dubRecording(
        config,
        this.provider ||
          speechProvider(config, input.voiceMode || "preset", metrics.observe, {
            owner: row.owner,
            jobId: row.id,
          }),
        {
          source: this.storage.file(input.uploadId, "upload"),
          audioDuration: upload.duration!,
          duration: row.duration,
          offset: input.timeline?.audioOffsetSeconds || 0,
          sourceLanguage: input.sourceLanguage,
          targetLanguage: input.targetLanguage,
          tier: input.voiceTier,
          mode: input.voiceMode || "preset",
          consentFiles,
          dir,
        },
        signal,
        metrics,
        (status, progress) => this.store.stage(row.id, lease, status, progress),
      );
      report = result.report;
      this.store.stage(row.id, lease, "rendering", 95);
      const final = this.storage.file(row.id, "result");
      await metrics.measure("publish", async () => {
        await mkdir(path.dirname(final), { recursive: true, mode: 0o700 });
        await rename(result.output, final);
      });
      published = true;
      const jobResult: JobResult = {
        mediaType: "audio",
        preview: {
          url: "",
          filename: "",
          contentType: "audio/wav",
          expiresAt: null,
        },
        download: {
          url: "",
          filename: "",
          contentType: "audio/wav",
          expiresAt: null,
        },
        durationSeconds: row.duration,
        sourceLanguage: result.sourceLanguage,
        targetLanguage: input.targetLanguage,
        speakerCount: result.speakerCount,
        isDemo: false,
        voiceMode: input.voiceMode || "preset",
      };
      if (!this.store.settle(row.id, lease, "completed", jobResult, null)) {
        await rm(final, { force: true });
        published = false;
        outcome = "lease_lost";
      } else outcome = "completed";
    } catch (err) {
      controller.abort();
      const error =
        err instanceof BackendError
          ? err
          : new BackendError(
              "PROCESSING_FAILED",
              "Processing was interrupted. Your reservation was returned.",
              500,
              true,
            );
      this.store.settle(row.id, lease, "failed", null, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
      if (published)
        await rm(this.storage.file(row.id, "result"), { force: true });
    } finally {
      clearInterval(heartbeat);
      clearTimeout(deadline);
      if (dir) await rm(dir, { recursive: true, force: true });
      // Operational measurements contain no transcript, waveform, consent audio or voice key.
      try {
        const metricsDir = path.join(config.dataDir, "metrics");
        await mkdir(metricsDir, { recursive: true, mode: 0o700 });
        await writeFile(
          path.join(metricsDir, row.id + ".json"),
          JSON.stringify(
            {
              jobId: row.id,
              outcome,
              queueMs,
              ...report,
              timings: metrics.snapshot(),
            },
            null,
            2,
          ),
          { mode: 0o600 },
        );
      } catch {
        /* Metrics failure must never change billing or job settlement. */
      }
    }
  }
}
