import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { generateKeyPair, SignJWT } from "jose";
import { Store } from "../server/store";
import type { ServerConfig } from "../server/config";
import { Backend } from "../server/backend";
import { makeIdentityVerifier } from "../server/auth";
import { FishDubbingProvider, FishVoice } from "../server/providers/fish";
import { productionProblems } from "../server/production-check";
import { createBackup, restoreBackup } from "../server/backups";

async function fixture(overrides: Partial<ServerConfig> = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "web-vc-launch-"));
  const config: ServerConfig = {
    dataDir: dir,
    origin: "http://127.0.0.1:3000",
    signingSecret: "local-test-signing-secret-1234567890123",
    googleKey: "test-only",
    textModel: "unused",
    standardTtsModel: "unused",
    fidelityTtsModel: "unused",
    ffmpeg: "ffmpeg",
    ffprobe: "ffprobe",
    authIssuer: "https://auth.test/",
    authAudience: "https://api.test",
    adminSubjects: [],
    turnstileSecret: "test-only",
    allowedOrigins: ["http://127.0.0.1:3000"],
    trustProxy: false,
    guestIpUses: 3,
    maxFileBytes: 100000000,
    retentionMs: 86400000,
    maxSegments: 600,
    ...overrides,
  };
  const store = new Store(config);
  const identity = (subject: string, email = `${subject}@example.test`) => ({
    issuer: config.authIssuer,
    subject,
    email,
    name: subject,
  });
  const user = store.ensureUser(identity("member"));
  function priced(actor = user) {
    const upload = store.newUpload(actor, {
      filename: "test.wav",
      contentType: "audio/wav",
      sizeBytes: 100,
      sha256: "a".repeat(64),
    });
    store.run(
      "UPDATE uploads SET status='complete',duration=2 WHERE id=?",
      upload.id,
    );
    const input = {
      uploadId: upload.id,
      sourceLanguage: "en",
      targetLanguage: "es",
      voiceTier: "standard" as const,
    };
    return { ...input, quoteId: store.quote(actor, input).id };
  }
  return {
    dir,
    config,
    store,
    user,
    identity,
    priced,
    close: async () => {
      store.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("unverified or missing email verification cannot create an account or claim credits", async () => {
  const f = await fixture(),
    original = globalThis.fetch;
  try {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(f.config.authIssuer)
      .setAudience(f.config.authAudience)
      .setSubject("new")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    for (const verified of [false, undefined]) {
      globalThis.fetch = async () =>
        Response.json({
          sub: "new",
          email: "new@example.test",
          email_verified: verified,
        });
      await assert.rejects(
        makeIdentityVerifier(f.config, async () => publicKey)(token),
        /Verify your email/,
      );
      assert.equal(
        f.store.userBySubject(f.config.authIssuer, "new"),
        undefined,
      );
    }
    globalThis.fetch = async () =>
      Response.json({
        sub: "new",
        email: "new@example.test",
        email_verified: true,
      });
    assert.equal(
      (await makeIdentityVerifier(f.config, async () => publicKey)(token))
        .subject,
      "new",
    );
  } finally {
    globalThis.fetch = original;
    await f.close();
  }
});

test("signup ceiling, shared-email bonus and upload admission are enforced by SQLite", async () => {
  const f = await fixture({
    signupCreditsCap: 50,
    dailyUploadBytes: 150,
    maxFileBytes: 120,
    maxDurationSeconds: 300,
  });
  try {
    assert.equal(f.store.quota(f.user).availableCredits, 50);
    const other = f.store.ensureUser(
      f.identity("linked", "MEMBER@example.test"),
    );
    assert.equal(f.store.quota(other).availableCredits, 0);
    assert.equal(f.store.quota(f.user).maxDurationSeconds, 300);
    f.priced();
    assert.throws(() => f.priced(), /daily/);
    assert.equal(
      f.store.get<{ count: number }>("SELECT count(*) AS count FROM uploads")!
        .count,
      1,
    );
    assert.throws(
      () => f.store.newUpload(f.user, { sizeBytes: 121 }),
      /upload limit/,
    );
  } finally {
    await f.close();
  }
});

test("cancelled attempts retain daily budget; failed admissions and idempotent replays never consume extra budget or credits", async () => {
  const f = await fixture({ userDailySeconds: 3, globalDailySeconds: 10 });
  try {
    const input = f.priced(),
      key = randomUUID();
    const job = f.store.createJob(f.user, input, key, true);
    assert.equal(f.store.createJob(f.user, input, key, true).id, job.id);
    f.store.cancel(f.user, job.id);
    assert.throws(
      () => f.store.createJob(f.user, f.priced(), randomUUID(), true),
      /daily/,
    );
    assert.equal(f.store.quota(f.user).availableCredits, 500);
    assert.equal(f.store.quota(f.user).reservedCredits, 0);
    assert.equal(
      f.store.get<{ used: number }>(
        "SELECT used FROM daily_usage WHERE id LIKE '%audio:global'",
      )!.used,
      2,
    );
  } finally {
    await f.close();
  }
});

test("queue ceiling and pause switch reject new reservations; stale queues refund exactly once without a worker", async () => {
  const f = await fixture({ maxActiveJobs: 1, maxQueueWaitMs: 1000 });
  try {
    const job = f.store.createJob(f.user, f.priced(), randomUUID(), true);
    assert.throws(
      () => f.store.createJob(f.user, f.priced(), randomUUID(), true),
      /queue is full/,
    );
    f.store.run(
      "UPDATE jobs SET created=? WHERE id=?",
      Date.now() - 2000,
      job.id,
    );
    f.store.recoverExpiredJobs();
    f.store.recoverExpiredJobs();
    assert.equal(f.store.job(f.user, job.id).status, "failed");
    assert.equal(f.store.quota(f.user).availableCredits, 500);
    assert.equal(
      f.store.history(f.user).items.filter((i) => i.type === "release").length,
      1,
    );
    f.config.acceptingJobs = false;
    assert.throws(
      () => f.store.createJob(f.user, f.priced(), randomUUID(), true),
      /paused/,
    );
    assert.equal(f.store.quota(f.user).reservedCredits, 0);
  } finally {
    await f.close();
  }
});

test("readiness follows worker heartbeats and disk headroom, not merely the API process", async () => {
  const f = await fixture({ requireWorker: true });
  try {
    const backend = new Backend(f.config, f.store);
    const ready = () =>
      backend.handle(new Request(f.config.origin + "/v1/ready"), ["ready"]);
    assert.equal((await ready()).status, 503);
    f.store.workerBeat("worker");
    assert.equal((await ready()).status, 200);
    f.store.run("UPDATE worker_heartbeats SET updated=?", Date.now() - 31000);
    assert.equal((await ready()).status, 503);
    f.store.workerBeat("worker");
    f.config.minFreeDiskBytes = Number.MAX_SAFE_INTEGER;
    assert.equal((await ready()).status, 503);
  } finally {
    await f.close();
  }
});

test("recording history paginates by owner and retains expired entries without exposing links", async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 22; i++) {
      const job = f.store.createJob(f.user, f.priced(), randomUUID(), true);
      f.store.cancel(f.user, job.id);
    }
    const other = f.store.ensureUser(f.identity("other"));
    const page = f.store.jobPage(f.user);
    assert.equal(page.rows.length, 20);
    assert.ok(page.nextCursor);
    const next = f.store.jobPage(f.user, page.nextCursor!);
    assert.equal(next.rows.length, 2);
    assert.equal(
      new Set([...page.rows, ...next.rows].map((j) => j.id)).size,
      22,
    );
    assert.equal(f.store.jobPage(other).rows.length, 0);
    assert.throws(
      () => f.store.jobPage(other, page.nextCursor!),
      /Invalid task cursor/,
    );
    const backend = new Backend(f.config, f.store, {
      verifyIdentity: async () => f.identity("member"),
    });
    const response = await backend.handle(
      new Request(f.config.origin + "/v1/jobs", {
        headers: { Authorization: "Bearer test" },
      }),
      ["jobs"],
    );
    const history = await response.json();
    assert.equal(history.items.length, 20);
    assert.equal(history.items[0].resultAvailable, false);
    assert.equal(JSON.stringify(history).includes("signing-secret"), false);
    const completed = f.store.createJob(f.user, f.priced(), randomUUID(), true);
    const claimed = f.store.claim()!;
    assert.equal(claimed.id, completed.id);
    const asset = {
      url: "",
      filename: "result.wav",
      contentType: "audio/wav",
      expiresAt: null,
    };
    f.store.settle(
      completed.id,
      claimed.lease!,
      "completed",
      {
        mediaType: "audio",
        preview: asset,
        download: asset,
        durationSeconds: 2,
        sourceLanguage: "en",
        targetLanguage: "es",
        speakerCount: 1,
        isDemo: false,
      },
      null,
    );
    await mkdir(path.join(f.dir, "results"));
    await writeFile(
      path.join(f.dir, "results", completed.id + ".wav"),
      "fixture",
    );
    const list = async () =>
      (
        await backend.handle(
          new Request(f.config.origin + "/v1/jobs", {
            headers: { Authorization: "Bearer test" },
          }),
          ["jobs"],
        )
      ).json();
    assert.equal(
      (await list()).items.find((j: { id: string }) => j.id === completed.id)
        .resultAvailable,
      true,
    );
    f.store.run(
      "UPDATE jobs SET updated=? WHERE id=?",
      Date.now() - f.config.retentionMs - 1,
      completed.id,
    );
    const expired = (await list()).items.find(
      (j: { id: string }) => j.id === completed.id,
    );
    assert.equal(expired.status, "completed");
    assert.equal(expired.resultAvailable, false);
    assert.ok(expired.resultExpiresAt);
  } finally {
    await f.close();
  }
});

