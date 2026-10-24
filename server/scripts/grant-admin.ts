import { loadConfig } from "../config";
import { createStore } from "../persistence";
import { CloudflareStore } from "../cloudflare-store";
async function main() {
  const subject = process.argv[2];
  if (!subject)
    throw new Error('Usage: npm run admin:grant -- "auth0|subject"');
  const config = loadConfig(),
    store = createStore(config);
  try {
    const id = await store.userBySubject(config.authIssuer, subject);
    if (!id) throw new Error("This subject has not signed in to this app yet.");
    if (store instanceof CloudflareStore) {
      await store.db.atomic(async (tx) => {
        const before = await store.managed(id);
        tx.run("UPDATE accounts SET role='admin' WHERE id=?", id);
        tx.run(
          "INSERT INTO audit(actor,action,target,before_json,after_json,created) VALUES('operator-cli','user.role',?,?,?,?)",
          id,
          JSON.stringify(before),
          JSON.stringify({ ...before, role: "admin" }),
          Date.now(),
        );
      });
    } else
      store.transaction(() => {
        const before = store.managed(id);
        store.run("UPDATE accounts SET role='admin' WHERE id=?", id);
        store.run(
          "INSERT INTO audit(actor,action,target,before_json,after_json,created) VALUES('local-cli','user.role',?,?,?,?)",
          id,
          JSON.stringify(before),
          JSON.stringify(store.managed(id)),
          Date.now(),
        );
      });
    console.log("Administrator role granted to the existing account.");
  } finally {
    store.close();
  }
}
void main().catch((e: Error) => {
  console.error(e.message);
  process.exitCode = 1;
});
