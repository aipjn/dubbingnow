// Browser integration against intercepted HTTP responses, not a backend implementation.
// Run against a build configured with NEXT_PUBLIC_API_BASE_URL=https://api.dubbingnow.test.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let jobKey = null;
  let jobPosts = 0;
  let uploads = 0;
  let sessions = 0;
  let finishAt = Infinity;
  const now = new Date().toISOString();
  const quota = {
    kind: "guest",
    availableCredits: 0,
    reservedCredits: 0,
    trial: {
      remainingUses: 1,
      maxDurationSeconds: 30,
      verifiedUntil: new Date(Date.now() + 600000).toISOString(),
    },
    maxDurationSeconds: 30,
    maxFileBytes: 500000000,
    resetsAt: new Date(Date.now() + 86400000).toISOString(),
    voiceTier: "standard",
  };
  const task = () => ({
    id: "job-live-test",
    status: Date.now() >= finishAt ? "completed" : "transcribing",
    progress: Date.now() >= finishAt ? 100 : 20,
    createdAt: now,
    updatedAt: now,
    pollAfterMs: 500,
    cacheHit: false,
    error: null,
    result:
      Date.now() >= finishAt
        ? {
            mediaType: "audio",
            preview: {
              url: "/demo/spanish.wav",
              filename: "result.wav",
              contentType: "audio/wav",
              expiresAt: new Date(Date.now() + 900000).toISOString(),
            },
            download: {
              url: "/demo/spanish.wav",
              filename: "result.wav",
              contentType: "audio/wav",
              expiresAt: new Date(Date.now() + 900000).toISOString(),
            },
            durationSeconds: 9,
            sourceLanguage: "en",
            targetLanguage: "es",
            speakerCount: 1,
            isDemo: false,
          }
        : null,
  });
  await page.route("https://storage.dubbingnow.test/**", async (route) => {
    assert.equal(route.request().method(), "PUT");
    assert.equal(route.request().headers().authorization, undefined);
    assert.equal(route.request().headers()["content-type"], "audio/wav");
    assert.equal(
      createHash("sha256")
        .update(route.request().postDataBuffer())
        .digest("hex"),
      createHash("sha256")
        .update(readFileSync("public/demo/english.wav"))
        .digest("hex"),
    );
    uploads += 1;
    await route.fulfill({
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "",
    });
  });
  await page.route("https://api.dubbingnow.test/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/v1", "");
    let body;
    let status = 200;
    if (!["/sessions", "/capabilities", "/billing/policy"].includes(path))
      assert.equal(
        route.request().headers().authorization,
        "Bearer test-session-secret",
      );
    if (path === "/billing/policy")
      body = {
        version: "1",
        signupCredits: 500,
        guestTrialSeconds: 30,
        guestTrialUses: 1,
        creditsPerMinute: { standard: 10, high_fidelity: 20 },
        rounding: "per_second",
        minimumCredits: 1,
        maxDurationSeconds: 7200,
      };
    else if (path === "/jobs/quote")
      body = {
        id: "quote-test",
        kind: "trial",
        credits: 0,
        durationSeconds: 12,
        policyVersion: "1",
        expiresAt: new Date(Date.now() + 900000).toISOString(),
      };
    else if (path === "/sessions") {
      sessions += 1;
      body = {
        id: "session-test",
        token: "test-session-secret",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
      status = 201;
    } else if (path === "/capabilities")
      body = {
        languages: [
          {
            code: "en",
            name: "English",
            supportsSource: true,
            supportsTarget: true,
          },
          {
            code: "es",
            name: "Spanish",
            supportsSource: true,
            supportsTarget: true,
          },
        ],
        maxFileBytes: 500000000,
        acceptedContentTypes: ["audio/wav", "audio/mp4"],
      };
    else if (path === "/quota") body = quota;
    else if (path === "/uploads") {
      assert.equal(
        route.request().postDataJSON().sha256,
        createHash("sha256")
          .update(readFileSync("public/demo/english.wav"))
          .digest("hex"),
      );
      body = {
        id: "upload-test",
        url: "https://storage.dubbingnow.test/upload",
        method: "PUT",
        headers: { "Content-Type": "audio/wav" },
        expiresAt: new Date(Date.now() + 900000).toISOString(),
      };
      status = 201;
    } else if (path === "/uploads/upload-test/complete")
      body = { id: "upload-test", durationSeconds: 9, mediaType: "audio" };
    else if (path === "/jobs") {
      jobPosts += 1;
      assert.deepEqual(route.request().postDataJSON(), {
        uploadId: "upload-test",
        sourceLanguage: "auto",
        targetLanguage: "es",
        voiceTier: "standard",
        quoteId: "quote-test",
      });
      const key = route.request().headers()["idempotency-key"];
      assert.ok(key);
      if (jobPosts === 1) {
        jobKey = key;
        await route.abort("failed");
        return;
      }
      assert.equal(key, jobKey);
      finishAt = Date.now() + 2500;
      body = task();
      status = 202;
    } else if (path === "/jobs/job-live-test") body = task();
    else throw new Error(`Unexpected API request: ${path}`);
    await route.fulfill({
      status,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(body),
    });
  });
  await page.goto("http://127.0.0.1:3000/audio-dubbing");
  await expect(page.getByText("30s free trial")).toBeVisible();
  await expect(page.getByText("Interactive demo", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Try a sample" }).click();
  await page.getByRole("button", { name: "Dub Audio Free" }).click();
  await expect(page.locator(".tool-error")).toContainText("couldn’t reach");
  await page.getByRole("button", { name: "Resume / check status" }).click();
  await expect(
    page.getByText("Listening to every speaker", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ready for a new audience." }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("link", { name: "Download recording" }),
  ).toHaveAttribute("href", "/demo/spanish.wav");
  await page.getByRole("button", { name: "Refresh links" }).click();
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Download recording" }),
  ).toHaveAttribute("href", "/demo/spanish.wav");
  assert.equal(uploads, 1);
  assert.equal(sessions, 1);
  assert.equal(jobPosts, 2);
  assert.deepEqual(errors, []);
  console.log(
    "Live HTTP integration passed: worker SHA-256, direct PUT, lost-response retry with original key, session reuse, reload recovery, polling and result links.",
  );
} finally {
  await browser.close();
}
