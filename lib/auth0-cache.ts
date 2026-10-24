import type { Cacheable, ICache } from "@auth0/auth0-spa-js";

/** Auth0's SDK owns token expiry, rotation and removal. A tab-scoped cache
 * survives reload without depending on third-party cookies. */
export class Auth0TabCache implements ICache {
  private prefix = "dubbingnow.auth0-cache.v1:";
  constructor(private storage: Storage) {}

  set<T = Cacheable>(key: string, entry: T) {
    this.storage.setItem(this.prefix + key, JSON.stringify(entry));
  }

  get<T = Cacheable>(key: string): T | undefined {
    const value = this.storage.getItem(this.prefix + key);
    if (!value) return undefined;
    try {
      return JSON.parse(value) as T;
    } catch {
      this.remove(key);
      return undefined;
    }
  }

  remove(key: string) {
    this.storage.removeItem(this.prefix + key);
  }

  allKeys() {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(this.prefix))
        keys.push(key.slice(this.prefix.length));
    }
    return keys;
  }
}
