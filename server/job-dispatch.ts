import { send } from "@vercel/queue";

export async function dispatchJob(jobId: string) {
  // Only the job identifier enters the delivery queue. Business state stays in D1.
  await send(
    "dubbingnow-jobs",
    { jobId },
    {
      idempotencyKey: jobId,
      retentionSeconds: 86400,
    },
  );
}

export async function scheduleCleanup(jobId: string, expires: number) {
  await send(
    "dubbingnow-cleanup",
    { jobId },
    {
      idempotencyKey: jobId,
      delaySeconds: Math.max(0, Math.ceil((expires - Date.now()) / 1000) + 1),
      retentionSeconds: 604800,
    },
  );
}
