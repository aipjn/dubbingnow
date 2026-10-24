// Browser contract test with intercepted HTTP and synthetic test audio; no real clone/consent submission.
// Run against the live-mode build (NEXT_PUBLIC_API_BASE_URL=/).
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
const origin = "http://127.0.0.1:3000";
const fish = process.env.TEST_CLONE_PROVIDER !== "google";
function wav(seconds) {
  const b = Buffer.alloc(44 + seconds * 24000 * 2);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(24000, 24);
  b.writeUInt32LE(48000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(b.length - 44, 40);
  for (let i = 0; i < seconds * 24000; i++)
    b.writeInt16LE(Math.round(4000 * Math.sin((i * Math.PI) / 50)), 44 + i * 2);
  return b;
}
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const uploads = new Map();
  let quoteBody,
    jobBody,
    created = false;
  const quota = {
    kind: "guest",
    availableCredits: 0,
    reservedCredits: 0,
    voiceTier: "standard",
    maxDurationSeconds: 30,
    maxFileBytes: 500000000,
    trial: {
      remainingUses: 1,
      maxDurationSeconds: 30,
      verifiedUntil: new Date(Date.now() + 600000).toISOString(),
    },
  };
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
  const asset = {
    url: "/demo/spanish.wav",
    filename: "cloned-test.wav",
    contentType: "audio/wav",
    expiresAt: null,
  };
  const task = () => ({
    id: "clone-test-job",
    status: created ? "completed" : "queued",
    progress: created ? 100 : 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pollAfterMs: 500,
    cacheHit: false,
    error: null,
    result: created
      ? {
          mediaType: "audio",
          preview: asset,
          download: asset,
          durationSeconds: 18,
          sourceLanguage: "en",
          targetLanguage: "es",
          speakerCount: 1,
          isDemo: false,
          voiceMode: "clone",
        }
      : null,
  });
  await page.route("**/v1/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      p = url.pathname.replace(/^\/v1/, "");
    let body,
      status = 200;
    if (p === "/sessions")
      body = {
        id: "clone-session",
        token: "test-guest-token",
        user: null,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
    else if (p === "/billing/policy") body = policy;
    else if (p === "/quota") body = quota;
    else if (p === "/capabilities")
      body = {
        languages: ["en", "es"].map((code) => ({
          code,
          name: code === "en" ? "English" : "Spanish",
          supportsSource: true,
          supportsTarget: true,
        })),
        maxFileBytes: 500000000,
        acceptedContentTypes: ["audio/wav", "audio/mpeg"],
        voiceCloning: {
          provider: fish ? "fish" : "google",
          requiresConsentRecording: !fish,
          singleVoiceTest: fish,
        },
      };
    else if (p === "/uploads") {
      const input = request.postDataJSON(),
        id = randomUUID();
      uploads.set(id, { input });
      body = {
        id,
        url: `${origin}/v1/files/upload/${id}`,
        method: "PUT",
        headers: { "Content-Type": "audio/wav" },
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      };
    } else if (p.startsWith("/files/upload/")) {
      const u = uploads.get(p.split("/").pop()),
        bytes = request.postDataBuffer();
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        u.input.sha256,
      );
      u.bytes = bytes;
      await route.fulfill({ status: 204 });
      return;
    } else if (/^\/uploads\/[^/]+\/complete$/.test(p)) {
      const id = p.split("/")[2],
        u = uploads.get(id);
      assert.ok(u.bytes);
      body = {
        id,
        durationSeconds: u.input.filename === "source-test.wav" ? 18 : 2,
        mediaType: "audio",
      };
    } else if (p === "/jobs/quote") {
      quoteBody = request.postDataJSON();
      body = {
        id: randomUUID(),
        kind: "trial",
        durationSeconds: 18,
        credits: 0,
        policyVersion: "1",
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      };
    } else if (p === "/jobs") {
      jobBody = request.postDataJSON();
      assert.ok(request.headers()["idempotency-key"]);
      body = task();
      created = true;
      status = 202;
    } else if (p === "/jobs/clone-test-job") body = task();
    else throw new Error(`Unexpected test request: ${p}`);
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto(origin + "/audio-dubbing");
  await expect(page.getByLabel("Voice", { exact: true })).toHaveValue(
    fish ? "clone" : "preset",
  );
  await page.locator("#recording-file").setInputFiles({
    name: "source-test.wav",
    mimeType: "audio/wav",
    buffer: wav(18),
  });
  await page.getByLabel("Voice", { exact: true }).selectOption("clone");
  if (!fish) {
    await expect(
      page.getByRole("button", { name: "Dub Audio Free" }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Add speaker", exact: true })
      .click();
    await expect(page.locator(".clone-consents input[type=file]")).toHaveCount(
      2,
    );
    await page.getByRole("button", { name: "Remove last speaker" }).click();
    await page.locator(".clone-consents input[type=file]").setInputFiles({
      name: "synthetic-test-consent.wav",
      mimeType: "audio/wav",
      buffer: wav(2),
    });
    await expect(
      page.getByRole("button", { name: "Dub Audio Free" }),
    ).toBeEnabled();
  } else {
    await expect(page.locator(".clone-consents input[type=file]")).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Dub Audio Free" }),
    ).toBeEnabled();
  }
  await mkdir(".runtime/screenshots", { recursive: true });
  await page.screenshot({
    path: ".runtime/screenshots/clone-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Voice", { exact: true })).toBeVisible();
  const voiceBox = await page
    .getByLabel("Voice", { exact: true })
    .boundingBox();
  const targetBox = await page.getByLabel("Dub into").boundingBox();
  const consentBox = await page.locator(".clone-consents").boundingBox();
  const actionBox = await page
    .getByRole("button", { name: "Dub Audio Free" })
    .boundingBox();
  assert.ok(voiceBox.y >= targetBox.y + targetBox.height);
  assert.ok(consentBox.width > 300);
  assert.ok(actionBox.y >= consentBox.y + consentBox.height);
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= 390),
  );
  await page.screenshot({
    path: ".runtime/screenshots/clone-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dub Audio Free" }).click();
  await expect(
    page.getByRole("heading", { name: "Ready for a new audience." }),
  ).toBeVisible();
  assert.equal(uploads.size, fish ? 1 : 2);
  assert.equal(quoteBody.voiceMode, "clone");
  if (fish) assert.equal(quoteBody.consentUploads, undefined);
  else {
    assert.equal(quoteBody.consentUploads.length, 1);
    assert.equal(quoteBody.consentUploads[0].speaker, 0);
    assert.notEqual(quoteBody.consentUploads[0].uploadId, quoteBody.uploadId);
  }
  assert.deepEqual(
    { ...jobBody, quoteId: undefined },
    { ...quoteBody, quoteId: undefined },
  );
  const timings = await page.evaluate(() =>
    JSON.parse(
      sessionStorage.getItem("dubbingnow.client-timing.v1.clone-session"),
    ),
  );
  assert.ok(timings.totalMs > 0);
  assert.ok(timings.phases.processing >= 500);
  assert.deepEqual(errors, []);
  console.log(
    "Clone browser contract passed: provider-specific uploads, fixed-voice mode, quote/job, result flow, client timing and mobile layout. All HTTP responses were intercepted; no real clone was created.",
  );
} finally {
  await browser.close();
}
