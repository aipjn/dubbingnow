// Transport is mocked; extraction, decoding, encoding and merging run in real browser workers.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
const ffmpeg = process.env.FFMPEG_PATH || "/Users/h0270/miniconda3/bin/ffmpeg";
const ffprobe =
  process.env.FFPROBE_PATH || "/Users/h0270/miniconda3/bin/ffprobe";
const outputDir = "test-results/live-video";
mkdirSync(outputDir, { recursive: true });
const probe = (file) =>
  JSON.parse(
    execFileSync(
      ffprobe,
      ["-v", "error", "-show_streams", "-of", "json", file],
      { encoding: "utf8" },
    ),
  );
const duration = Number(
  probe("public/demo/english.mp4").streams.find((s) => s.codec_type === "video")
    .duration,
);
const aligned = `${outputDir}/aligned.wav`;
const stereoInput = `${outputDir}/stereo.mp4`;
execFileSync(ffmpeg, [
  "-v", "error", "-y", "-i", "public/demo/english.mp4", "-f", "lavfi", "-i",
  `aevalsrc=0.1*sin(2*PI*220*t)|0.1*sin(2*PI*330*t):s=48000:d=${duration}`,
  "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-shortest", stereoInput,
]);
execFileSync(ffmpeg, [
  "-v",
  "error",
  "-y",
  "-i",
  "public/demo/spanish.wav",
  "-af",
  "apad",
  "-t",
  String(duration),
  aligned,
]);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const audioPackets = (file) =>
  JSON.parse(
    execFileSync(
      ffprobe,
      [
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_packets",
        "-show_data_hash",
        "sha256",
        "-of",
        "json",
        file,
      ],
      { encoding: "utf8" },
    ),
  ).packets.map((packet) => packet.data_hash);
