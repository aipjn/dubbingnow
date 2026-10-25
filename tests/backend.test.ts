import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { generateKeyPair, SignJWT } from "jose";
import { Backend } from "../server/backend";
import { Store, type Actor } from "../server/store";
import type { ServerConfig } from "../server/config";
import { makeIdentityVerifier, makeHumanVerifier } from "../server/auth";
import { hash } from "../server/validation";
import { wavHeader, probe, runMedia } from "../server/media";
import { Processor } from "../server/processor";
import { GoogleProvider } from "../server/providers/google";
import { HttpDubbingApi } from "../lib/api/http";
import { cleanup } from "../server/maintenance";
import { FishDubbingProvider } from "../server/providers/fish";
const config = (dir: string): ServerConfig => ({
  dataDir: dir,
  origin: "http://127.0.0.1:3000",
  signingSecret: "test-signing-secret-not-for-production-12345",
  googleKey: "",
  textModel: "gemini-3.8-flash",
  standardTtsModel: "gemini-3.8-flash-lite-tts",
  fidelityTtsModel: "gemini-3.8-flash-tts",
  ffmpeg: process.env.FFMPEG_PATH || "ffmpeg",
  ffprobe: process.env.FFPROBE_PATH || "ffprobe",
  authIssuer: "https://auth.test/",
  authAudience: "https://api.test",
  adminSubjects: ["admin"],
  turnstileSecret: "",
  allowedOrigins: ["http://127.0.0.1:3000"],
  trustProxy: false,
  guestIpUses: 3,
  maxFileBytes: 500000000,
  retentionMs: 86400000,
  maxSegments: 600,
});
async function fixture(
  options: { dispatchJob?: (id: string) => Promise<void> } = {},
) {
  const dir = await mkdtemp(path.join(tmpdir(), "dubbing-backend-")),
    c = config(dir),
    store = new Store(c),
    backend = new Backend(c, store, {
      providerReady: () => true,
      verifyIdentity: async (token) => {
        if (!["user", "other", "admin"].includes(token))
          throw Error("unexpected identity");
        return {
          issuer: c.authIssuer,
          subject: token,
          email: `${token}@example.test`,
          name: token,
        };
      },
      verifyHuman: async () => {},
      ...options,
    });
  return {
    dir,
    c,
    store,
    backend,
    async close() {
      store.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
async function call(
  b: Backend,
  method: string,
  endpoint: string,
  token?: string,
  body?: unknown,
  key?: string,
) {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${b.config.origin}/v1/${endpoint}`;
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  if (key) headers["Idempotency-Key"] = key;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await b.handle(
    new Request(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    new URL(url).pathname.replace("/v1/", "").split("/"),
  );
  return {
    response,
    body: response.status === 204 ? null : await response.json(),
  };
}
function audio(seconds = 2) {
  const pcm = Buffer.alloc(seconds * 24000 * 2);
  for (let i = 0; i < pcm.length / 2; i++)
    pcm.writeInt16LE(
      Math.round(Math.sin((i * 2 * Math.PI * 440) / 24000) * 2000),
      i * 2,
    );
  return Buffer.concat([wavHeader(pcm.length / 2), pcm]);
}
async function decodedPcm(c: ServerConfig, file: string, target: string) {
  await runMedia(c.ffmpeg, [
    "-v",
    "error",
    "-y",
    "-i",
    file,
    "-ac",
    "1",
    "-ar",
    "24000",
    "-f",
    "s16le",
    target,
  ]);
  return readFile(target);
}
async function upload(b: Backend, token: string, bytes = audio()) {
  const ticket = await call(b, "POST", "uploads", token, {
    filename: "test.wav",
    contentType: "audio/wav",
    sizeBytes: bytes.length,
    sha256: hash(bytes),
  });
  assert.equal(ticket.response.status, 201, JSON.stringify(ticket.body));
  const url = new URL(ticket.body.url);
  const put = await b.handle(
    new Request(url, {
      method: "PUT",
      headers: { "Content-Type": "audio/wav" },
      body: bytes,
    }),
    url.pathname.replace("/v1/", "").split("/"),
  );
  assert.equal(put.status, 204, await put.text());
  const completed = await call(
    b,
    "POST",
    `uploads/${ticket.body.id}/complete`,
    token,
    {},
  );
  assert.equal(completed.response.status, 200, JSON.stringify(completed.body));
  return ticket.body.id as string;
}
async function priced(
  b: Backend,
  token = "user",
  timeline?: { durationSeconds: number; audioOffsetSeconds: number },
) {
  const uploadId = await upload(b, token);
  const input = {
    uploadId,
    sourceLanguage: "auto",
    targetLanguage: "es",
    voiceTier: "standard",
    ...(timeline ? { timeline } : {}),
  };
  const quote = await call(b, "POST", "jobs/quote", token, input);
  assert.equal(quote.response.status, 201, JSON.stringify(quote.body));
  return { ...input, quoteId: quote.body.id };
}

test("durable delivery is confirmed before accepting a task and repeated requests reserve credits once", async () => {
  const delivered: string[] = [];
  const f = await fixture({
    dispatchJob: async (id) => {
      delivered.push(id);
    },
  });
  try {
    const input = await priced(f.backend),
      key = randomUUID();
    const first = await call(f.backend, "POST", "jobs", "user", input, key);
    const second = await call(f.backend, "POST", "jobs", "user", input, key);
    assert.equal(first.response.status, 202);
    assert.equal(second.body.id, first.body.id);
    assert.deepEqual(delivered, [first.body.id, first.body.id]);
    const history = await f.store.history(
      f.store.ensureUser({
        issuer: f.c.authIssuer,
        subject: "user",
        email: "user@example.test",
        name: "user",
      }),
    );
    assert.equal(
      history.items.filter((entry) => entry.type === "reserve").length,
      1,
    );
  } finally {
    await f.close();
  }
});

test("queue publication failure cancels an unstarted task and returns its full reservation", async () => {
  const f = await fixture({
    dispatchJob: async () => {
      throw new Error("queue unavailable");
    },
  });
  try {
    const input = await priced(f.backend);
    const before = (await call(f.backend, "GET", "quota", "user")).body;
    const result = await call(
      f.backend,
      "POST",
      "jobs",
      "user",
      input,
      randomUUID(),
    );
    assert.equal(result.response.status, 503);
    assert.equal(result.body.error.retryable, true);
    const after = (await call(f.backend, "GET", "quota", "user")).body;
    assert.equal(after.availableCredits, before.availableCredits);
    assert.equal(after.reservedCredits, 0);
    assert.equal(
      f.store.get<{ status: string }>("SELECT status FROM jobs")?.status,
      "cancelled",
    );
  } finally {
    await f.close();
  }
});

test("an ambiguous publish response never cancels work already claimed by a consumer", async () => {
  const f = await fixture({
    dispatchJob: async (id) => {
      assert.equal(f.store.claim(id)?.id, id);
      throw new Error("response lost");
    },
  });
  try {
    const input = await priced(f.backend);
    const result = await call(
      f.backend,
      "POST",
      "jobs",
      "user",
      input,
      randomUUID(),
    );
    assert.equal(result.response.status, 202);
    assert.equal(result.body.status, "transcribing");
    assert.ok(
      (await call(f.backend, "GET", "quota", "user")).body.reservedCredits > 0,
    );
  } finally {
    await f.close();
  }
});

test("Fish clone jobs need only the source upload and reuse the fixed voice across short jobs without creating or deleting models", async () => {
  const f = await fixture();
  try {
    f.c.cloneProvider = "fish";
    f.c.googleKey = "test-only-google-key";
    f.c.fishKey = "test-fish-key";
    f.c.fishVoiceId = "fixed-test-voice";
    f.c.fishVoiceMode = "saved_test";
    const requests: string[] = [];
    const provider = new FishDubbingProvider(f.c, async (url, init) => {
      const endpoint = new URL(String(url)).pathname;
      requests.push(`${init?.method || "GET"} ${endpoint}`);
      if (endpoint === "/model/fixed-test-voice")
        return Response.json({ _id: "fixed-test-voice", state: "trained" });
      const body = JSON.parse(String(init?.body));
      if (endpoint === "/v1/tts") {
        assert.equal(body.reference_id, "fixed-test-voice");
        assert.equal(body.references, undefined);
        return new Response(new Uint8Array(audio(1)));
      }
      assert.equal(endpoint, "/v1beta/interactions");
      const data = Array.isArray(body.input)
        ? {
            language: "en",
            segments: [
              { start: 0, end: 1, speaker: 0, text: "First sentence." },
              { start: 1, end: 2, speaker: 0, text: "Second sentence." },
            ],
          }
        : {
            segments: [
              { index: 0, text: "Primera frase." },
              { index: 1, text: "Segunda frase." },
            ],
          };
      return Response.json({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [{ type: "text", text: JSON.stringify(data) }],
          },
        ],
      });
    });
    const source = await upload(f.backend, "user");
    for (let i = 0; i < 2; i++) {
      const input = {
        uploadId: source,
        sourceLanguage: "en",
        targetLanguage: "es",
        voiceTier: "standard",
        voiceMode: "clone",
      };
      const quote = await call(f.backend, "POST", "jobs/quote", "user", input);
      assert.equal(quote.response.status, 201);
      const created = await call(
        f.backend,
        "POST",
        "jobs",
        "user",
        { ...input, quoteId: quote.body.id },
        randomUUID(),
      );
      await new Processor(f.store, f.backend.storage, provider).runOnce();
      const job = (
        await call(f.backend, "GET", `jobs/${created.body.id}`, "user")
      ).body;
      assert.equal(job.status, "completed", JSON.stringify(job.error));
      assert.equal(job.result.voiceMode, "clone");
      const report = JSON.parse(
        await readFile(path.join(f.dir, "metrics", job.id + ".json"), "utf8"),
      );
      assert.equal(report.cloneProvider, "fish");
      assert.equal(report.savedVoiceReused, true);
      assert.equal(report.timings.phases.replicate, undefined);
    }
    assert.equal(requests.filter((r) => r === "POST /v1/tts").length, 4);
    assert.equal(
      requests.some((r) => r === "POST /model" || r.startsWith("DELETE")),
      false,
    );
    const caps = (await call(f.backend, "GET", "capabilities")).body;
    assert.deepEqual(caps.voiceCloning, {
      enabled: true,
      provider: "fish",
      requiresConsentRecording: false,
      singleVoiceTest: true,
    });
  } finally {
    await f.close();
  }
});

test("clone jobs use one stateless same-speaker voice, validate owned consent before charging, and keep voice keys out of metrics", async () => {
  const f = await fixture();
  try {
    const uploadId = await upload(f.backend, "user", audio(18));
    const consentId = await upload(f.backend, "user", audio(2));
    const foreignConsent = await upload(f.backend, "other", audio(2));
    const input = {
      uploadId,
      sourceLanguage: "en",
      targetLanguage: "es",
      voiceTier: "standard",
      voiceMode: "clone",
      consentUploads: [{ speaker: 0, uploadId: consentId }],
    };
    assert.equal(
      (
        await call(f.backend, "POST", "jobs/quote", "user", {
          ...input,
          consentUploads: [],
        })
      ).response.status,
      400,
    );
    assert.equal(
      (
        await call(f.backend, "POST", "jobs/quote", "user", {
          ...input,
          consentUploads: [{ speaker: 0, uploadId: foreignConsent }],
        })
      ).response.status,
      404,
    );
    assert.equal(
      (
        await call(f.backend, "POST", "jobs/quote", "user", {
          ...input,
          consentUploads: [input.consentUploads[0], input.consentUploads[0]],
        })
      ).response.status,
      400,
    );
    assert.equal(
      (await call(f.backend, "GET", "quota", "user")).body.availableCredits,
      500,
    );
    const quote = await call(f.backend, "POST", "jobs/quote", "user", input);
    assert.equal(quote.response.status, 201);
    const created = await call(
      f.backend,
      "POST",
      "jobs",
      "user",
      { ...input, quoteId: quote.body.id },
      randomUUID(),
    );
    const requests: { endpoint: string; body: any }[] = [];
    const provider = new GoogleProvider(
      { ...f.c, googleKey: "test-only-key" },
      async (url, init) => {
        const body = JSON.parse(String(init?.body));
        const endpoint = String(url).endsWith("/voices")
          ? "voices"
          : "interactions";
        requests.push({ endpoint, body });
        if (endpoint === "voices") {
          assert.equal(body.store, false);
          assert.equal(body.voice.type, "replicated");
          const reference = Buffer.from(
            body.voice.replicated.source_audio.data,
            "base64",
          );
          assert.ok(reference.length >= 18 * 24000 * 2);
          assert.ok(body.voice.replicated.consent_audio.data);
          return Response.json({ key: "voicekey_test_private" });
        }
        const content =
          body.response_format.type === "audio"
            ? [
                {
                  type: "audio",
                  mime_type: "audio/wav",
                  data: audio(9).toString("base64"),
                },
              ]
            : [
                {
                  type: "text",
                  text: JSON.stringify(
                    Array.isArray(body.input)
                      ? {
                          language: "en",
                          segments: [
                            {
                              start: 0,
                              end: 9,
                              speaker: 0,
                              text: "This is a clear sentence with enough varied speech.",
                              referenceQuality: {
                                cleanSpeech: true,
                                naturalDelivery: true,
                                overlappingSpeech: false,
                              },
                            },
                            {
                              start: 9,
                              end: 18,
                              speaker: 0,
                              text: "This is the second complete sentence.",
                              referenceQuality: {
                                cleanSpeech: true,
                                naturalDelivery: true,
                                overlappingSpeech: false,
                              },
                            },
                          ],
                        }
                      : {
                          segments: [
                            { index: 0, text: "Esta es una frase clara." },
                            { index: 1, text: "Segunda frase." },
                          ],
                        },
                  ),
                },
              ];
        return Response.json({
          status: "completed",
          steps: [{ type: "model_output", content }],
        });
      },
    );
    // Cleanup must pin consent files too while the job is unsettled.
    f.store.run("UPDATE uploads SET created=0 WHERE id=?", consentId);
    await cleanup(f.store);
    assert.ok(
      f.store.upload(
        f.store.actor(
          f.store.get<{ owner: string }>(
            "SELECT owner FROM uploads WHERE id=?",
            consentId,
          )!.owner,
        ),
        consentId,
      ),
    );
    await new Processor(f.store, f.backend.storage, provider).runOnce();
    const job = (
      await call(f.backend, "GET", `jobs/${created.body.id}`, "user")
    ).body;
    assert.equal(job.status, "completed");
    assert.equal(job.result.voiceMode, "clone");
    assert.equal(requests.filter((r) => r.endpoint === "voices").length, 1);
    const synthesis = requests.filter(
      (r) => r.body.response_format?.type === "audio",
    );
    assert.equal(synthesis.length, 2);
    assert.ok(
      synthesis.every(
        (r) =>
          r.body.generation_config.speech_config[0].voice ===
          "voicekey_test_private",
      ),
    );
    const report = await readFile(
      path.join(f.dir, "metrics", job.id + ".json"),
      "utf8",
    );
    assert.equal(report.includes("voicekey_"), false);
    assert.equal(report.includes("clear sentence"), false);
    assert.equal(JSON.parse(report).references[0].end, 18);
    assert.ok(JSON.parse(report).timings.phases.replicate.calls === 1);
  } finally {
    await f.close();
  }
});

test("clone reference failure has no preset fallback and refunds once", async () => {
  const f = await fixture();
  try {
    const input = {
      uploadId: await upload(f.backend, "user", audio(18)),
      sourceLanguage: "en",
      targetLanguage: "es",
      voiceTier: "standard",
      voiceMode: "clone",
      consentUploads: [
        { speaker: 0, uploadId: await upload(f.backend, "user") },
      ],
    };
    const quote = (await call(f.backend, "POST", "jobs/quote", "user", input))
      .body;
    const created = (
      await call(
        f.backend,
        "POST",
        "jobs",
        "user",
        { ...input, quoteId: quote.id },
        randomUUID(),
      )
    ).body;
    let calls = 0;
    await new Processor(f.store, f.backend.storage, {
      transcribe: async () => ({
        language: "en",
        segments: [
          { start: 0, end: 18, speaker: 0, text: "No quality flags." },
        ],
      }),
      translate: async (s) => s,
      replicate: async () => {
        calls++;
        return "voicekey_test";
      },
      speak: async () => {
        calls++;
        return audio();
      },
    }).runOnce();
    assert.equal(calls, 0);
    assert.equal(
      (await call(f.backend, "GET", `jobs/${created.id}`, "user")).body.status,
      "failed",
    );
    assert.equal(
      (await call(f.backend, "GET", "quota", "user")).body.availableCredits,
      500,
    );
  } finally {
    await f.close();
  }
});

test("backend signup is persistent and atomic; identity, permissions and admin adjustments are enforced", async () => {
  const f = await fixture();
  try {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        call(f.backend, "GET", "users/me", "user"),
      ),
    );
    assert.equal(new Set(responses.map((r) => r.body.id)).size, 1);
    const id = responses[0].body.id;
    assert.equal(
      (await call(f.backend, "GET", "quota", "user")).body.availableCredits,
      500,
    );
    assert.equal(
      (await call(f.backend, "GET", "credits/transactions", "user")).body.items
        .length,
      1,
    );
    assert.equal(
      (await call(f.backend, "GET", "admin/users", "user")).response.status,
      403,
    );
    const key = randomUUID(),
      input = { deltaCredits: 25, reason: "Support adjustment" };
    await call(
      f.backend,
      "POST",
      `admin/users/${id}/credits`,
      "admin",
      input,
      key,
    );
    await call(
      f.backend,
      "POST",
      `admin/users/${id}/credits`,
      "admin",
      input,
      key,
    );
    assert.equal(
      (await call(f.backend, "GET", "quota", "user")).body.availableCredits,
      525,
    );
    assert.equal(
      (
        await call(
          f.backend,
          "POST",
          `admin/users/${id}/credits`,
          "admin",
          { ...input, deltaCredits: 26 },
          key,
        )
      ).response.status,
      409,
    );
    assert.equal(
      (
        await call(f.backend, "PATCH", "users/me", "user", {
          displayName: "Hacker",
          role: "admin",
        })
      ).response.status,
      400,
    );
    const reopened = new Store(f.c);
    try {
      assert.equal(reopened.managed(id).availableCredits, 525);
    } finally {
      reopened.close();
    }
    await call(f.backend, "PATCH", `admin/users/${id}`, "admin", {
      status: "suspended",
    });
    assert.equal(
      (await call(f.backend, "GET", "quota", "user")).response.status,
      403,
    );
    await call(f.backend, "PATCH", `admin/users/${id}`, "admin", {
      status: "active",
    });
    assert.equal(
      (await call(f.backend, "GET", "quota", "user")).response.status,
      200,
    );
  } finally {
    await f.close();
  }
});

test("signed uploads verify bytes, format, owner and server duration; guest grant replay and 30-second limit fail closed", async () => {
  const f = await fixture();
  try {
    const guest = (await call(f.backend, "POST", "sessions", undefined, {}))
      .body;
    assert.equal(
      (
        await call(f.backend, "POST", "uploads", guest.token, {
          filename: "test.wav",
          contentType: "audio/wav",
          sizeBytes: 100,
          sha256: "a".repeat(64),
        })
      ).response.status,
      403,
    );
    await call(f.backend, "POST", "guest/verify", guest.token, {
      token: "human-token",
    });
    assert.equal(
      (
        await call(f.backend, "POST", "guest/verify", guest.token, {
          token: "human-token",
        })
      ).response.status,
      403,
    );
    const uploadId = await upload(f.backend, guest.token);
    assert.equal(
      (
        await call(
          f.backend,
          "POST",
          `uploads/${uploadId}/complete`,
          "other",
          {},
        )
      ).response.status,
      404,
    );
    const quote = await call(f.backend, "POST", "jobs/quote", guest.token, {
      uploadId,
      sourceLanguage: "auto",
      targetLanguage: "es",
      voiceTier: "standard",
      timeline: { durationSeconds: 31, audioOffsetSeconds: 0 },
    });
    assert.equal(quote.body.error.code, "TRIAL_LIMIT_EXCEEDED");
    const long = audio(31),
      ticket = (
        await call(f.backend, "POST", "uploads", guest.token, {
          filename: "long.wav",
          contentType: "audio/wav",
          sizeBytes: long.length,
          sha256: hash(long),
        })
      ).body;
    let url = new URL(ticket.url);
    assert.equal(
      (
        await f.backend.handle(
          new Request(url, {
            method: "PUT",
            headers: { "Content-Type": "audio/wav" },
            body: long,
          }),
          url.pathname.replace("/v1/", "").split("/"),
        )
      ).status,
      204,
    );
    assert.equal(
      (
        await call(
          f.backend,
          "POST",
          `uploads/${ticket.id}/complete`,
          guest.token,
          {},
        )
      ).body.error.code,
      "TRIAL_LIMIT_EXCEEDED",
    );
    url.searchParams.set(
      "ticket",
      url.searchParams.get("ticket")!.slice(0, -5) + "wrong",
    );
    assert.equal(
      (
        await f.backend.handle(
          new Request(url, { method: "PUT", body: long }),
          url.pathname.replace("/v1/", "").split("/"),
        )
      ).status,
      401,
    );
    const bytes = audio(),
      bad = (
        await call(f.backend, "POST", "uploads", "user", {
          filename: "bad.wav",
          contentType: "audio/wav",
          sizeBytes: bytes.length,
          sha256: "a".repeat(64),
        })
      ).body;
    url = new URL(bad.url);
    const wrong = await f.backend.handle(
      new Request(url, {
        method: "PUT",
        headers: { "Content-Type": "audio/wav" },
        body: bytes,
      }),
      url.pathname.replace("/v1/", "").split("/"),
    );
    assert.equal((await wrong.json()).error.code, "UPLOAD_INCOMPLETE");
  } finally {
    await f.close();
  }
});

test("quotes freeze rates; concurrent retries reserve once, missing key does not charge, and cancellation refunds exactly once", async () => {
  const f = await fixture();
  try {
    const input = await priced(f.backend),
      key = randomUUID();
    const notReady = new Backend(f.c, f.store, {
      verifyIdentity: async () => ({
        issuer: f.c.authIssuer,
        subject: "user",
        email: "user@example.test",
        name: "user",
      }),
    });
    assert.equal(
      (await call(notReady, "POST", "jobs", "user", input, key)).body.error
        .code,
      "SERVICE_UNAVAILABLE",
    );
    assert.equal(
      (await call(f.backend, "GET", "quota", "user")).body.availableCredits,
      500,
    );
    const old = f.store.policy();
    await call(f.backend, "PUT", "admin/billing/policy", "admin", {
      ...old,
      creditsPerMinute: { standard: 120, high_fidelity: 240 },
    });
    assert.equal(
      (await call(f.backend, "PUT", "admin/billing/policy", "admin", old))
        .response.status,
      409,
    );
    const googleOnlyBackend = new Backend(
      { ...f.c, googleKey: "test-only-key" },
      f.store,
      {
        verifyIdentity: async () => ({
          issuer: f.c.authIssuer,
          subject: "user",
          email: "user@example.test",
          email_verified: true,
          name: "user",
        }),
      },
    );
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        call(googleOnlyBackend, "POST", "jobs", "user", input, key),
      ),
    );
    assert.equal(new Set(responses.map((r) => r.body.id)).size, 1);
    const job = responses[0].body;
    assert.equal(
      (await call(f.backend, "GET", "quota", "user")).body.availableCredits,
      499,
    );
    assert.equal(
      (await call(f.backend, "GET", "quota", "user")).body.reservedCredits,
      1,
    );
    assert.equal(
      (await call(f.backend, "POST", "jobs", "user", input, randomUUID()))
        .response.status,
      409,
    );
    assert.equal(
      (await call(f.backend, "GET", `jobs/${job.id}`, "other")).response.status,
      404,
    );
    await call(f.backend, "POST", `jobs/${job.id}/cancel`, "user", {});
    await call(f.backend, "POST", `jobs/${job.id}/cancel`, "user", {});
    assert.equal(
      (await call(f.backend, "GET", "quota", "user")).body.availableCredits,
      500,
    );
    assert.equal(
      (
        await call(f.backend, "GET", "credits/transactions", "user")
      ).body.items.filter((entry: { type: string }) => entry.type === "release")
        .length,
      1,
    );
  } finally {
    await f.close();
  }
});

test("worker uses Google request adapter, real FFmpeg timing and signed range downloads; failure and lease loss refund once", async () => {
  const f = await fixture();
  try {
    const input = await priced(f.backend, "user", {
        durationSeconds: 3,
        audioOffsetSeconds: 1,
      }),
      created = await call(
        f.backend,
        "POST",
        "jobs",
        "user",
        input,
        randomUUID(),
      );
    const calls: Record<string, any>[] = [];
    const provider = new GoogleProvider(
      { ...f.c, googleKey: "test-only-key" },
      async (_url, init) => {
        assert.equal(
          new Headers(init?.headers).get("x-goog-api-key"),
          "test-only-key",
        );
        const body = JSON.parse(String(init?.body));
        calls.push(body);
        assert.equal(body.store, false);
        if (body.response_format.type === "text") {
          const schema = JSON.stringify(body.response_format.schema);
          // The live provider rejected these Zod validation keywords.
          for (const keyword of [
            "$schema",
            "additionalProperties",
            "exclusiveMinimum",
            "minimum",
            "maximum",
            "minLength",
            "maxLength",
            "maxItems",
          ])
            assert.equal(schema.includes(`"${keyword}"`), false);
          assert.equal(body.response_format.schema.type, "object");
          assert.ok(
            body.response_format.schema.properties.segments.items.properties
              .text,
          );
        }
        const content =
          body.response_format.type === "audio"
            ? [
                {
                  type: "audio",
                  mime_type: "audio/wav",
                  data: audio(1).toString("base64"),
                },
              ]
            : [
                {
                  type: "text",
                  text: JSON.stringify(
                    Array.isArray(body.input)
                      ? {
                          language: "en",
                          segments: [
                            { start: 0, end: 1, speaker: 0, text: "Hello." },
                          ],
                        }
                      : { segments: [{ index: 0, text: "Hola." }] },
                  ),
                },
              ];
        return new Response(
          JSON.stringify({
            status: "completed",
            steps: [{ type: "model_output", content }],
          }),
        );
      },
    );
    const processor = new Processor(f.store, f.backend.storage, provider);
    assert.equal(await processor.runOnce(), true);
    assert.equal(calls.length, 3);
    assert.equal(calls[2].model, f.c.standardTtsModel);
    const job = (
      await call(f.backend, "GET", `jobs/${created.body.id}`, "user")
    ).body;
    assert.equal(job.status, "completed");
    assert.equal(job.result.isDemo, false);
    assert.equal(job.result.durationSeconds, 3);
    assert.equal(
      (await probe(f.c, f.backend.storage.file(job.id, "result"))).duration,
      3,
    );
    const wav = await decodedPcm(
      f.c,
      f.backend.storage.file(job.id, "result"),
      path.join(f.dir, "decoded.pcm"),
    );
    assert.equal(
      wav.subarray(0, 24000 * 2 - 100).every((b) => b === 0),
      true,
    );
    assert.equal(
      wav.subarray(24000 * 2, 48000 * 2).some((b) => b !== 0),
      true,
    );
    assert.equal(
      (await call(f.backend, "GET", "quota", "user")).body.reservedCredits,
      0,
    );
    const url = new URL(job.result.download.url),
      response = await f.backend.handle(
        new Request(url, { headers: { Range: "bytes=0-43" } }),
        url.pathname.replace("/v1/", "").split("/"),
      );
    assert.equal(response.status, 206);
    assert.equal(
      new URL(job.result.preview.url).searchParams.has("download"),
      false,
    );
    assert.equal(
      response.headers.get("Content-Disposition"),
      `attachment; filename="dubbed-${job.id}.wav"`,
    );
    assert.equal((await response.arrayBuffer()).byteLength, 44);
    assert.equal(
      (await call(f.backend, "POST", `jobs/${job.id}/cancel`, "user", {}))
        .response.status,
      409,
    );
    const input2 = await priced(f.backend),
      failed = await call(
        f.backend,
        "POST",
        "jobs",
        "user",
        input2,
        randomUUID(),
      );
    const broken = new Processor(f.store, f.backend.storage, {
      transcribe: async () => {
        throw Error("provider failure");
      },
      translate: async () => [],
      speak: async () => Buffer.alloc(0),
    });
    await broken.runOnce();
    assert.equal(
      (await call(f.backend, "GET", `jobs/${failed.body.id}`, "user")).body
        .status,
      "failed",
    );
    assert.equal(
      (await call(f.backend, "GET", "quota", "user")).body.availableCredits,
      499,
    );
    const input3 = await priced(f.backend),
      orphan = await call(
        f.backend,
        "POST",
        "jobs",
        "user",
        input3,
        randomUUID(),
      );
    const lease = f.store.claim()!;
    f.store.run("UPDATE jobs SET lease_expires=0 WHERE id=?", orphan.body.id);
    f.store.claim();
    assert.equal(
      f.store.settle(orphan.body.id, lease.lease!, "completed", null, null),
      false,
    );
    assert.equal(
      (await call(f.backend, "GET", "quota", "user")).body.availableCredits,
      499,
    );
  } finally {
    await f.close();
  }
});

test("Auth0 verifies real signatures/issuer/audience/expiry and rejects ID tokens; Turnstile checks action and hostname", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "dubbing-jwt-")),
    c = config(dir),
    { privateKey, publicKey } = await generateKeyPair("RS256"),
    original = globalThis.fetch;
  const verify = makeIdentityVerifier(c, async () => publicKey);
  const jwt = async (
    audience = c.authAudience,
    issuer = c.authIssuer,
    expired = false,
  ) =>
    new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setSubject("user")
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(expired ? Math.floor(Date.now() / 1000) - 30 : "5m")
      .sign(privateKey);
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          sub: "user",
          email: "user@example.test",
          email_verified: true,
          name: "User",
        }),
      );
    assert.equal((await verify(await jwt())).subject, "user");
    await assert.rejects(
      verify(await jwt("auth0-spa-client-id")),
      /Invalid or expired/,
    );
    await assert.rejects(
      verify(await jwt(c.authAudience, "https://evil.test/")),
      /Invalid or expired/,
    );
    await assert.rejects(
      verify(await jwt(c.authAudience, c.authIssuer, true)),
      /Invalid or expired/,
    );
    await assert.rejects(verify("forged.token.value"), /Invalid or expired/);
    const human = makeHumanVerifier({ ...c, turnstileSecret: "test-secret" });
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          action: "guest_trial",
          hostname: "127.0.0.1",
        }),
      );
    await human("test-token");
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          action: "login",
          hostname: "evil.test",
        }),
      );
    await assert.rejects(human("test-token"), /verification again/);
    await assert.rejects(makeHumanVerifier(c)("token"), /not configured/);
  } finally {
    globalThis.fetch = original;
    await rm(dir, { recursive: true, force: true });
  }
});

test("unverified email cannot create a wallet; verification of the same token unlocks one signup grant", async () => {
  const f = await fixture(),
    original = globalThis.fetch;
  f.c.signupCreditsCap = 50;
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setSubject("pending-user")
    .setIssuer(f.c.authIssuer)
    .setAudience(f.c.authAudience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  const backend = new Backend(f.c, f.store, {
    verifyIdentity: makeIdentityVerifier(f.c, async () => publicKey),
  });
  let emailVerified = false;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        sub: "pending-user",
        email: "pending@example.test",
        email_verified: emailVerified,
        name: "Pending user",
      }),
    );
  const counts = () =>
    f.store.get<{ accounts: number; bonuses: number; available: number }>(
      "SELECT (SELECT COUNT(*) FROM accounts) AS accounts,(SELECT COUNT(*) FROM credits WHERE type='signup_bonus') AS bonuses,COALESCE((SELECT SUM(available) FROM wallets),0) AS available",
    );
  try {
    const before = await call(backend, "GET", "users/me", token);
    assert.equal(before.response.status, 401);
    assert.equal(before.body.error.code, "EMAIL_NOT_VERIFIED");
    assert.match(before.body.error.message, /Verify your email/);
    assert.deepEqual(
      { ...counts() },
      { accounts: 0, bonuses: 0, available: 0 },
    );
    emailVerified = true;
    const after = await call(backend, "GET", "users/me", token);
    assert.equal(after.response.status, 200);
    assert.equal(after.body.email, "pending@example.test");
    assert.equal(
      (await call(backend, "GET", "users/me", token)).body.id,
      after.body.id,
    );
    assert.deepEqual(
      { ...counts() },
      { accounts: 1, bonuses: 1, available: 50 },
    );
  } finally {
    globalThis.fetch = original;
    await f.close();
  }
});

test("real HTTP client and server complete a guest audio job; failed guest tasks restore a trial exactly once", async () => {
  const f = await fixture();
  const server = createServer(async (incoming, outgoing) => {
    try {
      const request = new Request(`${f.c.origin}${incoming.url}`, {
        method: incoming.method,
        headers: incoming.headers as Record<string, string>,
        ...(!["GET", "HEAD"].includes(incoming.method!)
          ? {
              body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>,
              duplex: "half",
            }
          : {}),
      } as RequestInit);
      const response = await f.backend.handle(
        request,
        new URL(request.url).pathname.replace("/v1/", "").split("/"),
      );
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) Readable.fromWeb(response.body as any).pipe(outgoing);
      else outgoing.end();
    } catch {
      outgoing.writeHead(500).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  f.c.origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  f.c.allowedOrigins = [f.c.origin];
  const savedStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    },
  });
  const api = new HttpDubbingApi(f.c.origin, {
    getToken: async () => null,
    login: async () => {},
    logout: async () => {},
  });
  try {
    const session = await api.getSession();
    assert.equal(session.user, null);
    assert.equal((await api.getQuota()).trial!.remainingUses, 1);
    await assert.rejects(
      api.createUpload({
        filename: "test.wav",
        contentType: "audio/wav",
        sizeBytes: 100,
        sha256: "a".repeat(64),
      }),
      /verification/,
    );
    await api.verifyGuest({ token: randomUUID() });
    const bytes = audio();
    const ticket = await api.createUpload({
      filename: "test.wav",
      contentType: "audio/wav",
      sizeBytes: bytes.length,
      sha256: hash(bytes),
    });
    const put = await fetch(ticket.url, {
      method: "PUT",
      headers: ticket.headers,
      body: bytes,
    });
    assert.equal(put.status, 204);
    assert.equal((await api.completeUpload(ticket.id)).durationSeconds, 2);
    const input = {
      uploadId: ticket.id,
      sourceLanguage: "auto",
      targetLanguage: "es",
      voiceTier: "standard" as const,
    };
    const quote = await api.quoteJob(input);
    const key = randomUUID();
    const job = await api.createJob({ ...input, quoteId: quote.id }, key);
    assert.equal(
      (await api.createJob({ ...input, quoteId: quote.id }, key)).id,
      job.id,
    );
    assert.equal((await api.getQuota()).trial!.remainingUses, 0);
    await api.cancelJob(job.id);
    await api.cancelJob(job.id);
    assert.equal((await api.getQuota()).trial!.remainingUses, 1);
    assert.equal((await api.getQuota()).trial!.verifiedUntil, null);
    await api.verifyGuest({ token: randomUUID() });
    const quote2 = await api.quoteJob(input);
    const job2 = await api.createJob(
      { ...input, quoteId: quote2.id },
      randomUUID(),
    );
    const processor = new Processor(f.store, f.backend.storage, {
      transcribe: async () => ({
        language: "en",
        segments: [{ start: 0, end: 1, speaker: 7, text: "Hello." }],
      }),
      translate: async (segments) =>
        segments.map((segment) => ({ ...segment, text: "Hola." })),
      speak: async () => audio(1),
    });
    await processor.runOnce();
    const result = await api.getJob(job2.id);
    assert.equal(result.status, "completed");
    assert.equal(result.result!.speakerCount, 1);
    assert.equal(result.result!.isDemo, false);
    const file = await fetch(result.result!.download.url);
    assert.equal(file.status, 200);
    assert.ok((await file.arrayBuffer()).byteLength >= 44 + 2 * 24000 * 2);
    const partial = await fetch(result.result!.download.url, {
      headers: { Range: "bytes=0-43" },
    });
    assert.equal(partial.status, 206);
    assert.equal((await partial.arrayBuffer()).byteLength, 44);
    assert.equal((await api.getQuota()).trial!.remainingUses, 0);
    assert.equal(
      (
        await fetch(`${f.c.origin}/v1/health`, {
          headers: { Origin: "https://evil.test" },
        })
      ).status,
      403,
    );
  } finally {
    if (savedStorage)
      Object.defineProperty(globalThis, "localStorage", savedStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await f.close();
  }
});
