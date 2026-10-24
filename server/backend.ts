import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { z } from "zod";
import { languages } from "../lib/catalog";
import type { Job, JobResult, QuoteRequest } from "../lib/api/types";
import { loadConfig, type ServerConfig } from "./config";
import { type Actor, type JobRow } from "./store";
import { createStore, type DataStore } from "./persistence";
import { PrivateStorage } from "./storage";
import { BackendError, requireValue } from "./errors";
import {
  makeIdentityVerifier,
  makeHumanVerifier,
  type VerifyIdentity,
  type VerifyHuman,
} from "./auth";
import * as v from "./validation";
import { diskReady } from "./health";
export class Backend {
  readonly storage: PrivateStorage;
  private verifyIdentity: VerifyIdentity;
  private verifyHuman: VerifyHuman;
  private ready: (input: QuoteRequest) => boolean;
  constructor(
    readonly config: ServerConfig,
    readonly store: DataStore,
    options: {
      verifyIdentity?: VerifyIdentity;
      verifyHuman?: VerifyHuman;
      providerReady?: () => boolean;
      storage?: PrivateStorage;
    } = {},
  ) {
    this.storage = options.storage || new PrivateStorage(config, store);
    this.verifyIdentity =
      options.verifyIdentity || makeIdentityVerifier(config);
    this.verifyHuman = options.verifyHuman || makeHumanVerifier(config);
    this.ready =
      options.providerReady ||
      ((input) =>
        !!config.googleKey &&
        (input.voiceMode !== "clone" ||
          config.cloneProvider !== "fish" ||
          (!!config.fishKey &&
            (config.fishVoiceMode !== "per_job" ||
              config.fishAllowVoiceCreation === true) &&
            (!config.requireWorker || config.fishVoiceMode !== "saved_test"))));
  }
  private async actor(request: Request): Promise<Actor> {
    const header = request.headers.get("authorization");
    requireValue(
      header && header.startsWith("Bearer ") && header.length < 8192,
      "UNAUTHORIZED",
      "Sign in or start a guest session.",
      401,
    );
    await this.store.rate("auth:" + this.risk(request), 300, 60000);
    const token = header.slice(7);
    if (token.startsWith("guest_")) return await this.store.guestByToken(token);
    return await this.store.ensureUser(await this.verifyIdentity(token));
  }
  private ip(request: Request) {
    return this.config.trustProxy
      ? request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
          "unknown"
      : "local";
  }
  private risk(request: Request) {
    return v.hash(this.config.signingSecret + ":" + this.ip(request));
  }
  private async json<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
    requireValue(
      request.headers.get("content-type")?.split(";")[0] === "application/json",
      "INVALID_REQUEST",
      "Send JSON with Content-Type application/json.",
    );
    requireValue(request.body, "INVALID_REQUEST", "A JSON body is required.");
    const reader = request.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        requireValue(
          size <= 65536,
          "INVALID_REQUEST",
          "The request body is too large.",
          413,
        );
        chunks.push(value);
      }
      return schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch (err) {
      await reader.cancel().catch(() => {});
      if (err instanceof BackendError) throw err;
      throw new BackendError(
        "INVALID_REQUEST",
        "Invalid request fields or JSON body.",
      );
    } finally {
      reader.releaseLock();
    }
  }
  private key(request: Request) {
    const key = request.headers.get("idempotency-key");
    requireValue(
      key && z.string().uuid().safeParse(key).success,
      "INVALID_REQUEST",
      "Use a UUID Idempotency-Key for this request.",
    );
    return key;
  }
  private response(body: unknown, status = 200) {
    return Response.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }
  private async view(row: JobRow): Promise<Job> {
    let result: JobResult | null = row.result ? JSON.parse(row.result) : null;
    if (result) {
      delete (result as JobResult & { _storageKey?: string })._storageKey;
      requireValue(
        row.updated + this.config.retentionMs > Date.now() &&
          (await this.storage.resultExists(row.id)),
        "RESULT_EXPIRED",
        "This result has expired. Create a new recording.",
        410,
      );
      const asset = {
        url: this.storage.url("result", row.id, row.owner),
        filename: `dubbed-${row.id}.wav`,
        contentType: "audio/wav",
        expiresAt: new Date(Date.now() + 900000).toISOString(),
      };
      result = { ...result, preview: asset, download: asset };
    }
    return {
      id: row.id,
      status: row.status,
      progress: row.progress,
      createdAt: new Date(row.created).toISOString(),
      updatedAt: new Date(row.updated).toISOString(),
      pollAfterMs: 1000,
      cacheHit: false,
      result,
      error: row.error ? JSON.parse(row.error) : null,
    };
  }
  async handle(request: Request, segments: string[]): Promise<Response> {
    const origin = request.headers.get("origin"),
      headers: Record<string, string> = {
        "Cache-Control": "no-store",
        Vary: "Origin",
        "X-Content-Type-Options": "nosniff",
      };
    if (origin && this.config.allowedOrigins.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Headers"] =
        "Authorization,Content-Type,Idempotency-Key,Range";
      headers["Access-Control-Allow-Methods"] =
        "GET,HEAD,POST,PUT,PATCH,OPTIONS";
      headers["Access-Control-Expose-Headers"] =
        "Retry-After,Content-Range,Content-Length";
    }
    let response: Response;
    try {
      requireValue(
        !origin || this.config.allowedOrigins.includes(origin),
        "FORBIDDEN",
        "This origin is not allowed.",
        403,
      );
      if (request.method === "OPTIONS")
        response = new Response(null, { status: 204 });
      else response = await this.dispatch(request, segments);
    } catch (err) {
      const requestId = randomUUID();
      if (!(err instanceof BackendError))
        console.error(
          `Backend request ${requestId} failed (${err instanceof Error ? err.name : "unknown"}).`,
        );
      const error =
        err instanceof BackendError
          ? err
          : new BackendError(
              "SERVICE_UNAVAILABLE",
              "The service is temporarily unavailable.",
              500,
              true,
            );
      response = this.response(
        {
          error: {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
            requestId,
          },
        },
        error.status,
      );
      if (error.status === 429) response.headers.set("Retry-After", "60");
    }
    for (const [key, value] of Object.entries(headers))
      response.headers.set(key, value);
    return response;
  }
  private async dispatch(
    request: Request,
    segments: string[],
  ): Promise<Response> {
    const method = request.method,
      path = segments.join("/"),
      url = new URL(request.url);
    if (["health", "ready"].includes(path) && method === "GET") {
      await this.store.recoverExpiredJobs();
      const worker = await this.store.workerHealthy();
      const disk = await diskReady(this.config);
      const providers =
        !!this.config.googleKey &&
        (this.config.cloneProvider !== "fish" || !!this.config.fishKey);
      const ready =
        disk &&
        providers &&
        (!this.config.requireWorker || worker) &&
        this.config.acceptingJobs !== false;
      return this.response(
        {
          status: path === "health" ? "ok" : ready ? "ready" : "unavailable",
          provider: "google-gemini",
          worker,
          disk,
          configured: {
            google: !!this.config.googleKey,
            fish: !!this.config.fishKey,
            auth0: !!(this.config.authIssuer && this.config.authAudience),
            turnstile: !!this.config.turnstileSecret,
          },
        },
        path === "ready" && !ready ? 503 : 200,
      );
    }
    if (path === "capabilities" && method === "GET")
      return this.response({
        languages: languages.map((l) => ({
          code: l.code,
          name: l.name,
          supportsSource: true,
          supportsTarget: true,
        })),
        maxFileBytes: this.config.maxFileBytes,
        maxSpeakers: this.config.maxSpeakers ?? 8,
        acceptedContentTypes: ["audio/mp4", "audio/mpeg", "audio/wav"],
        voiceCloning: {
          enabled:
            this.config.cloneProvider !== "fish" ||
            (!!this.config.fishKey &&
              (this.config.fishVoiceMode === "per_job"
                ? this.config.fishAllowVoiceCreation === true
                : this.config.fishVoiceMode !== "saved_test" ||
                  !this.config.requireWorker)),
          provider: this.config.cloneProvider || "google",
          requiresConsentRecording: this.config.cloneProvider !== "fish",
          singleVoiceTest:
            this.config.cloneProvider === "fish" &&
            this.config.fishVoiceMode === "saved_test",
        },
      });
    if (path === "billing/policy" && method === "GET")
      return this.response(await this.store.policy());
    if (path === "billing/plans" && method === "GET")
      return this.response([
        {
          id: "free",
          name: "Free",
          amountMinor: 0,
          currency: "USD",
          includedCredits: (await this.store.policy()).signupCredits,
          available: true,
        },
        {
          id: "creator",
          name: "Creator",
          amountMinor: null,
          currency: "USD",
          includedCredits: 1000,
          available: false,
        },
        {
          id: "studio",
          name: "Studio",
          amountMinor: null,
          currency: "USD",
          includedCredits: 5000,
          available: false,
        },
      ]);
    if (path === "sessions" && method === "POST") {
      await this.json(request, v.emptyBody);
      const risk = this.risk(request);
      await this.store.rate("sessions:" + risk, 20, 86400000);
      return this.response(await this.store.createGuest(risk), 201);
    }
    if (
      segments[0] === "files" &&
      segments[1] === "upload" &&
      segments.length === 3 &&
      method === "PUT"
    ) {
      await this.storage.put(
        request,
        segments[2],
        url.searchParams.get("ticket"),
      );
      return new Response(null, { status: 204 });
    }
    if (
      segments[0] === "files" &&
      segments[1] === "result" &&
      segments.length === 3 &&
      ["GET", "HEAD"].includes(method)
    )
      return this.fileResult(
        request,
        segments[2],
        url.searchParams.get("ticket"),
      );
    const actor = await this.actor(request);
    await this.store.rate("api:" + actor.id, 180, 60000);
    await this.store.recoverExpiredJobs();
    if (path === "jobs" && method === "GET") {
      const page = await this.store.jobPage(
        actor,
        url.searchParams.get("cursor") || undefined,
      );
      return this.response({
        items: await Promise.all(
          page.rows.map(async (row) => {
            const expires = row.updated + this.config.retentionMs;
            return {
              id: row.id,
              status: row.status,
              createdAt: new Date(row.created).toISOString(),
              targetLanguage: JSON.parse(row.input).targetLanguage,
              durationSeconds: row.duration,
              resultAvailable:
                row.status === "completed" &&
                expires > Date.now() &&
                (await this.storage.resultExists(row.id)),
              resultExpiresAt:
                row.status === "completed"
                  ? new Date(expires).toISOString()
                  : null,
            };
          }),
        ),
        nextCursor: page.nextCursor,
      });
    }
    if (path === "quota" && method === "GET")
      return this.response(await this.store.quota(actor));
    if (path === "guest/verify" && method === "POST") {
      requireValue(
        actor.kind === "guest",
        "INVALID_REQUEST",
        "Guest verification requires a guest session.",
      );
      const input = await this.json(request, v.humanBody);
      await this.store.rate("verify:" + this.risk(request), 30, 60000);
      await this.verifyHuman(
        input.token,
        this.config.trustProxy ? this.ip(request) : undefined,
      );
      return this.response(await this.store.verifyGuest(actor, input.token));
    }
    if (path === "users/me" && method === "GET")
      return this.response(await this.store.requireUser(actor));
    if (path === "users/me" && method === "PATCH")
      return this.response(
        await this.store.updateProfile(
          actor,
          (await this.json(request, v.profileBody)).displayName,
        ),
      );
    if (path === "credits/transactions" && method === "GET")
      return this.response(
        await this.store.history(
          actor,
          url.searchParams.get("cursor") || undefined,
        ),
      );
    if (path === "uploads" && method === "POST") {
      await this.store.rate("upload:" + actor.id, 20, 3600000);
      requireValue(
        await diskReady(this.config),
        "SERVICE_UNAVAILABLE",
        "Uploads are temporarily unavailable. Please retry shortly.",
        503,
        true,
      );
      const input = await this.json(request, v.uploadBody),
        row = await this.store.newUpload(actor, input);
      return this.response(await this.storage.uploadTicket(row, input), 201);
    }
    if (
      segments[0] === "uploads" &&
      segments[2] === "complete" &&
      segments.length === 3 &&
      method === "POST"
    ) {
      await this.json(request, v.emptyBody);
      return this.response(await this.storage.complete(actor.id, segments[1]));
    }
    if (path === "jobs/quote" && method === "POST") {
      await this.store.rate("quotes:" + actor.id, 60, 3600000);
      return this.response(
        await this.store.quote(actor, await this.json(request, v.quoteBody)),
        201,
      );
    }
    if (path === "jobs" && method === "POST") {
      const input = await this.json(request, v.jobBody);
      return this.response(
        await this.view(
          await this.store.createJob(
            actor,
            input,
            this.key(request),
            this.ready(input) && (await diskReady(this.config)),
          ),
        ),
        202,
      );
    }
    if (segments[0] === "jobs" && segments.length === 2 && method === "GET")
      return this.response(
        await this.view(await this.store.job(actor, segments[1])),
      );
    if (
      segments[0] === "jobs" &&
      segments[2] === "cancel" &&
      segments.length === 3 &&
      method === "POST"
    ) {
      await this.json(request, v.emptyBody);
      return this.response(
        await this.view(await this.store.cancel(actor, segments[1])),
      );
    }
    if (path === "admin/users" && method === "GET")
      return this.response(
        await this.store.listUsers(
          actor,
          (url.searchParams.get("query") || "").slice(0, 254),
          url.searchParams.get("cursor") || undefined,
        ),
      );
    if (
      segments[0] === "admin" &&
      segments[1] === "users" &&
      segments.length === 3 &&
      method === "PATCH"
    )
      return this.response(
        await this.store.updateUser(
          actor,
          segments[2],
          (await this.json(request, v.statusBody)).status,
        ),
      );
    if (
      segments[0] === "admin" &&
      segments[1] === "users" &&
      segments[3] === "credits" &&
      segments.length === 4 &&
      method === "POST"
    ) {
      const input = await this.json(request, v.adjustmentBody);
      return this.response(
        await this.store.adjustCredits(
          actor,
          segments[2],
          input.deltaCredits,
          input.reason,
          this.key(request),
        ),
      );
    }
    if (path === "admin/billing/policy" && method === "PUT")
      return this.response(
        await this.store.updatePolicy(
          actor,
          await this.json(request, v.policyBody),
        ),
      );
    if (path === "billing/checkout" && method === "POST") {
      await this.store.requireUser(actor);
      throw new BackendError(
        "SERVICE_UNAVAILABLE",
        "Credit purchases are not enabled yet.",
        503,
      );
    }
    if (
      segments[0] === "billing" &&
      segments[1] === "checkouts" &&
      segments.length === 3 &&
      method === "GET"
    ) {
      await this.store.requireUser(actor);
      throw new BackendError(
        "CHECKOUT_EXPIRED",
        "No active checkout was found.",
        410,
      );
    }
    throw new BackendError(
      "INVALID_REQUEST",
      "API route or method not found.",
      404,
    );
  }
  private async fileResult(request: Request, id: string, token: string | null) {
    const ticket = await this.storage.verify(token, "result", id),
      row = await this.store.job(await this.store.actor(ticket.owner), id);
    requireValue(
      row.status === "completed" &&
        row.updated + this.config.retentionMs > Date.now() &&
        (await this.storage.resultExists(id)),
      "RESULT_EXPIRED",
      "This result has expired.",
      410,
    );
    if (this.storage.r2) {
      const key = await this.storage.resultKey(id);
      requireValue(key, "RESULT_EXPIRED", "This result is unavailable.", 410);
      return new Response(null, {
        status: 307,
        headers: {
          Location: await this.storage.r2.resultUrl(
            key,
            request.method === "HEAD",
          ),
        },
      });
    }
    const filename = this.storage.file(id, "result"),
      size = (await stat(filename)).size;
    let start = 0,
      end = size - 1,
      status = 200;
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      requireValue(
        match && (match[1] || match[2]),
        "INVALID_REQUEST",
        "Invalid byte range.",
        416,
      );
      if (!match[1]) start = Math.max(0, size - Number(match[2]));
      else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(size - 1, Number(match[2]));
      }
      requireValue(
        Number.isSafeInteger(start) &&
          Number.isSafeInteger(end) &&
          start >= 0 &&
          start <= end &&
          start < size,
        "INVALID_REQUEST",
        "Requested range is not available.",
        416,
      );
      status = 206;
    }
    const headers: Record<string, string> = {
      "Content-Type": "audio/wav",
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
      "Content-Disposition": `inline; filename="dubbed-${id}.wav"`,
    };
    if (status === 206)
      headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    return new Response(
      request.method === "HEAD"
        ? null
        : (Readable.toWeb(
            createReadStream(filename, { start, end }),
          ) as ReadableStream),
      { status, headers },
    );
  }
}
let singleton: Backend | undefined;
export function getBackend() {
  return (singleton ||= (() => {
    const config = loadConfig();
    return new Backend(config, createStore(config));
  })());
}
