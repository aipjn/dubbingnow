import { DatabaseSync, backup } from "node:sqlite";
import {
  mkdir,
  mkdtemp,
  readdir,
  copyFile,
  readFile,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

type Manifest = {
  version: 1;
  createdAt: string;
  files: { name: string; sha256: string }[];
};
export async function createBackup(dataDir: string, destinationRoot: string) {
  await mkdir(destinationRoot, { recursive: true, mode: 0o700 });
  const destination = await mkdtemp(
    path.join(path.resolve(destinationRoot), "web-vc-"),
  );
  const db = new DatabaseSync(path.join(dataDir, "dubbing.sqlite"), {
    readOnly: true,
  });
  try {
    await backup(db, path.join(destination, "dubbing.sqlite"));
  } finally {
    db.close();
  }
  const names = ["dubbing.sqlite"];
  for (const name of await readdir(dataDir))
    if (
      name === "signing-secret" ||
      /^fish-(test-voice|voice-[a-f0-9]{64})\.json$/.test(name)
    ) {
      await copyFile(path.join(dataDir, name), path.join(destination, name));
      names.push(name);
    }
  const manifest: Manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    files: await Promise.all(
      names.map(async (name) => ({
        name,
        sha256: createHash("sha256")
          .update(await readFile(path.join(destination, name)))
          .digest("hex"),
      })),
    ),
  };
  await writeFile(
    path.join(destination, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { mode: 0o600 },
  );
  return destination;
}
export async function restoreBackup(source: string, destination: string) {
  const manifest = JSON.parse(
    await readFile(path.join(source, "manifest.json"), "utf8"),
  ) as Manifest;
  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.files) ||
    !manifest.files.some((f) => f.name === "dubbing.sqlite")
  )
    throw new Error("Invalid backup manifest.");
  for (const file of manifest.files) {
    if (
      !/^(dubbing\.sqlite|signing-secret|fish-(test-voice|voice-[a-f0-9]{64})\.json)$/.test(
        file.name,
      ) ||
      createHash("sha256")
        .update(await readFile(path.join(source, file.name)))
        .digest("hex") !== file.sha256
    )
      throw new Error("Backup integrity check failed.");
  }
  // Refuse to overwrite a running/previous installation.
  await mkdir(destination, { mode: 0o700 });
  for (const file of manifest.files)
    await copyFile(
      path.join(source, file.name),
      path.join(destination, file.name),
    );
  const db = new DatabaseSync(path.join(destination, "dubbing.sqlite"));
  try {
    const integrity = db.prepare("PRAGMA integrity_check").get() as {
      integrity_check: string;
    };
    if (integrity.integrity_check !== "ok")
      throw new Error("Restored SQLite integrity check failed.");
    // Media is intentionally not backed up. Let normal recovery refund unfinished jobs.
    db.exec(
      "UPDATE jobs SET status='transcribing',lease_expires=0,lease=NULL WHERE settled=0; DELETE FROM worker_heartbeats;",
    );
  } finally {
    db.close();
  }
}
