import { loadConfig } from "../config";
import { createStore } from "../persistence";
import { diskReady } from "../health";

async function main() {
  const config = loadConfig(),
    store = createStore(config);
  try {
    await store.recoverExpiredJobs();
    const since = Date.now() - 3600000;
    const counts = await store.all<{ status: string; count: number }>(
      "SELECT status,count(*) AS count FROM jobs WHERE created>? GROUP BY status",
      since,
    );
    const total = counts.reduce((n, r) => n + r.count, 0);
    const failed = counts.find((r) => r.status === "failed")?.count || 0;
    const queue = (await store.get<{ count: number; oldest: number | null }>(
      "SELECT count(*) AS count,min(created) AS oldest FROM jobs WHERE status='queued'",
    ))!;
    const checks = {
      worker: await store.workerHealthy(),
      disk: await diskReady(config),
      queue:
        !queue.oldest ||
        Date.now() - queue.oldest < (config.maxQueueWaitMs ?? 600000),
      recentFailureRate: total < 5 || failed / total < 0.2,
    };
    console.log(
      JSON.stringify({
        ok: Object.values(checks).every(Boolean),
        checks,
        queued: queue.count,
        lastHour: counts,
      }),
    );
    if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
  } finally {
    await store.close();
  }
}
void main().catch(() => {
  console.error("Monitor could not read service state.");
  process.exitCode = 1;
});
