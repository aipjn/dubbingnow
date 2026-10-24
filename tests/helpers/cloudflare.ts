import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { D1Client, type Statement } from "../../server/cloudflare/d1";
import { defaultBillingPolicy } from "../../lib/billing/policy";
import type { ServerConfig } from "../../server/config";
export function cloudConfig(dir: string): ServerConfig {
  return {
    persistence: "cloudflare",
    cloudflareAccountId: "a".repeat(32),
    d1DatabaseId: randomUUID(),
    d1ApiToken: "test-only",
    r2Bucket: "dubbingnow-audio",
    r2AccessKeyId: "test-only",
    r2SecretAccessKey: "test-only",
    dataDir: dir,
    origin: "https://dubbing.test",
    signingSecret: "test-only-shared-secret-12345678901234567890",
    googleKey: "test-only",
    textModel: "test-only",
    standardTtsModel: "test-only",
    fidelityTtsModel: "test-only",
    ffmpeg: "ffmpeg",
    ffprobe: "ffprobe",
    authIssuer: "https://identity.test/",
    authAudience: "test-only",
    adminSubjects: ["admin"],
    turnstileSecret: "test-only",
    allowedOrigins: ["https://dubbing.test"],
    trustProxy: false,
    guestIpUses: 3,
    maxFileBytes: 100000000,
    retentionMs: 86400000,
    maxSegments: 600,
    cloneProvider: "fish",
    fishVoiceMode: "saved_test",
    fishVoiceId: "single-existing-voice",
    fishKey: "test-only",
  };
}
/** Emulates the documented REST envelope and atomic batch rollback using actual SQLite SQL. */
export function d1Fixture(config: ServerConfig) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec(
    readFileSync(
      new URL("../../migrations/0001_cloudflare.sql", import.meta.url),
      "utf8",
    ),
  );
  sqlite
    .prepare("INSERT INTO settings VALUES(1,?)")
    .run(JSON.stringify({ ...defaultBillingPolicy, version: randomUUID() }));
  let collisions = 0;
  const fetcher: typeof fetch = async (_url, options) => {
    assertAuthorized(options);
    const { batch } = JSON.parse(options!.body as string) as {
      batch: Statement[];
    };
    try {
      sqlite.exec("BEGIN IMMEDIATE");
      const result = batch.map(({ sql, params }) => {
        const statement = sqlite.prepare(sql);
        const results = statement.columns().length
          ? statement.all(...params)
          : [];
        let changes = 0;
        if (!statement.columns().length)
          changes = Number(statement.run(...params).changes);
        return { success: true, results, meta: { changes } };
      });
      sqlite.exec("COMMIT");
      return Response.json({ success: true, result });
    } catch (error) {
      sqlite.exec("ROLLBACK");
      const message = (error as Error).message;
      if (message.includes("mutation_revision.version")) collisions++;
      return Response.json(
        { success: false, errors: [{ message }] },
        { status: 400 },
      );
    }
  };
  return {
    sqlite,
    client: () => new D1Client(config, fetcher),
    collisions: () => collisions,
    fetcher,
    close: () => sqlite.close(),
  };
}
function assertAuthorized(options?: RequestInit) {
  if (new Headers(options?.headers).get("Authorization") !== "Bearer test-only")
    throw new Error("Missing server-only D1 token");
}
