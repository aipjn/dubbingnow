import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../server/config";

test("Vercel refuses local persistence or an undelivered standalone worker configuration", () => {
  const values: Record<string, string | undefined> = {
    VERCEL: "1",
    PERSISTENCE_DRIVER: "cloudflare",
    JOB_EXECUTION: "vercel-queue",
    STORAGE_SIGNING_SECRET:
      "test-only-queue-signing-secret-12345678901234567890",
    NODE_ENV: "production",
    BACKEND_LOCAL: "false",
    MAX_JOB_RUN_SECONDS: "900",
    FFMPEG_PATH: undefined,
    FFPROBE_PATH: undefined,
  };
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const config = loadConfig();
    assert.equal(config.requireWorker, false);
    assert.equal(
      config.maxJobRunMs,
      240000,
      "settle/refund before the 300 second function deadline",
    );
    assert.match(config.ffmpeg, /vendor\/media\/bin\/ffmpeg$/);
    assert.match(config.ffprobe, /vendor\/media\/bin\/ffprobe$/);
    process.env.JOB_EXECUTION = "worker";
    assert.throws(loadConfig, /durable queue execution/);
    process.env.JOB_EXECUTION = "vercel-queue";
    process.env.PERSISTENCE_DRIVER = "local";
    assert.throws(loadConfig, /Cloudflare persistence/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
