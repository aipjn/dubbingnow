import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const ffmpeg = process.env.FFMPEG_PATH || "/Users/h0270/miniconda3/bin/ffmpeg";
const ffprobe =
  process.env.FFPROBE_PATH || "/Users/h0270/miniconda3/bin/ffprobe";
function probe(file: string) {
  return JSON.parse(
    execFileSync(
      ffprobe,
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
      { encoding: "utf8" },
    ),
  );
}
function packets(file: string, stream: string) {
  const data = JSON.parse(
    execFileSync(
      ffprobe,
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
        file,
      ],
      { encoding: "utf8" },
    ),
  );
  return data.packets.map((p: any) => p.data_hash);
}
async function downloadVideo(page: Page, output: string) {
  await expect(
    page.getByRole("link", { name: "Download video", exact: true }),
  ).toHaveAttribute("href", /^blob:/, { timeout: 20000 });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download video", exact: true }).click(),
  ]);
  await download.saveAs(output);
}

test("video dubbing runs automatically and exposes only the finished result", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/ai-video-dubbing");
  await unlock(page);
  await expect(page.getByText("30s free trial")).toBeVisible();
  await expect(page.locator("#local-video-tools, .transfer-note")).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", {
      name: /Extract audio|Merge video|Load local samples/i,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Try a sample", exact: true }).click();
  await page.getByRole("button", { name: "Dub Video Free" }).click();
  await downloadVideo(page, testInfo.outputPath("dubbed.mp4"));
  const result = testInfo.outputPath("dubbed.mp4");
  expect(
    probe(result)
      .streams.map((s: any) => s.codec_type)
      .sort(),
  ).toEqual(["audio", "video"]);
  expect(packets(result, "v:0")).toEqual(
    packets("public/demo/english.mp4", "v:0"),
  );
  expect(packets(result, "a:0")).not.toEqual(
    packets("public/demo/english.mp4", "a:0"),
  );
  await expect(page.getByLabel("Dubbed video preview")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(
    /Extracting audio|Combining locally|without re-encoding|audio extraction|Only audio is uploaded/i,
  );
  await page
    .getByLabel("Dubbed video preview")
    .evaluate((video: HTMLVideoElement) => video.play());
  await page.waitForFunction(
    () =>
      (
        document.querySelector(
          'video[aria-label="Dubbed video preview"]',
        ) as HTMLVideoElement
      ).currentTime > 0.5,
  );
  expect(errors).toEqual([]);
});

test("silent input is rejected and rotated video retains orientation through the regular workflow", async ({
  page,
}, testInfo) => {
  const silent = testInfo.outputPath("silent.mp4"),
    rotated = testInfo.outputPath("rotated.mov");
  mkdirSync(path.dirname(silent), { recursive: true });
  execFileSync(ffmpeg, [
    "-v",
    "error",
    "-y",
    "-i",
    "public/demo/english.mp4",
    "-an",
    "-c:v",
    "copy",
    silent,
  ]);
  execFileSync(ffmpeg, [
    "-v",
    "error",
    "-y",
    "-i",
    "public/demo/english.mp4",
    "-c",
    "copy",
    "-metadata:s:v:0",
    "rotate=90",
    rotated,
  ]);
  await page.goto("/ai-video-dubbing");
  await unlock(page);
  await expect(page.getByText("30s free trial")).toBeVisible();
  await page.locator("#recording-file").setInputFiles(silent);
  await page.getByRole("button", { name: "Dub Video Free" }).click();
  await expect(page.locator(".tool-error")).toContainText("no audio track");
  await page.locator("#recording-file").setInputFiles(rotated);
  await page.getByRole("button", { name: "Dub Video Free" }).click();
  const output = testInfo.outputPath("rotated-dubbed.mp4");
  await downloadVideo(page, output);
  const before = probe(rotated).streams.find(
      (s: any) => s.codec_type === "video",
    ),
    after = probe(output).streams.find((s: any) => s.codec_type === "video");
  expect(
    after.side_data_list?.find(
      (s: any) => s.side_data_type === "Display Matrix",
    )?.rotation,
  ).toEqual(
    before.side_data_list?.find(
      (s: any) => s.side_data_type === "Display Matrix",
    )?.rotation,
  );
  expect(packets(output, "v:0")).toEqual(packets(rotated, "v:0"));
});

test("a longer demo audio track is trimmed to the chosen video automatically", async ({
  page,
}, testInfo) => {
  const short = testInfo.outputPath("short.mp4");
  mkdirSync(path.dirname(short), { recursive: true });
  execFileSync(ffmpeg, [
    "-v",
    "error",
    "-y",
    "-i",
    "public/demo/english.mp4",
    "-t",
    "3",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    short,
  ]);
  await page.goto("/ai-video-dubbing");
  await unlock(page);
  await expect(page.getByText("30s free trial")).toBeVisible();
  await page.locator("#recording-file").setInputFiles(short);
  await page.getByRole("button", { name: "Dub Video Free" }).click();
  const output = testInfo.outputPath("short-dubbed.mp4");
  await downloadVideo(page, output);
  expect(packets(output, "v:0")).toEqual(packets(short, "v:0"));
  expect(Number(probe(output).format.duration)).toBeLessThan(
    Number(
      probe(short).streams.find((s: any) => s.codec_type === "video").duration,
    ) + 0.1,
  );
});

async function unlock(page: import("@playwright/test").Page) {
  await page.getByLabel("Demo verification", { exact: true }).check();
  await page.getByRole("button", { name: "Unlock free trial" }).click();
  await expect(
    page.getByRole("button", { name: "Unlock free trial" }),
  ).toHaveCount(0);
}
