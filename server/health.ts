import { statfs } from "node:fs/promises";
import type { ServerConfig } from "./config";

export async function diskReady(config: ServerConfig) {
  try {
    const stats = await statfs(config.dataDir);
    return (
      stats.bavail * stats.bsize >= (config.minFreeDiskBytes ?? 500_000_000)
    );
  } catch {
    return false;
  }
}
