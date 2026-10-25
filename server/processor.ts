import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { QuoteRequest, JobResult } from "../lib/api/types";
import { type JobRow } from "./store";
import type { DataStore } from "./persistence";
import { PrivateStorage } from "./storage";
import type { SpeechProvider } from "./providers/google";
import { speechProvider } from "./providers";
import { BackendError } from "./errors";
import { dubRecording, type PipelineReport } from "./dubbing-pipeline";
import { PipelineMetrics } from "./pipeline-metrics";
export class Processor {
  constructor(
    readonly store: DataStore,
    readonly storage: PrivateStorage,
    private provider?: SpeechProvider,
  ) {}
  async runOnce(jobId?: string): Promise<boolean> {
    const row = await this.store.claim(jobId);
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
    let heartbeatRunning = false;
    const heartbeat = setInterval(
      async () => {
        if (heartbeatRunning) return;
        heartbeatRunning = true;
        try {
          if (!(await this.store.heartbeat(row.id, lease))) controller.abort();
        } catch {
          controller.abort();
        } finally {
          heartbeatRunning = false;
        }
      },
      this.storage.r2 ? 10000 : 1000,
    );
    let dir: string | undefined,
      published: string | undefined,
      report: PipelineReport | undefined;
    let outcome = "failed";
    try {
      const workDir = path.join(config.dataDir, "work");
      await mkdir(workDir, { recursive: true, mode: 0o700 });
      dir = await mkdtemp(path.join(workDir, row.id + "-"));
      const input: QuoteRequest = JSON.parse(row.input),
        actor = await this.store.actor(row.owner),
        upload = await this.store.upload(actor, input.uploadId);
      const consentFiles = new Map<number, string>();
      for (const c of input.consentUploads || []) {
        const consent = await this.store.upload(actor, c.uploadId);
        consentFiles.set(
          c.speaker,
          await this.storage.sourceFile(consent, dir),
        );
      }
      const result = await dubRecording(
        config,
        this.provider ||
          speechProvider(config, input.voiceMode || "preset", metrics.observe, {
            owner: row.owner,
            jobId: row.id,
          }),
        {
          source: await this.storage.sourceFile(upload, dir),
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
        async (status, progress) => {
          await this.store.stage(row.id, lease, status, progress);
        },
      );
      report = result.report;
      await this.store.stage(row.id, lease, "rendering", 95);
      await metrics.measure("publish", async () => {
        published = await this.storage.publish(row.id, lease, result.output);
      });
      const jobResult: JobResult & { _storageKey?: string } = {
        ...(this.storage.r2 ? { _storageKey: published } : {}),
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
      if (
        !(await this.store.settle(row.id, lease, "completed", jobResult, null))
      ) {
        await this.storage.removeResult(published!);
        published = undefined;
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
      await this.store.settle(row.id, lease, "failed", null, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
      // A database timeout may have committed settlement. Keep the immutable result
      // when its status is uncertain rather than removing a successfully billed result.
      if (published) {
        const current = await Promise.resolve(
          this.store.get<JobRow>("SELECT * FROM jobs WHERE id=?", row.id),
        ).catch(() => undefined);
        if (current && current.status !== "completed")
          await this.storage.removeResult(published);
      }
    } finally {
      clearInterval(heartbeat);
      clearTimeout(deadline);
      if (dir) await rm(dir, { recursive: true, force: true });
      // Operational measurements contain no transcript, waveform, consent audio or voice key.
      try {
        if (this.storage.r2) {
          await this.store.run(
            "INSERT INTO pipeline_metrics(job_id,record,created) VALUES(?,?,?) ON CONFLICT(job_id) DO UPDATE SET record=excluded.record",
            row.id,
            JSON.stringify({
              jobId: row.id,
              outcome,
              queueMs,
              ...report,
              timings: metrics.snapshot(),
            }),
            Date.now(),
          );
        } else {
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
        }
      } catch {
        /* Metrics failure must never change billing or job settlement. */
      }
    }
  }
}
