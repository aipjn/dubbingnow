import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../config";
import { D1Client } from "../cloudflare/d1";
import { R2Storage } from "../cloudflare/r2";
import { defaultBillingPolicy } from "../../lib/billing/policy";

async function main() {
  const config = loadConfig();
  if (config.persistence !== "cloudflare")
    throw new Error(
      "Set PERSISTENCE_DRIVER=cloudflare before setting up cloud resources.",
    );
  const db = new D1Client(config);
  const schema = await readFile(
    new URL("../../migrations/0001_cloudflare.sql", import.meta.url),
    "utf8",
  );
  // The migration only adds missing tables/indexes. Existing accounts and balances are preserved.
  await db.batch(
    schema
      .split(";")
      .map((sql) => sql.trim())
      .filter(Boolean)
      .map((sql) => ({ sql, params: [] })),
  );
  await db.batch([
    {
      sql: "INSERT OR IGNORE INTO settings VALUES(1,?)",
      params: [
        JSON.stringify({ ...defaultBillingPolicy, version: randomUUID() }),
      ],
    },
  ]);
  const r2 = new R2Storage(config);
  // HeadBucket checks credentials without uploading any user audio or making the bucket public.
  const { HeadBucketCommand } = await import("@aws-sdk/client-s3");
  await r2.client.send(new HeadBucketCommand({ Bucket: config.r2Bucket }));
  console.log(
    "Cloudflare D1 schema initialized; private R2 bucket is reachable. No voice was created.",
  );
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error && error.message.startsWith("Set PERSISTENCE")
      ? error.message
      : "Cloudflare setup failed. Check the account/database/bucket IDs and scoped server credentials.",
  );
  process.exitCode = 1;
});
