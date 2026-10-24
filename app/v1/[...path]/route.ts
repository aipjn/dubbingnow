import { getBackend } from "@/server/backend";
import { randomUUID } from "node:crypto";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    return await getBackend().handle(request, (await context.params).path);
  } catch {
    const requestId = randomUUID();
    console.error(
      `Backend initialization failed (${requestId}). Check server configuration.`,
    );
    return Response.json(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "The service is temporarily unavailable.",
          retryable: true,
          requestId,
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export {
  handle as GET,
  handle as HEAD,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as OPTIONS,
};
