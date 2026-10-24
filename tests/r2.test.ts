import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile, readdir, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { R2Storage } from "../server/cloudflare/r2";
import { CloudflareStore } from "../server/cloudflare-store";
import { PrivateStorage } from "../server/storage";
import { Backend } from "../server/backend";
import { Processor } from "../server/processor";
import { wavHeader } from "../server/media";
import { cloudConfig, d1Fixture } from "./helpers/cloudflare";

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "r2-test-")),
    config = cloudConfig(dir),
    d1 = d1Fixture(config),
    store = new CloudflareStore(config, d1.client());
  const objects = new Map<string, { body: Buffer; type: string }>();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://localhost"),
      key = url.pathname;
    if (
      !url.searchParams.has("X-Amz-Signature") &&
      !req.headers.authorization
    ) {
      res.writeHead(403).end();
      return;
    }
    if (req.method === "PUT") {
      if (req.headers["if-none-match"] === "*" && objects.has(key)) {
        res.writeHead(412).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      objects.set(key, { body, type: String(req.headers["content-type"]) });
      res.writeHead(200, { ETag: '"test-object"' }).end();
      return;
    }
    if (req.method === "DELETE") {
      objects.delete(key);
      res.writeHead(204).end();
      return;
    }
    const item = objects.get(key);
    if (!item) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "Content-Length": String(item.body.length),
      "Content-Type": item.type,
      ETag: '"test-object"',
    });
    res.end(req.method === "HEAD" ? undefined : item.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const client = new S3Client({
    region: "auto",
    endpoint: `http://127.0.0.1:${address.port}`,
    forcePathStyle: true,
    credentials: { accessKeyId: "test-only", secretAccessKey: "test-only" },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 1,
  });
  const r2 = new R2Storage(config, client),
    storage = new PrivateStorage(config, store, r2),
    identity = {
      issuer: config.authIssuer,
      subject: "member",
      email: "member@example.test",
      name: "Member",
    };
  const backend = new Backend(config, store, {
    storage,
    verifyIdentity: async () => identity,
    providerReady: () => true,
  });
  const user = await store.ensureUser(identity);
  return {
    dir,
    config,
    d1,
    store,
    user,
    r2,
    storage,
    backend,
    objects,
    client,
    close: async () => {
      client.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      d1.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
const wave = (seconds = 1) =>
  Buffer.concat([
    wavHeader(seconds * 24000),
    Buffer.alloc(seconds * 24000 * 2),
  ]);

test("R2 signed uploads bind length/type and cannot overwrite a verified source; wrong bytes fail validation", async () => {
  const f = await fixture();
  try {
    const data = wave(),
      input = {
        filename: "source.wav",
        contentType: "audio/wav" as const,
        sizeBytes: data.length,
        sha256: createHash("sha256").update(data).digest("hex"),
      };
    const row = await f.store.newUpload(f.user, input),
      ticket = await f.storage.uploadTicket(row, input);
    const signed = new URL(ticket.url).searchParams.get("X-Amz-SignedHeaders")!;
    for (const header of ["content-length", "content-type", "if-none-match"])
      assert.ok(signed.includes(header));
    const upload = await fetch(ticket.url, {
      method: "PUT",
      headers: ticket.headers,
      body: data,
    });
    assert.equal(upload.status, 200);
    assert.equal(
      (
        await fetch(ticket.url, {
          method: "PUT",
          headers: ticket.headers,
          body: data,
        })
      ).status,
      412,
    );
    assert.equal(
      (await f.storage.complete(f.user.id, row.id)).durationSeconds,
      1,
    );
    const bad = await f.store.newUpload(f.user, {
        ...input,
        sha256: "0".repeat(64),
      }),
      badTicket = await f.storage.uploadTicket(bad, input);
    await fetch(badTicket.url, {
      method: "PUT",
      headers: badTicket.headers,
      body: data,
    });
    await assert.rejects(f.storage.complete(f.user.id, bad.id), /hash check/);
    assert.deepEqual(
      await readdir(path.join(f.dir, "work")),
      [],
      "verification temporary files must be removed on success and failure",
    );
  } finally {
    await f.close();
  }
});

test("cloud pipeline reads from R2 and publishes immutable results; fresh server reads results after all local files disappear", async () => {
  const f = await fixture();
  try {
    const data = wave(),
      input = {
        filename: "source.wav",
        contentType: "audio/wav" as const,
        sizeBytes: data.length,
        sha256: createHash("sha256").update(data).digest("hex"),
      };
    const row = await f.store.newUpload(f.user, input),
      ticket = await f.storage.uploadTicket(row, input);
    await fetch(ticket.url, {
      method: "PUT",
      headers: ticket.headers,
      body: data,
    });
    await f.storage.complete(f.user.id, row.id);
    const request = {
      uploadId: row.id,
      sourceLanguage: "en",
      targetLanguage: "es",
      voiceTier: "standard" as const,
      voiceMode: "preset" as const,
    };
    const job = await f.store.createJob(
      f.user,
      { ...request, quoteId: (await f.store.quote(f.user, request)).id },
      randomUUID(),
      true,
    );
    const processor = new Processor(f.store, f.storage, {
      transcribe: async () => ({
        language: "en",
        segments: [{ start: 0, end: 1, speaker: 0, text: "Hello" }],
      }),
      translate: async (segments) =>
        segments.map((s) => ({ ...s, text: "Hola" })),
      speak: async () => data,
    });
    assert.equal(await processor.runOnce(), true);
    assert.equal((await f.store.job(f.user, job.id)).status, "completed");
    assert.ok(
      await f.store.get(
        "SELECT job_id FROM pipeline_metrics WHERE job_id=?",
        job.id,
      ),
    );
    assert.equal((await f.store.quota(f.user)).reservedCredits, 0);
    await rm(f.dir, { recursive: true, force: true });
    await mkdir(f.dir);
    const storage = new PrivateStorage(
      f.config,
      new CloudflareStore(f.config, f.d1.client()),
      f.r2,
    );
    const backend = new Backend(f.config, f.store, {
      storage,
      providerReady: () => true,
      verifyIdentity: async () => ({
        issuer: f.config.authIssuer,
        subject: "member",
        email: "member@example.test",
        name: "Member",
      }),
    });
    const result = await backend.handle(
      new Request(`${f.config.origin}/v1/jobs/${job.id}`, {
        headers: { Authorization: "Bearer member" },
      }),
      ["jobs", job.id],
    );
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.equal(body.result._storageKey, undefined);
    const url = new URL(body.result.download.url),
      redirect = await backend.handle(new Request(url), [
        "files",
        "result",
        job.id,
      ]);
    assert.equal(redirect.status, 307);
    const downloaded = await fetch(redirect.headers.get("location")!);
    assert.equal(downloaded.status, 200);
    assert.ok((await downloaded.arrayBuffer()).byteLength >= data.length);
    assert.deepEqual(
      await readdir(f.dir),
      [],
      "fresh API must not recreate a local database or media store",
    );
  } finally {
    await f.close();
  }
});
