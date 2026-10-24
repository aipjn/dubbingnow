import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { Store, UploadRow, JobRow } from "./store";
export async function cleanup(store: Store) {
  const now = Date.now(),
    retention = store.config.retentionMs;
  store.recoverExpiredJobs();
  for (const upload of store.all<UploadRow>(
    `SELECT * FROM uploads WHERE created<? AND NOT EXISTS (SELECT 1 FROM jobs WHERE settled=0 AND
      (json_extract(jobs.input,'$.uploadId')=uploads.id OR EXISTS
        (SELECT 1 FROM json_each(jobs.input,'$.consentUploads') AS consent WHERE json_extract(consent.value,'$.uploadId')=uploads.id)))`,
    now - retention,
  )) {
    await rm(path.join(store.config.dataDir, "uploads", upload.id), {
      force: true,
    });
    store.run("DELETE FROM uploads WHERE id=?", upload.id);
  }
  for (const job of store.all<JobRow>(
    "SELECT * FROM jobs WHERE settled=1 AND updated<?",
    now - retention,
  )) {
    await rm(path.join(store.config.dataDir, "results", job.id + ".wav"), {
      force: true,
    });
    await rm(path.join(store.config.dataDir, "metrics", job.id + ".json"), {
      force: true,
    });
  }
  for (const name of await readdir(
    path.join(store.config.dataDir, "work"),
  ).catch(() => [])) {
    const file = path.join(store.config.dataDir, "work", name);
    const active = store.get(
      "SELECT id FROM jobs WHERE id=? AND settled=0 AND lease_expires>?",
      name.slice(0, 36),
      now,
    );
    if (!active && (await stat(file)).mtimeMs < now - 3600000)
      await rm(file, { recursive: true, force: true });
  }
  const uploadsDir = path.join(store.config.dataDir, "uploads");
  for (const name of await readdir(uploadsDir).catch(() => []))
    if (
      name.endsWith(".part") &&
      (await stat(path.join(uploadsDir, name))).mtimeMs < now - 3600000
    )
      await rm(path.join(uploadsDir, name), { force: true });
  store.run(
    "DELETE FROM quotes WHERE expires<? AND job_id IS NULL",
    now - 86400000,
  );
  store.run("DELETE FROM human_tokens WHERE expires<?", now);
  store.run("DELETE FROM limits WHERE started<?", now - 2 * 86400000);
  store.run("DELETE FROM worker_heartbeats WHERE updated<?", now - 60000);
  store.run(
    "DELETE FROM daily_usage WHERE substr(id,1,10)<?",
    new Date(now - 7 * 86400000).toISOString().slice(0, 10),
  );
}
