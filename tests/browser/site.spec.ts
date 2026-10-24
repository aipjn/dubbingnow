import { expect, test } from "@playwright/test";

test("sample upload completes in the current page and can start another job", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await unlock(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "AI Dubbing Online.",
  );
  await expect(page.getByText("30s free trial")).toBeVisible();
  await page.getByRole("button", { name: "Try a sample" }).click();
  await expect(page.getByText("a-story-worth-sharing.wav")).toBeVisible();
  await page.getByRole("button", { name: "Dub Video Free" }).click();
  await expect(
    page.getByRole("heading", { name: "Meet your sample result." }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("Your selected file has not been translated.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download sample" }),
  ).toHaveAttribute("href", "/demo/spanish.wav");
  await expect(
    page.locator("audio[aria-label='Dubbed audio preview']"),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Download sample" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dub another" }).click();
  await expect(
    page.getByRole("button", { name: "Dub Video Free" }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});

test("cancelling returns demo allowance and enables a fresh job", async ({
  page,
}) => {
  await page.goto("/");
  await unlock(page);
  await expect(page.getByText("30s free trial")).toBeVisible();
  await page.getByRole("button", { name: "Try a sample" }).click();
  await page.getByRole("button", { name: "Dub Video Free" }).click();
  await expect(
    page.getByRole("progressbar", { name: "Dubbing progress" }),
  ).toBeVisible();
  await expect(
    page.getByText("Waiting to start", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("30s free trial")).toBeVisible();
  await unlock(page);
  await expect(
    page.getByRole("button", { name: "Dub Video Free" }),
  ).toBeEnabled();
});

test("audio tool rejects video and explicit same-language dubbing is rejected", async ({
  page,
}) => {
  await page.goto("/audio-dubbing");
  await unlock(page);
  await page.locator("input[type=file]").setInputFiles({
    name: "video.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("fake"),
  });
  await expect(page.locator(".tool-error")).toContainText("MP3 or WAV");
  await page.getByRole("button", { name: "Try a sample" }).click();
  await page.getByLabel("Original language").selectOption("es");
  await page.getByRole("button", { name: "Dub Audio Free" }).click();
  await expect(page.locator(".tool-error")).toContainText(
    "different target language",
  );
});

test("language page selects its target; mobile upload and action fit in the first screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/languages/french/dub-video-to-french");
  await expect(page.getByLabel("Dub into")).toHaveValue("fr");
  // Wait for the session-backed tool to finish its initial remount before measuring.
  await expect(
    page.getByText("30s free trial", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose a file" }),
  ).toBeVisible();
  const upload = await page
    .getByRole("button", { name: "Choose a file" })
    .boundingBox();
  const action = await page
    .getByRole("button", { name: "Dub Video Free" })
    .boundingBox();
  expect(upload && upload.y + upload.height).toBeLessThan(844);
  expect(action && action.y + action.height).toBeLessThan(844);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("pricing cannot take demo payments; FAQ opens; tools are linked", async ({
  page,
}) => {
  await page.goto("/pricing");
  await expect(
    page.getByRole("button", { name: "Choose Creator" }),
  ).toBeDisabled();
  await expect(page.getByText("500 credits", { exact: true })).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: "How are credits counted?" })
    .click();
  await expect(
    page.getByText("Credits are calculated", { exact: false }),
  ).toBeVisible();
  await page.goto("/auto-dubbing");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Auto Dubbing",
  );
  await expect(page.locator(".tools-grid > a")).toHaveCount(3);
});

test("SEO HTML, sitemap and real not-found responses are available", async ({
  request,
}) => {
  const home = await request.get("/");
  const html = await home.text();
  expect(home.status()).toBe(200);
  const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
  expect(canonical && new URL(canonical).href).toBe("https://dubbingnow.com/");
  expect(html).toContain("SoftwareApplication");
  expect(html).toContain("How do I dub a video into another language?");
  expect(html).not.toContain('"@type":"FAQPage"');
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/auto-dubbing");
  expect(sitemap).toContain("/languages/spanish/dub-video-to-spanish");
  expect(sitemap).not.toContain("/billing/return");
  expect((await request.get("/not-a-tool")).status()).toBe(404);
});

async function unlock(page: import("@playwright/test").Page) {
  await page.getByLabel("Demo verification", { exact: true }).check();
  await page.getByRole("button", { name: "Unlock free trial" }).click();
  await expect(
    page.getByRole("button", { name: "Unlock free trial" }),
  ).toHaveCount(0);
}
