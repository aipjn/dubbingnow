import { handleCallback } from "@vercel/queue";
import { consumeCleanup } from "@/server/queue-consumer";

export const runtime = "nodejs";
export const maxDuration = 300;
export const POST = handleCallback(consumeCleanup, {
  retry: () => ({ afterSeconds: 60 }),
});
