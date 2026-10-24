// Opt-in real Google + Fish test. Run with npm run test:full-chain.
// Seeds a verified guest in an isolated local database; Auth0/Turnstile are outside scope.
// No HTTP interception. Requires a production build and the previously saved Fish voice.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { openSync, closeSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";
import { loadConfig } from "../server/config.ts";
import { Store } from "../server/store.ts";
import { FishVoice } from "../server/providers/fish.ts";

const origin = "http://127.0.0.1:3000";
await mkdir(".runtime/full-chain", { recursive: true });
const out = await mkdtemp(path.resolve(".runtime/full-chain/run-"));
const originalConfig = loadConfig();
const voice = new FishVoice(originalConfig);
const voiceId = await voice.existing(AbortSignal.timeout(120000));
assert.ok(voiceId, "Create the one saved test voice before running this test.");
const beforeVoices = await voice.models(AbortSignal.timeout(120000));
assert.equal(beforeVoices.length, 1);
assert.equal(beforeVoices[0]._id, voiceId);
assert.ok(originalConfig.googleKey && originalConfig.fishKey);
process.env.BACKEND_DATA_DIR = path.join(out, "data");
process.env.FISH_REFERENCE_ID = voiceId;
process.env.BACKEND_PUBLIC_URL = origin;
const config = loadConfig();
const store = new Store(config);
const guest = store.createGuest("full-chain-" + randomUUID());
const actor = store.guestByToken(guest.token);
store.verifyGuest(actor, "local-fixture-" + randomUUID());
const children = [];
const logFiles = [];
let browser;
let report = {
  outcome: "failed",
  scope:
    "Real browser media workers, Next HTTP API, signed upload/download, SQLite queue, Google transcription/translation, saved Fish clone, local MP4 merge, playback and refresh recovery. Verified guest seeded locally; no Auth0/Turnstile verification or payment test.",
  voiceId,
};
const startChild = (name, args) => {
  const fd = openSync(path.join(out, name + ".log"), "w", 0o600);
  logFiles.push(fd);
  const child = spawn(process.execPath, args, {
    env: process.env,
    stdio: ["ignore", fd, fd],
  });
  children.push(child);
  return child;
};
const probe = (filename) =>
  JSON.parse(
    execFileSync(
      config.ffprobe,
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", filename],
      { encoding: "utf8" },
    ),
  );
const packetHashes = (filename, stream) =>
  JSON.parse(
    execFileSync(
      config.ffprobe,
      [
        "-v",
        "error",
        "-select_streams",
        stream,
        "-show_packets",
        "-show_data_hash",
        "sha256",
        "-of",
        "json",
        filename,
      ],
      { encoding: "utf8" },
    ),
  ).packets.map((p) => p.data_hash);