const browser = await chromium.launch();
try {
  for (const mode of ["aac", "wav", "misaligned"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const videoPath = mode === "wav" ? stereoInput : "public/demo/english.mp4";
    const original = readFileSync(videoPath);
    let metadata,
      uploads = 0,
      jobPosts = 0,
      finishAt = Infinity;
    const now = new Date().toISOString();
    const asset = {
      url: "https://storage.dubbingnow.test/result.wav",
      filename: "dub.wav",
      contentType: "audio/wav",
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    };
    const job = () => ({
      id: "video-job",
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
              preview: asset,
              download: asset,
              durationSeconds: Math.ceil(duration),
              sourceLanguage: "en",
              targetLanguage: "es",
              speakerCount: 1,
              isDemo: false,
            }
          : null,
    });
    await page.route("https://storage.dubbingnow.test/**", async (route) => {
      if (route.request().method() === "PUT") {
        const bytes = route.request().postDataBuffer();
        assert.equal(route.request().headers().authorization, undefined);
        assert.equal(hash(bytes), metadata.sha256);
        assert.equal(bytes.length, metadata.sizeBytes);
        assert.notEqual(hash(bytes), hash(original));
        const local = `${outputDir}/${mode}-uploaded.${mode === "wav" ? "wav" : "m4a"}`;
        writeFileSync(local, bytes);
        const media = probe(local);
        assert.deepEqual(
          media.streams.map((s) => s.codec_type),
          ["audio"],
        );
        assert.equal(
          media.streams[0].codec_name,
          mode === "wav" ? "pcm_s16le" : "aac",
        );
        if (mode === "wav") {
          const originalAudio = probe(videoPath).streams.find((s) => s.codec_type === "audio");
          assert.equal(media.streams[0].sample_rate, originalAudio.sample_rate);
          assert.equal(media.streams[0].channels, Math.min(2, originalAudio.channels));
        } else {
          assert.ok(bytes.length < original.length);
          assert.deepEqual(
            audioPackets(local),
            audioPackets("public/demo/english.mp4"),
          );
        }
        uploads++;
        await route.fulfill({
          status: 200,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: "",
        });
      } else
        await route.fulfill({
          status: 200,
          contentType: "audio/wav",
          headers: { "Access-Control-Allow-Origin": "*" },
          body: readFileSync(
            mode === "misaligned" ? "public/demo/spanish.wav" : aligned,
          ),
        });
    });
    await page.route("https://api.dubbingnow.test/v1/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname.replace(
        "/v1",
        "",
      );
      let body,
        status = 200;
      if (pathname === "/billing/policy")
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
      else if (pathname === "/jobs/quote")
        body = {
          id: "quote-test",
          kind: "trial",
          credits: 0,
          durationSeconds: 12,
          policyVersion: "1",
          expiresAt: new Date(Date.now() + 900000).toISOString(),
        };
      else if (pathname === "/sessions") {
        status = 201;
        body = {
          id: "ses-video",
          token: "secret",
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        };
      } else if (pathname === "/capabilities")
        body = {
          languages: ["en", "es"].map((code) => ({
            code,
            name: code,
            supportsSource: true,
            supportsTarget: true,
          })),
          maxFileBytes: 500000000,
          acceptedContentTypes:
            mode === "wav" ? ["audio/wav"] : ["audio/mp4", "audio/wav"],
        };
      else if (pathname === "/quota")
        body = {
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
      else if (pathname === "/uploads") {
        metadata = route.request().postDataJSON();
        assert.equal(
          metadata.contentType,
          mode === "wav" ? "audio/wav" : "audio/mp4",
        );
        status = 201;
        body = {
          id: "video-audio-upload",
          url: "https://storage.dubbingnow.test/upload",
          method: "PUT",
          headers: { "Content-Type": metadata.contentType },
          expiresAt: new Date(Date.now() + 900000).toISOString(),
        };
      } else if (pathname === "/uploads/video-audio-upload/complete")
        body = {
          id: "video-audio-upload",
          durationSeconds: Math.ceil(duration),
          mediaType: "audio",
        };
      else if (pathname === "/jobs") {
        jobPosts++;
        const input = route.request().postDataJSON();
        assert.ok(Math.abs(input.timeline.durationSeconds - duration) < 0.01);
        assert.equal(input.timeline.audioOffsetSeconds, 0);
        assert.equal(input.uploadId, "video-audio-upload");
        assert.equal(input.quoteId, "quote-test");
        assert.ok(route.request().headers()["idempotency-key"]);
        finishAt = Date.now() + 1500;
        status = 202;
        body = job();
      } else if (pathname === "/jobs/video-job") body = job();
      else throw new Error(`Unexpected request ${pathname}`);
      await route.fulfill({
        status,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(body),
      });
    });
    await page.goto("http://127.0.0.1:3000/ai-video-dubbing");
    await expect(page.getByText("30s free trial")).toBeVisible();
    await page
      .locator("#recording-file")
      .setInputFiles(videoPath);
    await page.getByRole("button", { name: "Dub Video Free" }).click();
    await expect(
      page.getByText("Listening to every speaker", { exact: true }),
    ).toBeVisible();
    if (mode === "aac") {
      await page.reload();
      await expect(page.getByLabel("Reselect original video")).toBeVisible({
        timeout: 15000,
      });
      await page.getByLabel("Reselect original video").setInputFiles({
        name: "wrong.mp4",
        mimeType: "video/mp4",
        buffer: Buffer.alloc(original.length),
      });
      await expect(page.locator(".tool-error")).toContainText(
        "not the original video",
      );
      await page
        .getByLabel("Reselect original video")
        .setInputFiles("public/demo/english.mp4");
    }
    if (mode === "misaligned") {
      await expect(page.locator(".tool-error")).toContainText(
        "audio timing is incorrect",
        { timeout: 20000 },
      );
      await expect(
        page.getByRole("link", { name: "Download recording" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Retry video download" }).click();
      await expect(page.locator(".tool-error")).toContainText(
        "audio timing is incorrect",
      );
    } else {
      await expect(
        page.getByRole("link", { name: "Download video", exact: true }),
      ).toHaveAttribute("href", /^blob:/, { timeout: 20000 });
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("link", { name: "Download video", exact: true }).click(),
      ]);
      await download.saveAs(`${outputDir}/${mode}-merged.mp4`);
      if (mode === "aac") {
        await page.reload();
        await expect(page.getByLabel("Reselect original video")).toBeVisible();
        await page
          .getByLabel("Reselect original video")
          .setInputFiles("public/demo/english.mp4");
        await expect(
          page.getByRole("link", { name: "Download video", exact: true }),
        ).toHaveAttribute("href", /^blob:/, { timeout: 15000 });
      }
    }
    assert.equal(uploads, 1);
    assert.equal(jobPosts, 1);
    assert.deepEqual(errors, []);
    console.log(
      `Live video ${mode}: audio-only PUT (${metadata.sizeBytes}/${original.length} bytes), timeline, ${mode === "aac" ? "reload recovery and hash verification, " : ""}${mode === "misaligned" ? "alignment rejection" : "local MP4 merge"} passed.`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
