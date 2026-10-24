import test from "node:test";
import assert from "node:assert/strict";
import { productionProblems } from "../server/production-check";

// Local fixtures only; no DNS, identity provider or supplier calls.
const valid = {
  BACKEND_LOCAL: "false",
  BACKEND_PUBLIC_URL: "https://dubbing.webvc.test",
  BACKEND_DATA_DIR: "/var/lib/web-vc",
  STORAGE_SIGNING_SECRET: "test-only-signing-secret-12345678901234567890",
  GEMINI_API_KEY: "test-only",
  FISH_API_KEY: "test-only",
  FISH_VOICE_MODE: "per_job",
  FISH_ALLOW_VOICE_CREATION: "true",
  NEXT_PUBLIC_SITE_URL: "https://dubbing.webvc.test",
  NEXT_PUBLIC_API_BASE_URL: "/",
  NEXT_PUBLIC_AUTH0_DOMAIN: "tenant.auth0.test",
  NEXT_PUBLIC_AUTH0_CLIENT_ID: "test-only",
  NEXT_PUBLIC_AUTH0_AUDIENCE: "https://api.webvc.test",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "test-fixture-not-a-real-key",
  TURNSTILE_SECRET_KEY: "test-fixture-not-a-real-key",
  NEXT_PUBLIC_SUPPORT_EMAIL: "support@webvc.test",
  NEXT_PUBLIC_OPERATOR_NAME: "Local test fixture",
};

test("production inline cloning needs no saved-model capacity and shared test voices remain forbidden", () => {
  assert.deepEqual(
    productionProblems({
      ...valid,
      FISH_VOICE_MODE: "inline",
      FISH_ALLOW_VOICE_CREATION: "false",
    }),
    [],
  );
  assert.deepEqual(
    productionProblems({
      ...valid,
      FISH_VOICE_MODE: undefined,
      FISH_ALLOW_VOICE_CREATION: "false",
    }),
    [],
  );
  assert.ok(
    productionProblems({ ...valid, FISH_VOICE_MODE: "saved_test" }).some(
      (issue) => issue.includes("FISH_VOICE_MODE"),
    ),
  );
  assert.ok(
    productionProblems({ ...valid, FISH_ALLOW_VOICE_CREATION: "false" }).some(
      (issue) => issue.includes("creation is disabled"),
    ),
  );
});

test("deployment accepts paired same-origin settings and rejects an unusable browser API address", () => {
  assert.deepEqual(productionProblems(valid), []);
  assert.deepEqual(
    productionProblems({
      ...valid,
      NEXT_PUBLIC_API_BASE_URL: valid.BACKEND_PUBLIC_URL + "/",
    }),
    [],
  );
  for (const address of [
    "api",
    "/v1",
    "http://127.0.0.1:3000",
    "https://wrong.webvc.test",
    valid.BACKEND_PUBLIC_URL + "/v1",
    valid.BACKEND_PUBLIC_URL + "?mode=demo",
    "https://user:password@dubbing.webvc.test",
  ]) {
    assert.ok(
      productionProblems({ ...valid, NEXT_PUBLIC_API_BASE_URL: address }).some(
        (issue) => issue.includes("NEXT_PUBLIC_API_BASE_URL"),
      ),
    );
  }
  for (const key of ["BACKEND_PUBLIC_URL", "NEXT_PUBLIC_SITE_URL"]) {
    assert.ok(
      productionProblems({
        ...valid,
        [key]: valid.BACKEND_PUBLIC_URL + "/prefix",
      }).some((issue) => issue.includes(key)),
    );
  }
});

test("deployment catches missing cross-origin access and malformed Auth0 domains before startup", () => {
  const separate = {
    ...valid,
    NEXT_PUBLIC_SITE_URL: "https://app.webvc.test",
    NEXT_PUBLIC_API_BASE_URL: valid.BACKEND_PUBLIC_URL,
  };
  assert.ok(
    productionProblems(separate).some((issue) =>
      issue.includes("API_ALLOWED_ORIGINS"),
    ),
  );
  assert.deepEqual(
    productionProblems({
      ...separate,
      API_ALLOWED_ORIGINS: separate.NEXT_PUBLIC_SITE_URL,
    }),
    [],
  );
  for (const domain of [
    "https://tenant.auth0.test",
    "tenant.auth0.test/path",
    "user@tenant.auth0.test",
  ]) {
    assert.ok(
      productionProblems({ ...valid, NEXT_PUBLIC_AUTH0_DOMAIN: domain }).some(
        (issue) => issue.includes("NEXT_PUBLIC_AUTH0_DOMAIN"),
      ),
    );
  }
});