try {
  assert.equal(
    await fetch(origin + "/v1/health", {
      signal: AbortSignal.timeout(1000),
    }).then(
      () => true,
      () => false,
    ),
    false,
    "Port 3000 must be free; this test starts its own isolated server.",
  );
  const reference = path.resolve(".runtime/fish/test-reference.wav");
  const source = path.join(out, "source.mp4");
  const referenceSeconds = Number(probe(reference).format.duration);
  execFileSync(config.ffmpeg, [
    "-v",
    "error",
    "-y",
    "-stream_loop",
    "-1",
    "-i",
    "public/demo/english.mp4",
    "-i",
    reference,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-t",
    String(referenceSeconds),
    source,
  ]);
  const input = probe(source);
  const server = startChild("server", [
    "scripts/next-cli.mjs",
    "start",
    "--hostname",
    "127.0.0.1",
  ]);
  for (let i = 0; ; i++) {
    assert.equal(
      server.exitCode,
      null,
      "Next server exited; inspect server.log.",
    );
    if (
      await fetch(origin + "/v1/health").then(
        (r) => r.ok,
        () => false,
      )
    )
      break;
    assert.ok(i < 100, "Next server startup timed out.");
    await delay(300);
  }
  startChild("worker", ["--import", "tsx", "server/worker.ts"]);
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [],
    requests = [],
    responses = [];
  let quoteBody, jobBody, jobId, uploadMetadata;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin || !url.pathname.startsWith("/v1/")) return;
    const item = {
      method: request.method(),
      pathname: url.pathname,
      atMs: Date.now(),
    };
    requests.push(item);
    if (request.method() === "POST") {
      if (url.pathname === "/v1/uploads")
        uploadMetadata = request.postDataJSON();
      if (url.pathname === "/v1/jobs/quote") quoteBody = request.postDataJSON();
      if (url.pathname === "/v1/jobs") jobBody = request.postDataJSON();
    }
  });
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (url.origin !== origin || !url.pathname.startsWith("/v1/")) return;
    responses.push({
      method: response.request().method(),
      pathname: url.pathname,
      status: response.status(),
    });
    if (
      url.pathname === "/v1/jobs" &&
      response.request().method() === "POST" &&
      response.ok()
    )
      jobId = (await response.json()).id;
  });
  await page.addInitScript(
    ({ guest, origin }) => {
      if (
        location.origin === origin &&
        !localStorage.getItem("dubbingnow.session.v1")
      )
        localStorage.setItem("dubbingnow.session.v1", JSON.stringify(guest));
    },
    { guest, origin },
  );
  await page.goto(origin + "/ai-video-dubbing");
  await expect(page.getByLabel("Voice", { exact: true })).toHaveValue("clone");
  await page.getByLabel("Dub into").selectOption("es");
  await page.locator("#recording-file").setInputFiles(source);
  const action = page.getByRole("button", {
    name: "Dub Video Free",
    exact: true,
  });
  await expect(action).toBeEnabled();
  const started = performance.now();
  await action.click();
  const downloadLink = page.getByRole("link", {
    name: "Download video",
    exact: true,
  });
  await expect(downloadLink).toHaveAttribute("href", /^blob:/, {
    timeout: 240000,
  });
  const readyMs = Math.round(performance.now() - started);
  assert.ok(jobId);
  assert.equal(quoteBody.voiceMode, "clone");
  assert.equal(jobBody.voiceMode, "clone");
  assert.equal(jobBody.targetLanguage, "es");
  assert.equal(jobBody.consentUploads, undefined);
  assert.ok(uploadMetadata.contentType.startsWith("audio/"));
  assert.ok(uploadMetadata.sizeBytes < Number(input.format.size));
  const uploaded = probe(
    path.join(config.dataDir, "uploads", jobBody.uploadId),
  );
  assert.deepEqual(
    uploaded.streams.map((s) => s.codec_type),
    ["audio"],
  );
  const download = await Promise.all([
    page.waitForEvent("download"),
    downloadLink.click(),
  ]).then(([d]) => d);
  const result = path.join(out, "dubbed-es.mp4");
  await download.saveAs(result);
  const output = probe(result);
  const outputVideo = output.streams.find((s) => s.codec_type === "video");
  const outputAudio = output.streams.find((s) => s.codec_type === "audio");
  assert.ok(outputVideo && outputAudio);
  assert.equal(outputVideo.codec_name, "h264");
  assert.equal(outputAudio.codec_name, "aac");
  assert.ok(
    Math.abs(Number(output.format.duration) - Number(input.format.duration)) <
      0.15,
  );
  assert.deepEqual(
    packetHashes(source, "v:0"),
    packetHashes(result, "v:0"),
    "Video packets must remain unchanged.",
  );
  assert.notDeepEqual(packetHashes(source, "a:0"), packetHashes(result, "a:0"));
  execFileSync(config.ffmpeg, ["-v", "error", "-i", result, "-f", "null", "-"]);
  const preview = page.getByLabel("Dubbed video preview");
  await preview.evaluate(async (video) => {
    await video.play();
  });
  await expect
    .poll(() => preview.evaluate((v) => v.currentTime), { timeout: 10000 })
    .toBeGreaterThan(0.2);
  await preview.evaluate((v) => v.pause());
  const clientTimings = await page.evaluate(() =>
    Object.fromEntries(
      Object.entries(sessionStorage)
        .filter(([k]) => k.startsWith("dubbingnow.client-timing.v1."))
        .map(([k, v]) => [k, JSON.parse(v)]),
    ),
  );
  const backendTimings = JSON.parse(
    await readFile(
      path.join(config.dataDir, "metrics", jobId + ".json"),
      "utf8",
    ),
  );
  assert.equal(backendTimings.outcome, "completed");
  assert.equal(backendTimings.savedVoiceReused, true);
  assert.equal(backendTimings.cloneProvider, "fish");
  assert.equal(backendTimings.streamingText, !!config.streamingTextPipeline);
  assert.ok(
    backendTimings.timings.requests.some(
      (r) => r.endpoint === "fish/tts" && r.status === 200,
    ),
  );
  assert.ok(
    backendTimings.timings.requests.some(
      (r) => r.endpoint === "interactions" && r.status === 200,
    ),
  );
  const settled = store.get(
    "SELECT status,settled FROM jobs WHERE id=?",
    jobId,
  );
  assert.equal(settled.status, "completed");
  assert.equal(settled.settled, 1);
  assert.equal(store.quota(actor).trial.remainingUses, 0);
  await page.screenshot({
    path: path.join(out, "desktop-result.png"),
    fullPage: true,
  });
  const restoreStarted = performance.now();
  await page.reload();
  const reselect = page.getByLabel("Reselect original video");
  await expect(reselect).toBeVisible({ timeout: 15000 });
  await reselect.setInputFiles(source);
  await expect(downloadLink).toHaveAttribute("href", /^blob:/, {
    timeout: 30000,
  });
  const refreshRecoveryMs = Math.round(performance.now() - restoreStarted);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= 390),
  );
  await expect(downloadLink).toBeVisible();
  await page.screenshot({
    path: path.join(out, "mobile-result.png"),
    fullPage: true,
  });
  assert.equal(
    requests.filter((r) => r.method === "POST" && r.pathname === "/v1/uploads")
      .length,
    1,
  );
  assert.equal(
    requests.filter((r) => r.method === "POST" && r.pathname === "/v1/jobs")
      .length,
    1,
  );
  assert.equal(requests.filter((r) => r.method === "PUT").length, 1);
  assert.equal(store.get("SELECT count(*) AS n FROM jobs").n, 1);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    responses.filter((r) => r.status >= 400),
    [],
  );
  const afterVoices = await voice.models(AbortSignal.timeout(120000));
  assert.equal(afterVoices.length, 1);
  assert.equal(afterVoices[0]._id, voiceId);
  report = {
    ...report,
    outcome: "completed",
    jobId,
    readyMs,
    refreshRecoveryMs,
    inputSeconds: Number(input.format.duration),
    outputSeconds: Number(output.format.duration),
    sourceBytes: Number(input.format.size),
    sourceSha256: createHash("sha256")
      .update(await readFile(source))
      .digest("hex"),
    streaming: !!config.streamingTextPipeline,
    uploadedBytes: uploadMetadata.sizeBytes,
    ownVoiceCountBefore: beforeVoices.length,
    ownVoiceCountAfter: afterVoices.length,
    browserErrors: errors,
    clientTimings,
    backendTimings,
    requests,
    responses,
    checks: [
      "audio-only upload",
      "clone mode",
      "saved voice reused",
      "real Google + Fish HTTP 200",
      "one job and one trial settlement",
      "same video packets",
      "new AAC audio",
      "MP4 decodes",
      "preview plays",
      "refresh recovers with original video",
      "mobile layout",
      "one owned voice before and after",
    ],
    result,
  };
  console.log(
    JSON.stringify({
      outcome: report.outcome,
      readyMs,
      refreshRecoveryMs,
      jobId,
      result,
      report: path.join(out, "report.json"),
    }),
  );
} catch (error) {
  report.error = error.message;
  console.error(error.message);
  console.error("Artifacts: " + out);
  process.exitCode = 1;
} finally {
  await writeFile(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  await browser?.close();
  for (const child of children) child.kill("SIGTERM");
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null)
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        delay(5000),
      ]);
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  }
  logFiles.forEach(closeSync);
  store.close();
}
