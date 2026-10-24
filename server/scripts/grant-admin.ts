import { loadConfig } from "../config";
import { Store } from "../store";
const subject = process.argv[2];
if (!subject) {
  console.error('Usage: npm run admin:grant -- "auth0|subject"');
  process.exit(1);
}
const config = loadConfig(),
  store = new Store(config);
try {
  const id = store.userBySubject(config.authIssuer, subject);
  if (!id) throw new Error("This subject has not signed in to this app yet.");
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
