// Real Cloudflare storage smoke test. No Google/Fish requests or voice creation.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { loadConfig } from "../server/config.ts";
import { CloudflareStore } from "../server/cloudflare-store.ts";
import { D1Failure } from "../server/cloudflare/d1.ts";
import { PrivateStorage } from "../server/storage.ts";
import { Processor } from "../server/processor.ts";
import { Backend } from "../server/backend.ts";
import { wavHeader } from "../server/media.ts";

const loaded = loadConfig();
assert.equal(
  loaded.persistence,
  "cloudflare",
  "Set PERSISTENCE_DRIVER=cloudflare",
);
const dir = await mkdtemp(path.join(tmpdir(), "dubbing-cloud-smoke-"));
const config = { ...loaded, dataDir: dir, requireWorker: false };
const store = new CloudflareStore(config),
  storage = new PrivateStorage(config, store);
const marker = "smoke-" + randomUUID(),
  started = performance.now();
let actor, uploadId, resultKey, jobId;
try {
  // Verify real REST batch rollback rather than assuming multi-query atomicity.
  await assert.rejects(
    store.db.batch([
      { sql: "INSERT INTO limits VALUES(?,?,1)", params: [marker, Date.now()] },
      {
        sql: "UPDATE mutation_revision SET version=NULL WHERE id=1",
        params: [],
      },
    ]),
    D1Failure,
  );
  assert.equal(
    await store.get("SELECT id FROM limits WHERE id=?", marker),
    undefined,
    "D1 REST batch must roll back earlier writes",
  );
  actor = await store.ensureUser({
    issuer: "https://storage-smoke.dubbingnow.invalid/",
    subject: marker,
    email: marker + "@example.invalid",
    name: "Storage smoke test",
  });
  const pcm = Buffer.alloc(24000 * 2);
  for (let i = 0; i < 24000; i++)
    pcm.writeInt16LE(
      Math.round(Math.sin((i * 2 * Math.PI * 220) / 24000) * 4000),
      i * 2,
    );
  const wav = Buffer.concat([wavHeader(24000), pcm]),
    input = {
      filename: "storage-smoke.wav",
      contentType: "audio/wav",
      sizeBytes: wav.length,
      sha256: createHash("sha256").update(wav).digest("hex"),
    };
  const row = await store.newUpload(actor, input);
  uploadId = row.id;
  const ticket = await storage.uploadTicket(row, input);
  const put = await fetch(ticket.url, {
    method: "PUT",
    headers: ticket.headers,
    body: wav,
  });
  assert.equal(put.status, 200, "Direct signed R2 upload");
  const repeat = await fetch(ticket.url, {
    method: "PUT",
    headers: ticket.headers,
    body: wav,
  });
  assert.equal(
    repeat.status,
    412,
    "Signed upload cannot overwrite an existing source",
  );
  await storage.complete(actor.id, row.id);
  const request = {
    uploadId: row.id,
    sourceLanguage: "en",
    targetLanguage: "es",
    voiceMode: "preset",
    voiceTier: "standard",
  };
  const quote = await store.quote(actor, request),
    key = randomUUID();
  const [a, b] = await Promise.all([
    store.createJob(actor, { ...request, quoteId: quote.id }, key, true),
    new CloudflareStore(config).createJob(
      actor,
      { ...request, quoteId: quote.id },
      key,
      true,
    ),
  ]);
  assert.equal(a.id, b.id);
  jobId = a.id;
  const processor = new Processor(store, storage, {
    transcribe: async () => ({
      language: "en",
      segments: [{ start: 0, end: 1, speaker: 0, text: "Hello" }],
    }),
    translate: async (rows) => rows.map((r) => ({ ...r, text: "Hola" })),
    speak: async () => wav,
  });
  await processor.runOnce();
  const job = await store.job(actor, a.id);
  assert.equal(job.status, "completed");
  resultKey = await storage.resultKey(a.id);
  assert.equal(
    (await store.history(actor)).items.filter((r) => r.type === "reserve")
      .length,
    1,
  );
  assert.equal((await store.quota(actor)).reservedCredits, 0);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir);
  const replacement = new CloudflareStore(config),
    fresh = new PrivateStorage(config, replacement),
    backend = new Backend(config, replacement);
  assert.equal(await fresh.resultExists(a.id), true);
  const download = new URL(fresh.url("result", a.id, actor.id));
  const response = await backend.handle(new Request(download), [
    "files",
    "result",
    a.id,
  ]);
  assert.equal(response.status, 307);
  const media = await fetch(response.headers.get("location"));
  assert.equal(media.status, 200);
  assert.ok((await media.arrayBuffer()).byteLength >= wav.length);
  const report = {
    ok: true,
    test: "real D1 + R2 + FFmpeg; synthetic provider",
    durationMs: Math.round(performance.now() - started),
    atomicBatchRollback: true,
    concurrentRequestDeduplication: true,
    immutableSignedUpload: true,
    temporaryDirectoryErased: true,
    resultDownloaded: true,
    googleFishRequests: 0,
    newVoices: 0,
  };
  await mkdir(".runtime/cloudflare", { recursive: true });
  await writeFile(
    ".runtime/cloudflare/live-smoke.json",
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report));
} finally {
  // Only the uniquely named synthetic fixture is removed, never pre-existing project data.
  if (resultKey) await storage.r2.remove(resultKey);
  if (uploadId) await storage.r2.remove("uploads/" + uploadId);
  if (actor)
    await store.db.atomic(async (tx) => {
      tx.run(
        "DELETE FROM pipeline_metrics WHERE job_id IN (SELECT id FROM jobs WHERE owner=?)",
        actor.id,
      );
      for (const table of [
        "credits",
        "idempotency",
        "jobs",
        "quotes",
        "uploads",
      ])
        tx.run(`DELETE FROM ${table} WHERE owner=?`, actor.id);
      tx.run("DELETE FROM wallets WHERE owner=?", actor.id);
      tx.run("DELETE FROM accounts WHERE id=?", actor.id);
      tx.run("DELETE FROM daily_usage WHERE id LIKE ?", "%" + actor.id);
    });
  await store.run("DELETE FROM limits WHERE id=?", marker);
  storage.r2.client.destroy();
  await rm(dir, { recursive: true, force: true });
}
