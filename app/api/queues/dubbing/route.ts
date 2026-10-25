import { handleCallback } from "@vercel/queue";
import { consumeJob } from "@/server/queue-consumer";

export const runtime = "nodejs";
export const maxDuration = 300;
export const POST = handleCallback(consumeJob, {
  visibilityTimeoutSeconds: 300,
  retry: () => ({ afterSeconds: 60 }),
});
