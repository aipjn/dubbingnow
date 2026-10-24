import { setTimeout as delay } from "node:timers/promises";
import { loadConfig } from "./config";
import { createStore } from "./persistence";
import { PrivateStorage } from "./storage";
import { Processor } from "./processor";
import { cleanup } from "./maintenance";
import { randomUUID } from "node:crypto";
async function main() {
  const config = loadConfig(),
    store = createStore(config),
    storage = new PrivateStorage(config, store),
    processor = new Processor(store, storage);
  const workerId = randomUUID();
  await store.workerBeat(workerId);
  let heartbeatRunning = false;
  const heartbeat = setInterval(async () => {
    if (heartbeatRunning) return;
    heartbeatRunning = true;
    try {
      await store.workerBeat(workerId);
    } catch {
      console.error("Worker heartbeat failed.");
    } finally {
      heartbeatRunning = false;
    }
  }, 5000);
  let stopping = false,
    lastCleanup = 0;
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });
  console.log(
    `Dubbing worker started. Google: ${config.googleKey ? "configured" : "not configured"}. Clone provider: ${config.cloneProvider || "google"}. Fish: ${config.fishKey ? "configured" : "not configured"}; voice mode: ${config.fishVoiceMode || "inline"}.`,
  );
  try {
    while (!stopping) {
      try {
        if (Date.now() - lastCleanup > 60000) {
          await cleanup(store, storage);
          lastCleanup = Date.now();
        }
        if (!(await processor.runOnce())) await delay(1000);
      } catch (err) {
        console.error(
          `Worker operation failed (${err instanceof Error ? err.name : "unknown"}).`,
        );
        await delay(1000);
      }
    }
  } finally {
    clearInterval(heartbeat);
    await store.workerStopped(workerId);
    await store.close();
  }
}
void main().catch((error: unknown) => {
  console.error(
    `Worker startup failed (${error instanceof Error ? error.name : "unknown"}). Check server configuration.`,
  );
  process.exitCode = 1;
});
