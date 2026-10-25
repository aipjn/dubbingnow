import { z } from "zod";
import { loadConfig } from "./config";
import { createStore } from "./persistence";
import { PrivateStorage } from "./storage";
import { Processor } from "./processor";
import type { JobRow } from "./store";
import { scheduleCleanup } from "./job-dispatch";
import { cleanup } from "./maintenance";

const messageSchema = z.object({ jobId: z.string().uuid() });

export async function consumeJob(message: unknown) {
  const { jobId } = messageSchema.parse(message);
  const config = loadConfig();
  if (config.jobExecution !== "vercel-queue")
    throw new Error("Queue execution is not configured.");
  const store = createStore(config);
  try {
    const processor = new Processor(store, new PrivateStorage(config, store));
    await processor.runOnce(jobId);
    const row = await store.get<JobRow>("SELECT * FROM jobs WHERE id=?", jobId);
    if (!row || !row.settled)
      throw new Error("Task is still pending; retry delivery.");
    await scheduleCleanup(jobId, row.updated + config.retentionMs);
  } finally {
    await store.close();
  }
}

export async function consumeCleanup() {
  const store = createStore(loadConfig());
  try {
    await cleanup(store);
  } finally {
    await store.close();
  }
}
