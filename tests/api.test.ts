import test from "node:test";
import assert from "node:assert/strict";
import { DemoDubbingApi } from "../lib/api/demo";
import { HttpDubbingApi } from "../lib/api/http";

const upload = {
  filename: "recording.wav",
  contentType: "audio/wav",
  sizeBytes: 100,
  sha256: "a".repeat(64),
};

test("demo job creation is idempotent, and repeated cancellation refunds once", async () => {
  const api = new DemoDubbingApi();
  await api.verifyGuest({ token: `demo-human.${Date.now()}.test` });
  const ticket = await api.createUpload(upload);
  const input = {
    uploadId: ticket.id,
    sourceLanguage: "auto",
    targetLanguage: "es",
    voiceTier: "standard" as const,
  };
  const quote = await api.quoteJob(input);
  const priced = { ...input, quoteId: quote.id };
  const job = await api.createJob(priced, "key-1");
  const duplicate = await api.createJob(priced, "key-1");
  assert.equal(job.id, duplicate.id);
  assert.equal((await api.getQuota()).trial?.remainingUses, 0);
  assert.equal((await api.cancelJob(job.id)).status, "cancelled");
  await api.cancelJob(job.id);
  assert.equal((await api.getQuota()).trial?.remainingUses, 1);
});
test("demo never offers a real purchase", async () => {
  const api = new DemoDubbingApi();
  await assert.rejects(
    api.createCheckout({ planId: "creator" }),
    /Purchases are disabled/,
  );
  assert.equal(
    (await api.getPlans())
      .filter((plan) => plan.id !== "free")
      .every((plan) => !plan.available),
    true,
  );
});

test("HTTP client reuses session, sends authenticated API requests and preserves idempotency keys", async () => {
  const savedFetch = globalThis.fetch;
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) || null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  const requests: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    const body = String(url).endsWith("/sessions")
      ? {
          id: "ses",
          token: "secret",
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        }
      : String(url).endsWith("/jobs")
        ? { id: "job" }
        : {};
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const api = new HttpDubbingApi("https://api.example.test/");
    await Promise.all([api.getQuota(), api.getQuota()]);
    assert.equal(requests.filter((r) => r.url.endsWith("/sessions")).length, 1);
    assert.equal(
      new Headers(
        requests.find((r) => r.url.endsWith("/quota"))!.init.headers,
      ).get("Authorization"),
      "Bearer secret",
    );
    const input = {
      uploadId: "upl",
      quoteId: "quote",
      sourceLanguage: "auto",
      targetLanguage: "es",
      voiceTier: "standard" as const,
    };
    await api.createJob(input, "stable-key");
    await api.createJob(input, "stable-key");
    const jobs = requests.filter((r) => r.url.endsWith("/jobs"));
    assert.equal(jobs.length, 2);
    assert.equal(
      new Headers(jobs[0].init.headers).get("Idempotency-Key"),
      "stable-key",
    );
    assert.equal(jobs[0].init.body, JSON.stringify(input));
    await api.getPlans();
    assert.equal(
      new Headers(requests.at(-1)!.init.headers).has("Authorization"),
      false,
    );
    await api.getJob("a/b");
    assert.equal(
      requests.at(-1)!.url,
      "https://api.example.test/v1/jobs/a%2Fb",
    );
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "QUOTA_EXCEEDED",
            message: "No credits left.",
            retryable: false,
          },
        }),
        { status: 402 },
      );
    await assert.rejects(api.createJob(input, "stable-key"), /No credits left/);
    globalThis.fetch = async () => {
      throw new TypeError("network unavailable");
    };
    await assert.rejects(api.getQuota(), /couldn’t reach/);
    assert.equal(api.mode, "live");
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test("expired sessions are preserved rather than silently replaced", async () => {
  const storage = new Map([
    [
      "dubbingnow.session.v1",
      JSON.stringify({
        id: "paid-session",
        token: "keep-me",
        expiresAt: "2000-01-01T00:00:00Z",
      }),
    ],
  ]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) || null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  const api = new HttpDubbingApi("https://api.example.test");
  await assert.rejects(api.getSession(), /session has expired/);
  assert.match(storage.get("dubbingnow.session.v1")!, /keep-me/);
});
