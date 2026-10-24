// Real Auth0 SDK redirect/state handling with mocked tenant navigation; no real tenant credentials.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch();
const policy = {
  version: "1",
  signupCredits: 500,
  guestTrialSeconds: 30,
  guestTrialUses: 1,
  creditsPerMinute: { standard: 10, high_fidelity: 20 },
  rounding: "per_second",
  minimumCredits: 1,
  maxDurationSeconds: 7200,
};
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.route("https://api.dubbingnow.test/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    const body = path.endsWith("/billing/policy")
      ? policy
      : path.endsWith("/sessions")
        ? {
            id: "guest",
            token: "guest-token",
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            user: null,
          }
        : {};
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  let authorization;
  await context.route(
    "https://login.dubbingnow.test/authorize**",
    async (route) => {
      authorization = new URL(route.request().url());
      await route.fulfill({
        contentType: "text/html",
        body: "Hosted sign-in fixture",
      });
    },
  );
  await page.goto("http://127.0.0.1:3000/register?next=%2Fpricing");
  await expect(page.locator("input[type=password]")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/^https:\/\/login\.dubbingnow\.test\/authorize/);
  assert.equal(
    authorization.searchParams.get("client_id"),
    "preview-auth0-client",
  );
  assert.equal(
    authorization.searchParams.get("audience"),
    "https://api.dubbingnow.test",
  );
  assert.equal(
    authorization.searchParams.get("redirect_uri"),
    "http://127.0.0.1:3000/auth/callback",
  );
  assert.equal(authorization.searchParams.get("response_type"), "code");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorization.searchParams.get("screen_hint"), "signup");
  assert.ok(authorization.searchParams.get("state"));
  assert.ok(authorization.searchParams.get("code_challenge"));
  await page.goto(
    "http://127.0.0.1:3000/auth/callback?code=fake&state=wrong-state",
  );
  await expect(page.locator("main [role=alert]")).toContainText(/state/i);
  await expect(page).toHaveURL(/\/auth\/callback$/);
  assert.equal(requests.filter((path) => path.endsWith("/users/me")).length, 0);
  assert.deepEqual(errors, []);
  console.log(
    "Auth0 SDK passed: Universal Login, signup hint, audience, callback URL, PKCE and rejection of invalid callback state. Real tenant login is not covered.",
  );
  await context.close();
} finally {
  await browser.close();
}
