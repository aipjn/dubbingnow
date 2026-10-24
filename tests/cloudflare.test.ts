import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { CloudflareStore } from "../server/cloudflare-store";
import { D1Failure } from "../server/cloudflare/d1";
import { VoiceRecords } from "../server/cloudflare/voice-records";
import { R2Storage } from "../server/cloudflare/r2";
import { cloudConfig, d1Fixture } from "./helpers/cloudflare";

test("R2 download signs attachment disposition while previews remain playable inline", async () => {
  const storage = new R2Storage(cloudConfig(tmpdir()));
  try {
    const preview = new URL(await storage.resultUrl("results/test.wav"));
    const download = new URL(
      await storage.resultUrl("results/test.wav", false, "dubbed-test.wav"),
    );
    assert.equal(
      preview.searchParams.get("response-content-disposition"),
      null,
    );
    assert.equal(
      download.searchParams.get("response-content-disposition"),
      'attachment; filename="dubbed-test.wav"',
    );
    assert.notEqual(
      preview.searchParams.get("X-Amz-Signature"),
      download.searchParams.get("X-Amz-Signature"),
    );
  } finally {
    storage.client.destroy();
  }
});

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "d1-test-")),
    config = cloudConfig(dir),
    d1 = d1Fixture(config),
    store = new CloudflareStore(config, d1.client());
  const user = await store.ensureUser({
    issuer: config.authIssuer,
    subject: "member",
    email: "member@example.test",
    name: "Member",
  });
  async function priced() {
    const upload = await store.newUpload(user, {
      contentType: "audio/wav",
      sizeBytes: 100,
      sha256: "a".repeat(64),
    });
    await store.run(
      "UPDATE uploads SET status='complete',duration=17 WHERE id=?",
      upload.id,
    );
    const input = {
      uploadId: upload.id,
      sourceLanguage: "en",
      targetLanguage: "es",
      voiceTier: "standard" as const,
      voiceMode: "preset" as const,
    };
    return { ...input, quoteId: (await store.quote(user, input)).id };
  }
  return {
    dir,
    config,
    d1,
    store,
    user,
    priced,
    close: async () => {
      d1.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("D1 fence rolls back an entire stale batch; concurrent idempotency reserves credits once", async () => {
  const f = await fixture();
  try {
    const before = (await f.store.quota(f.user)).availableCredits;
    const input = await f.priced(),
      key = randomUUID();
    const [a, b] = await Promise.all([
      f.store.createJob(f.user, input, key, true),
      new CloudflareStore(f.config, f.d1.client()).createJob(
        f.user,
        input,
        key,
        true,
      ),
    ]);
    assert.equal(a.id, b.id);
    const quota = await f.store.quota(f.user);
    assert.equal(quota.availableCredits, before - a.credits);
    assert.equal(quota.reservedCredits, a.credits);
    assert.equal(
      (await f.store.history(f.user)).items.filter((x) => x.type === "reserve")
        .length,
      1,
    );
    assert.ok(
      f.d1.collisions() > 0,
      "test must exercise a real revision collision",
    );
    const version = (await f.store.get<{ version: number }>(
      "SELECT version FROM mutation_revision",
    ))!.version;
    await assert.rejects(
      f.store.db.batch([
        {
          sql: "UPDATE mutation_revision SET version=CASE WHEN version=? THEN version+1 ELSE NULL END WHERE id=1",
          params: [version - 1],
        },
        { sql: "UPDATE wallets SET available=0", params: [] },
      ]),
      D1Failure,
    );
    assert.deepEqual(await f.store.quota(f.user), quota);
  } finally {
    await f.close();
  }
});

test("separate D1 workers claim once, cancellation races settlement safely, and expired leases refund once", async () => {
  const f = await fixture();
  try {
    const before = (await f.store.quota(f.user)).availableCredits;
    const job = await f.store.createJob(
      f.user,
      await f.priced(),
      randomUUID(),
      true,
    );
    const [a, b] = await Promise.all([
      f.store.claim(),
      new CloudflareStore(f.config, f.d1.client()).claim(),
    ]);
    const claim = a || b;
    assert.ok(claim);
    assert.equal(Number(!!a) + Number(!!b), 1);
    await Promise.allSettled([
      f.store.cancel(f.user, job.id),
      f.store.settle(job.id, claim.lease!, "completed", null, null),
    ]);
    const current = await f.store.job(f.user, job.id),
      q = await f.store.quota(f.user);
    assert.equal(q.reservedCredits, 0);
    assert.equal(
      q.availableCredits,
      current.status === "completed" ? before - job.credits : before,
    );
    assert.equal(
      (await f.store.history(f.user)).items.filter((x) =>
        ["release", "consume"].includes(x.type),
      ).length,
      1,
    );
    const orphan = await f.store.createJob(
        f.user,
        await f.priced(),
        randomUUID(),
        true,
      ),
      old = await f.store.claim();
    assert.ok(old);
    await f.store.run("UPDATE jobs SET lease_expires=0 WHERE id=?", orphan.id);
    assert.equal(
      await f.store.heartbeat(orphan.id, old.lease!),
      false,
      "expired leases cannot be revived",
    );
    await Promise.all([
      f.store.recoverExpiredJobs(),
      f.store.recoverExpiredJobs(),
    ]);
    assert.equal((await f.store.job(f.user, orphan.id)).status, "failed");
    assert.equal(
      await f.store.settle(orphan.id, old.lease!, "completed", null, null),
      false,
    );
    assert.equal(
      (await f.store.history(f.user)).items.filter(
        (x) => x.jobId === orphan.id && x.type === "release",
      ).length,
      1,
    );
  } finally {
    await f.close();
  }
});

test("D1 users, quotas and voice creation intents survive replacement of every local directory", async () => {
  const f = await fixture();
  try {
    const identity = {
      issuer: f.config.authIssuer,
      subject: "duplicate",
      email: " MEMBER@example.test ",
      name: "Second",
    };
    const other = await f.store.ensureUser(identity);
    assert.equal((await f.store.quota(other)).availableCredits, 0);
    const records = new VoiceRecords(f.config, f.d1.client()),
      record = {
        version: 1,
        state: "creating",
        title: "one-existing-intent",
        createdAt: new Date().toISOString(),
      };
    const acquired = await Promise.all([
      records.create("private-scope", record),
      new VoiceRecords(f.config, f.d1.client()).create("private-scope", record),
    ]);
    assert.equal(acquired.filter(Boolean).length, 1);
    await rm(f.dir, { recursive: true, force: true });
    const replacement = new CloudflareStore(
      { ...f.config, dataDir: "/a-different-ephemeral-directory" },
      f.d1.client(),
    );
    assert.equal((await replacement.actor(f.user.id)).id, f.user.id);
    assert.deepEqual(
      await new VoiceRecords(f.config, f.d1.client()).get("private-scope"),
      record,
    );
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, () => f.store.rate("shared", 3, 60000)),
    );
    assert.equal(attempts.filter((x) => x.status === "fulfilled").length, 3);
  } finally {
    await f.close();
  }
});

