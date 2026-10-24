import test from "node:test";
import assert from "node:assert/strict";
import { DemoDubbingApi } from "../lib/api/demo";
import {
  defaultBillingPolicy,
  estimateCredits,
  validatePolicy,
} from "../lib/billing/policy";
import type { DubbingApi } from "../lib/api/types";
import { HttpDubbingApi } from "../lib/api/http";
import { safeReturnPath } from "../lib/auth0";
const preview = { email: "sample@example.test", displayName: "Sample" };
const upload = {
  filename: "sample.wav",
  contentType: "audio/wav",
  sizeBytes: 100,
  sha256: "a".repeat(64),
};
async function quote(
  api: DemoDubbingApi,
  timeline?: { durationSeconds: number; audioOffsetSeconds: number },
) {
  const ticket = await api.createUpload(upload);
  const input = {
    uploadId: ticket.id,
    sourceLanguage: "auto",
    targetLanguage: "es",
    voiceTier: "standard" as const,
    ...(timeline ? { timeline } : {}),
  };
  const result = await api.quoteJob(input);
  return { ...input, quoteId: result.id };
}
test("configurable prices round at duration boundaries and reject invalid settings", () => {
  assert.equal(estimateCredits(60, defaultBillingPolicy, "standard"), 10);
  assert.equal(estimateCredits(60.1, defaultBillingPolicy, "standard"), 11);
  assert.equal(
    estimateCredits(
      61,
      { ...defaultBillingPolicy, rounding: "per_minute" },
      "standard",
    ),
    20,
  );
  assert.equal(estimateCredits(1, defaultBillingPolicy, "high_fidelity"), 1);
  assert.throws(() =>
    validatePolicy({ ...defaultBillingPolicy, guestTrialSeconds: 7201 }),
  );
  assert.throws(() =>
    validatePolicy({ ...defaultBillingPolicy, signupCredits: 1.1 }),
  );
});
test("guest requires a non-replayed human grant and cannot exceed 30 seconds", async () => {
  const api = new DemoDubbingApi();
  await assert.rejects(api.createUpload(upload), /Complete verification/);
  const token = `demo-human.${Date.now()}.unique`;
  await api.verifyGuest({ token });
  await assert.rejects(api.verifyGuest({ token }), /verification again/);
  await assert.rejects(
    quote(api, { durationSeconds: 30.1, audioOffsetSeconds: 0 }),
    /30 seconds/,
  );
  const input = await quote(api);
  const job = await api.createJob(input, "once");
  await assert.rejects(api.createUpload(upload), /trial is used/);
  await assert.rejects(api.getJob(job.id + "other"), /not found/);
  await api.cancelJob(job.id);
  await api.cancelJob(job.id);
  assert.equal((await api.getQuota()).trial?.remainingUses, 1);
  await assert.rejects(api.createUpload(upload), /Complete verification/);
});
test("500 credits are granted once, reserved and refunded once; account data survives reload", async () => {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) || null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  } as Storage;
  let api = new DemoDubbingApi({ storage });
  await api.login("register", "/account", preview);
  assert.equal((await api.getQuota()).availableCredits, 500);
  const input = await quote(api);
  const job = await api.createJob(input, "once");
  assert.equal((await api.getQuota()).availableCredits, 498);
  assert.equal((await api.getQuota()).reservedCredits, 2);
  assert.equal((await api.createJob(input, "once")).id, job.id);
  api = new DemoDubbingApi({ storage });
  await api.cancelJob(job.id);
  await api.cancelJob(job.id);
  assert.equal((await api.getQuota()).availableCredits, 500);
  await api.logout();
  await api.login("login", "/account", preview);
  const ledger = await api.getCreditHistory();
  assert.equal(ledger.items.filter((e) => e.type === "signup_bonus").length, 1);
  assert.equal(ledger.items.filter((e) => e.type === "release").length, 1);
  await assert.rejects(api.listUsers(), /Administrator/);
});
test("rate snapshots, admin CAS and idempotent adjustments preserve balances", async () => {
  const api = new DemoDubbingApi();
  await api.login("register", "/admin", { ...preview, administrator: true });
  const user = (await api.getSession()).user!;
  const input = await quote(api);
  const old = await api.getPolicy();
  await api.updatePolicy({
    ...old,
    signupCredits: 100,
    creditsPerMinute: { standard: 100, high_fidelity: 200 },
  });
  await assert.rejects(api.updatePolicy(old), /policy changed/);
  const job = await api.createJob(input, "snapshot");
  assert.equal((await api.getQuota()).availableCredits, 498);
  await api.adjustCredits(
    user.id,
    { deltaCredits: 10, reason: "Support correction" },
    "same",
  );
  await api.adjustCredits(
    user.id,
    { deltaCredits: 10, reason: "Support correction" },
    "same",
  );
  assert.equal((await api.getQuota()).availableCredits, 508);
  await assert.rejects(
    api.adjustCredits(
      user.id,
      { deltaCredits: 11, reason: "Support correction" },
      "same",
    ),
    /different details/,
  );
  await api.cancelJob(job.id);
  assert.equal((await api.getQuota()).availableCredits, 510);
  await api.logout();
  await api.login("register", "/account", {
    email: "new@example.test",
    displayName: "New",
  });
  assert.equal((await api.getQuota()).availableCredits, 100);
});
test("Auth0 access tokens are attached to API requests, renewed, and never persisted; passwords are not sent", async () => {
  const originalFetch = globalThis.fetch;
  let token = "access-token-1";
  const requests: { url: string; init: RequestInit }[] = [];
  const user = {
    id: "auth-user",
    email: "auth@example.test",
    displayName: "Auth",
    role: "user",
    status: "active",
    createdAt: new Date().toISOString(),
  };
  let login: unknown;
  const api: DubbingApi = new HttpDubbingApi("https://api.test", {
    getToken: async () => ({
      token,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    }),
    login: async (mode, path) => {
      login = { mode, path };
    },
    logout: async () => {},
  });
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    return new Response(
      JSON.stringify(String(url).endsWith("/users/me") ? user : {}),
    );
  };
  try {
    const session = await api.getSession();
    assert.equal(session.user?.id, user.id);
    token = "access-token-2";
    await api.getQuota();
    assert.equal(
      new Headers(requests.at(-1)!.init.headers).get("Authorization"),
      "Bearer access-token-2",
    );
    assert.equal(requests.at(-1)!.init.credentials, "omit");
    await api.login("register", "/pricing", {
      email: "ignored@test.invalid",
      displayName: "Ignored",
      administrator: true,
    });
    assert.deepEqual(login, { mode: "register", path: "/pricing" });
    assert.equal(requests.filter((r) => r.url.includes("/auth/")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("Auth0 return paths reject external redirects and callback loops", () => {
  for (const path of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/auth/callback?code=x",
  ])
    assert.equal(safeReturnPath(path), "/account");
  assert.equal(
    safeReturnPath("/pricing?view=credits#packs"),
    "/pricing?view=credits#packs",
  );
});
test("concurrent creation reserves once and a quote cannot be reused with a different key", async () => {
  const api = new DemoDubbingApi();
  await api.login("register", "/account", preview);
  const input = await quote(api);
  const [a, b] = await Promise.all([
    api.createJob(input, "same"),
    api.createJob(input, "same"),
  ]);
  assert.equal(a.id, b.id);
  assert.equal((await api.getQuota()).availableCredits, 498);
  await assert.rejects(api.createJob(input, "other"), /quote already belongs/);
});
