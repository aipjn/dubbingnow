import { loadConfig } from "../config";
import { createBackup, restoreBackup } from "../backups";
async function main() {
  const [command, source, destination] = process.argv.slice(2);
  if (loadConfig().persistence === "cloudflare")
    throw new Error(
      "Cloud mode uses D1 Time Travel/export and private R2 storage. This command only backs up local development SQLite.",
    );
  if (command === "create" && source)
    console.log(await createBackup(loadConfig().dataDir, source));
  else if (command === "restore" && source && destination) {
    await restoreBackup(source, destination);
    console.log(
      "Restored to a new directory. Restore production environment secrets separately before starting the service.",
    );
  } else
    throw new Error(
      "Use: backup create <backup-root> OR backup restore <backup-directory> <new-data-directory>",
    );
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Backup operation failed.",
  );
  process.exitCode = 1;
});
