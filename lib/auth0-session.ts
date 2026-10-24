type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Stores only a hint that SSO may exist. Auth0 must still authenticate every
 * restored session; neither tokens nor account details are persisted here. */
export class Auth0SessionRecovery {
  constructor(
    private key: string,
    private hints: SessionStorage,
    private attempts: SessionStorage,
  ) {}

  remember() {
    this.hints.setItem(this.key, "1");
    this.attempts.removeItem(this.key);
  }

  forget() {
    this.hints.removeItem(this.key);
    this.attempts.removeItem(this.key);
  }

  retry() {
    this.attempts.removeItem(this.key);
  }

  async restore(redirect: () => Promise<void>) {
    if (this.hints.getItem(this.key) !== "1") return false;
    // A callback must finish before another automatic redirect is allowed.
    // A failed or interrupted round trip must never create a redirect loop.
    if (this.attempts.getItem(this.key)) {
      this.forget();
      return false;
    }
    this.attempts.setItem(this.key, "1");
    try {
      await redirect();
      return true;
    } catch (error) {
      this.forget();
      throw error;
    }
  }
}
