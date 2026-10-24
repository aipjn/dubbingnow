// Blank-credential smoke check against the running Next API and real SQLite.
// No request interception, external login, human verification or paid API calls.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const origin = "http://127.0.0.1:3000";
async function api(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${origin}/v1/${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { response, data: await response.json() };
}
const health = await api("health");
assert.equal(health.response.status, 200);
assert.equal(health.data.provider, "google-gemini");
assert.deepEqual(health.data.configured, {
  google: false,
  fish: false,
  auth0: false,
  turnstile: false,
});
const policy = await api("billing/policy");
assert.equal(policy.data.signupCredits, 50);
assert.equal(policy.data.guestTrialSeconds, 30);
const session = await api("sessions", { method: "POST", body: {} });
assert.equal(session.response.status, 201);
assert.equal(session.data.user, null);
const quota = await api("quota", { token: session.data.token });
assert.equal(quota.data.trial.remainingUses, 1);
assert.equal(quota.data.trial.verifiedUntil, null);
assert.equal(
  (await api("admin/users", { token: session.data.token })).response.status,
  403,
);
const verification = await api("guest/verify", {
  method: "POST",
  token: session.data.token,
  body: { token: "not-a-real-proof" },
});
assert.equal(verification.response.status, 503);
assert.equal(verification.data.error.code, "SERVICE_UNAVAILABLE");
const upload = await api("uploads", {
  method: "POST",
  token: session.data.token,
  body: {
    filename: "test.wav",
    contentType: "audio/wav",
    sizeBytes: 100,
    sha256: "a".repeat(64),
  },
});
assert.equal(upload.response.status, 403);
assert.equal(upload.data.error.code, "HUMAN_VERIFICATION_REQUIRED");
assert.equal(
  (await api("users/me", { token: "not-a-real-auth0-token" })).response.status,
  503,
);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await expect(page.locator(".tool-free")).toHaveText("Free to start");
  await expect(page.locator(".human-error")).toContainText(
    "Verification is unavailable",
  );
  await expect(
    page.getByRole("checkbox", { name: "Demo verification" }),
  ).toHaveCount(0);
  const first = await page.evaluate(() =>
    localStorage.getItem("dubbingnow.session.v1"),
  );
  assert.ok(JSON.parse(first)?.token);
  await page.reload();
  await expect(page.locator(".tool-free")).toHaveText("Free to start");
  assert.equal(
    await page.evaluate(() => localStorage.getItem("dubbingnow.session.v1")),
    first,
  );
  await page.goto(`${origin}/pricing`);
  await expect(
    page.getByText(`${policy.data.signupCredits} credits`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose Creator" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Choose Studio" }),
  ).toBeDisabled();
  await page.goto(`${origin}/login`);
  await page.getByRole("button", { name: "Continue to sign in" }).click();
  await expect(page.locator(".account-error")).toContainText(
    "Sign-in is unavailable",
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
console.log(
  "Live Next backend smoke passed: persistent guest session, policy, permissions, blank credential errors and real frontend mode.",
);
