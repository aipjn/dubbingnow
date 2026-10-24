// Run against a production build with NEXT_PUBLIC_API_BASE_URL=/; HTTP is intercepted, no supplier calls.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const expires = new Date(Date.now() + 86400000).toISOString();
  const now = new Date().toISOString();
  let jobsPosted = 0,
    gets = 0;
  const result = {
    mediaType: "audio",
    preview: {
      url: "/demo/spanish.wav",
      filename: "result.wav",
      contentType: "audio/wav",
      expiresAt: expires,
    },
    download: {
      url: "/demo/spanish.wav",
      filename: "result.wav",
      contentType: "audio/wav",
      expiresAt: expires,
    },
    durationSeconds: 9,
    sourceLanguage: "en",
    targetLanguage: "es",
    speakerCount: 1,
    isDemo: false,
    voiceMode: "clone",
  };
  const job = (status) => ({
    id: "audit-audio-job",
    status,
    progress: status === "completed" ? 100 : 20,
    createdAt: now,
    updatedAt: now,
    pollAfterMs: 500,
    cacheHit: false,
    error: null,
    result: status === "completed" ? result : null,
  });
  await page.route("**/v1/**", async (route) => {
    const p = new URL(route.request().url()).pathname.replace("/v1", "");
    let body = {};
    if (p === "/sessions")
      body = {
        id: "audit-session",
        token: "guest_audit",
        expiresAt: expires,
        user: null,
      };
    else if (p === "/billing/policy")
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
    else if (p === "/quota")
      body = {
        kind: "guest",
        availableCredits: 0,
        reservedCredits: 0,
        trial: {
          remainingUses: 1,
          maxDurationSeconds: 30,
          verifiedUntil: expires,
        },
        maxDurationSeconds: 30,
        maxFileBytes: 500000000,
        voiceTier: "standard",
      };
    else if (p === "/capabilities")
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
        acceptedContentTypes: ["audio/wav"],
        voiceCloning: {
          provider: "fish",
          requiresConsentRecording: false,
          singleVoiceTest: true,
        },
      };
    else if (p === "/uploads")
      body = {
        id: "audit-upload",
        url: "http://127.0.0.1:3000/v1/files/upload/audit-upload",
        method: "PUT",
        headers: { "Content-Type": "audio/wav" },
        expiresAt: expires,
      };
    else if (p === "/files/upload/audit-upload") {
      await route.fulfill({ status: 204 });
      return;
    } else if (p === "/uploads/audit-upload/complete")
      body = { id: "audit-upload", durationSeconds: 9, mediaType: "audio" };
    else if (p === "/jobs/quote")
      body = {
        id: "audit-quote",
        kind: "trial",
        credits: 0,
        durationSeconds: 9,
        policyVersion: "1",
        expiresAt: expires,
      };
    else if (p === "/jobs") {
      jobsPosted++;
      body = job("transcribing");
    } else if (p === "/jobs/audit-audio-job") {
      gets++;
      body = job("completed");
    } else throw Error("Unhandled " + p);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto("http://127.0.0.1:3000/audio-dubbing");
  await expect(
    page.getByText("30s free trial", { exact: false }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("public/demo/english.wav");
  await page
    .getByRole("button", { name: "Dub Audio Free", exact: true })
    .click();
  await expect(page.getByLabel("Dubbed audio preview")).toBeVisible({
    timeout: 15000,
  });
  const beforeKeys = await page.evaluate(() => Object.keys(sessionStorage));
  const beforeGets = gets;
  await page.reload();
  await expect(
    page.getByText("30s free trial", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Dubbed audio preview")).toBeVisible();
  const restored = await page.getByLabel("Dubbed audio preview").count();
  assert.equal(jobsPosted, 1);
  assert.ok(gets > beforeGets);
  const report = {
    scope: "Production UI with mocked HTTP; no supplier calls",
    jobsPosted,
    completedAudioVisibleBeforeReload: true,
    sessionStorageKeysBeforeReload: beforeKeys,
    jobFetchesAfterReload: gets - beforeGets,
    audioRestoredAfterReload: restored > 0,
  };
  await writeFile(
    ".runtime/launch-review/audio-recovery.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