test("production clones cannot adopt saved test or another task's voice, including after a lost response", async () => {
  const f = await fixture({
    fishKey: "test-only",
    fishVoiceMode: "per_job",
    fishAllowVoiceCreation: true,
    fishVoiceId: "test-voice",
  });
  const models = [
    {
      _id: "test-voice",
      title: "Existing test",
      type: "tts",
      state: "trained",
    },
  ];
  let posts = 0,
    lost = true;
  const fetcher: typeof fetch = async (url, init) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === "/model" && init?.method === "POST") {
      posts++;
      const form = init.body as FormData;
      const model = {
        _id: `private-${posts}`,
        title: String(form.get("title")),
        type: "tts",
        state: "trained",
      };
      models.push(model);
      if (lost) {
        lost = false;
        throw Error("lost response");
      }
      return Response.json(model);
    }
    if (pathname === "/model") return Response.json({ items: models });
    return Response.json(models.find((m) => pathname === `/model/${m._id}`));
  };
  try {
    const make = (owner: string, jobId: string) =>
      new FishDubbingProvider(f.config, fetcher, undefined, { owner, jobId });
    const signal = new AbortController().signal;
    const first = make("alice", "job-a");
    assert.equal(await first.existingVoice(signal), undefined);
    await assert.rejects(
      first.replicate(Buffer.alloc(0), Buffer.alloc(0), signal, "ref", 0),
      /interrupted/,
    );
    assert.equal(
      await make("alice", "job-a").replicate(
        Buffer.alloc(0),
        Buffer.alloc(0),
        signal,
        "ref",
        0,
      ),
      "private-1",
    );
    assert.equal(posts, 1);
    assert.equal(
      await make("bob", "job-b").replicate(
        Buffer.alloc(0),
        Buffer.alloc(0),
        signal,
        "ref",
        0,
      ),
      "private-2",
    );
    assert.equal(
      await make("alice", "job-a").replicate(
        Buffer.alloc(0),
        Buffer.alloc(0),
        signal,
        "ref",
        1,
      ),
      "private-3",
    );
    assert.equal(posts, 3);
    f.config.fishAllowVoiceCreation = false;
    await assert.rejects(
      make("carol", "job-c").replicate(
        Buffer.alloc(0),
        Buffer.alloc(0),
        signal,
      ),
      /not enabled/,
    );
    assert.equal(posts, 3);
    assert.equal(
      await new FishVoice(f.config, fetcher).existing(signal),
      "test-voice",
    );
  } finally {
    await f.close();
  }
});

