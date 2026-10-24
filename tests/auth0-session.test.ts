import test from "node:test";
import assert from "node:assert/strict";
import { Auth0SessionRecovery } from "../lib/auth0-session";
import { Auth0TabCache } from "../lib/auth0-cache";

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    clear: () => {
      values.clear();
    },
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

test("SDK tab cache survives reload, accepts rotation and isolates logout from business state", () => {
  const tab = storage();
  tab.setItem("business-job", "job-1");
  const cache = new Auth0TabCache(tab);
  cache.set("client-a", { body: { refresh_token: "first" }, expiresAt: 100 });
  cache.set("client-b", { body: { refresh_token: "other" }, expiresAt: 100 });
  const reload = new Auth0TabCache(tab);
  assert.deepEqual(reload.get("client-a"), {
    body: { refresh_token: "first" },
    expiresAt: 100,
  });
  reload.set("client-a", {
    body: { refresh_token: "rotated" },
    expiresAt: 200,
  });
  assert.deepEqual(cache.get("client-a"), {
    body: { refresh_token: "rotated" },
    expiresAt: 200,
  });
  reload.remove("client-a");
  assert.equal(cache.get("client-a"), undefined);
  assert.deepEqual(cache.allKeys(), ["client-b"]);
  assert.equal(tab.getItem("business-job"), "job-1");
  assert.equal(new Auth0TabCache(storage()).get("client-b"), undefined);
  tab.setItem("dubbingnow.auth0-cache.v1:broken", "{");
  assert.equal(cache.get("broken"), undefined);
  assert.deepEqual(cache.allKeys(), ["client-b"]);
});

test("page reload restores previous SSO without persisting credentials or navigating guests", async () => {
  const hints = storage(),
    attempts = storage();
  let redirects = 0;
  const redirect = async () => {
    redirects++;
  };
  const first = new Auth0SessionRecovery("client:audience", hints, attempts);
  assert.equal(await first.restore(redirect), false);
  assert.equal(redirects, 0);
  first.remember();
  const afterReload = new Auth0SessionRecovery(
    "client:audience",
    hints,
    attempts,
  );
  assert.equal(await afterReload.restore(redirect), true);
  assert.equal(redirects, 1);
  assert.deepEqual([...hints.values.values()], ["1"]);
  assert.deepEqual([...attempts.values.values()], ["1"]);
  afterReload.remember(); // Successful PKCE callback.
  assert.equal(attempts.values.size, 0);
  assert.equal(await afterReload.restore(redirect), true);
  afterReload.forget(); // Logout or rejected callback.
  assert.equal(await afterReload.restore(redirect), false);
  assert.equal(hints.values.size + attempts.values.size, 0);
});

test("interrupted and failed SSO restoration cannot loop, while explicit login can retry", async () => {
  const hints = storage(),
    attempts = storage();
  const session = new Auth0SessionRecovery("client:audience", hints, attempts);
  let redirects = 0;
  const redirect = async () => {
    redirects++;
  };
  session.remember();
  await session.restore(redirect);
  assert.equal(
    await new Auth0SessionRecovery("client:audience", hints, attempts).restore(
      redirect,
    ),
    false,
  );
  assert.equal(redirects, 1);
  assert.equal(hints.values.size, 0);
  session.remember();
  await assert.rejects(
    session.restore(async () => {
      throw new Error("blocked");
    }),
    /blocked/,
  );
  assert.equal(await session.restore(redirect), false);
  session.remember();
  await session.restore(redirect);
  session.retry();
  assert.equal(await session.restore(redirect), true);
});