test("cloud Fish registration posts once across processes and reuses its D1 record after local state is erased", async () => {
  const f = await fixture();
  try {
    const { FishVoice } = await import("../server/providers/fish");
    const config = {
      ...f.config,
      fishVoiceId: "",
      fishAllowVoiceCreation: true,
    };
    let posts = 0;
    const fetcher: typeof fetch = async (url, options) => {
      if (options?.method === "POST") {
        posts++;
        return Response.json({ _id: "one-owned-model", state: "trained" });
      }
      if (String(url).includes("/model/"))
        return Response.json({ _id: "one-owned-model", state: "trained" });
      return Response.json({ items: [] });
    };
    const make = () =>
      new FishVoice(
        config,
        fetcher,
        undefined,
        "owner:job:0",
        new VoiceRecords(config, f.d1.client()),
      );
    const signal = new AbortController().signal;
    const attempts = await Promise.allSettled([
      make().ensure(Buffer.alloc(44), "Hello", signal),
      make().ensure(Buffer.alloc(44), "Hello", signal),
    ]);
    assert.ok(attempts.some((r) => r.status === "fulfilled"));
    assert.equal(posts, 1);
    await rm(f.dir, { recursive: true, force: true });
    assert.equal(
      await make().ensure(Buffer.alloc(44), "Hello", signal),
      "one-owned-model",
    );
    assert.equal(
      posts,
      1,
      "replacement server must reuse the recorded Fish model",
    );
  } finally {
    await f.close();
  }
});

test("D1 administrative adjustments stay idempotent and suspending an account releases its reservations atomically", async () => {
  const f = await fixture();
  try {
    const admin = await f.store.ensureUser({
      issuer: f.config.authIssuer,
      subject: "admin",
      email: "admin@example.test",
      name: "Admin",
    });
    const before = (await f.store.managed(f.user.id)).availableCredits,
      key = randomUUID();
    await Promise.all([
      f.store.adjustCredits(admin, f.user.id, 25, "support adjustment", key),
      f.store.adjustCredits(admin, f.user.id, 25, "support adjustment", key),
    ]);
    assert.equal(
      (await f.store.managed(f.user.id)).availableCredits,
      before + 25,
    );
    assert.equal(
      (await f.store.history(f.user)).items.filter(
        (x) => x.type === "adjustment",
      ).length,
      1,
    );
    await assert.rejects(
      f.store.adjustCredits(admin, f.user.id, 26, "support adjustment", key),
      /different details/,
    );
    const policy = await f.store.policy();
    await f.store.updatePolicy(admin, { ...policy, signupCredits: 42 });
    await assert.rejects(
      f.store.updatePolicy(admin, policy),
      /policy changed/i,
    );
    const job = await f.store.createJob(
      f.user,
      await f.priced(),
      randomUUID(),
      true,
    );
    await f.store.updateUser(admin, f.user.id, "suspended");
    assert.equal((await f.store.managed(f.user.id)).reservedCredits, 0);
    assert.equal(
      (await f.store.managed(f.user.id)).availableCredits,
      before + 25,
    );
    assert.equal(
      (await f.store.get<{ status: string }>(
        "SELECT status FROM jobs WHERE id=?",
        job.id,
      ))!.status,
      "failed",
    );
    await assert.rejects(f.store.actor(f.user.id), /suspended/);
  } finally {
    await f.close();
  }
});
