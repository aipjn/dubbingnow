import { Store } from "./store";
import { CloudflareStore } from "./cloudflare-store";
import type { ServerConfig } from "./config";

export type DataStore = Store | CloudflareStore;
export function createStore(config: ServerConfig): DataStore {
  return config.persistence === "cloudflare"
    ? new CloudflareStore(config)
    : new Store(config);
}