test("online backup restores balances and voice intent, refuses overwrite and detects corruption", async () => {
  const f = await fixture();
  try {
    const job = f.store.createJob(f.user, f.priced(), randomUUID(), true);
    f.store.workerBeat("old-worker");
    await writeFile(
      path.join(f.dir, "fish-test-voice.json"),
      JSON.stringify({ state: "creating", title: "keep intent" }),
    );
    const snapshot = await createBackup(f.dir, path.join(f.dir, "snapshots"));
    const target = path.join(f.dir, "restored");
    await restoreBackup(snapshot, target);
    const restored = new Store({ ...f.config, dataDir: target });
    try {
      restored.recoverExpiredJobs();
      assert.equal(restored.job(f.user, job.id).status, "failed");
      assert.equal(restored.quota(f.user).availableCredits, 500);
      assert.equal(restored.workerHealthy(), false);
      assert.equal(
        JSON.parse(
          await readFile(path.join(target, "fish-test-voice.json"), "utf8"),
        ).state,
        "creating",
      );
    } finally {
      restored.close();
    }
    await assert.rejects(restoreBackup(snapshot, target), /EEXIST/);
    await writeFile(path.join(snapshot, "dubbing.sqlite"), "corrupt");
    await assert.rejects(
      restoreBackup(snapshot, path.join(f.dir, "bad")),
      /integrity/,
    );
  } finally {
    await f.close();
  }
});

test("production preflight fails closed on preview credentials and missing external setup", () => {
  const issues = productionProblems({
    BACKEND_LOCAL: "true",
    FISH_VOICE_MODE: "saved_test",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  });
  assert.ok(issues.some((i) => i.includes("AUTH0_AUDIENCE")));
  assert.ok(issues.some((i) => i.includes("per_job")));
  assert.ok(issues.some((i) => i.includes("testing key")));
});
