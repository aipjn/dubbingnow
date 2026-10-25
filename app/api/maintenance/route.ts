import { timingSafeEqual, createHash } from "node:crypto";
import { consumeCleanup } from "@/server/queue-consumer";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return new Response(null, { status: 503 });
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (
    !timingSafeEqual(
      digest(request.headers.get("authorization") || ""),
      digest(`Bearer ${secret}`),
    )
  )
    return new Response(null, { status: 401 });
  await consumeCleanup();
  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
