import { test, expect, type Page } from "@playwright/test";
async function identity(
  page: Page,
  email = "sample@example.test",
  admin = false,
) {
  await page.goto("/register");
  await page.getByLabel("Your name", { exact: true }).fill("Sample");
  await page.getByLabel("Sample email").fill(email);
  if (admin)
    await page.getByLabel("Preview administrator", { exact: false }).check();
  await page
    .getByRole("button", { name: "Continue with preview identity" })
    .click();
  await expect(page).toHaveURL(/\/account$/);
}
test("signup credits persist through sign-out, re-login and reload; user cannot access admin", async ({
  page,
}) => {
  await identity(page);
  await expect(page.locator(".credit-total")).toHaveText("500");
  await page.reload();
  await expect(page.locator(".credit-total")).toHaveText("500");
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Administrator access required." }),
  ).toBeVisible();
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await identity(page);
  await expect(page.locator(".credit-total")).toHaveText("500");
  await expect(page.locator("tbody tr")).toHaveCount(1);
});
test("logged-in dubbing consumes credits and records settlement", async ({
  page,
}) => {
  await identity(page);
  await page.goto("/audio-dubbing");
  await expect(page.getByText("500 credits available")).toBeVisible();
  await expect(page.getByLabel("Demo verification")).toHaveCount(0);
  await page.getByRole("button", { name: "Try a sample" }).click();
  await page.getByRole("button", { name: "Dub Audio", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Meet your sample result." }),
  ).toBeVisible({ timeout: 15000 });
  await page.goto("/account");
  await expect(page.locator(".credit-total")).toHaveText("498");
  await expect(page.locator("tbody").last()).toContainText("Dubbing completed");
  await page.getByRole("link", { name: "Open recording" }).click();
  await expect(
    page.getByRole("link", { name: "Download sample" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Download sample" }),
  ).toBeVisible();
});
test("admin changes configurable rates and signup bonus; old balances remain", async ({
  page,
}) => {
  await identity(page, "admin@example.test", true);
  await page.goto("/admin");
  await page.getByLabel("Standard credits per minute").fill("30");
  await page.getByLabel("Signup bonus credits").fill("600");
  await page.getByRole("button", { name: "Save credit settings" }).click();
  await expect(page.getByRole("status")).toContainText("Credit settings saved");
  await page.goto("/pricing");
  await expect(page.getByText("600 credits", { exact: true })).toBeVisible();
  await expect(page.locator("main")).toContainText(
    "Standard: 30 credits / minute",
  );
  await page.goto("/account");
  await expect(page.locator(".credit-total")).toHaveText("500");
});
test("guest trial cannot be started without verification or reused after completion", async ({
  page,
}) => {
  await page.goto("/audio-dubbing");
  await page.getByRole("button", { name: "Try a sample" }).click();
  await expect(
    page.getByRole("button", { name: "Dub Audio Free" }),
  ).toBeDisabled();
  await page.getByLabel("Demo verification", { exact: true }).check();
  await page.getByRole("button", { name: "Unlock free trial" }).click();
  await page.getByRole("button", { name: "Dub Audio Free" }).click();
  await expect(
    page.getByRole("heading", { name: "Meet your sample result." }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Dub another" }).click();
  await expect(page.locator(".quota-upgrade")).toContainText(
    "free trial is used",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Dub Audio Free" }),
  ).toBeDisabled();
  await expect(page.locator(".quota-upgrade")).toContainText(
    "free trial is used",
  );
});
test("guest audio longer than 30 seconds is rejected before a task starts", async ({
  page,
}) => {
  const seconds = 31,
    rate = 8000,
    samples = seconds * rate,
    bytes = Buffer.alloc(44 + samples * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(samples * 2, 40);
  await page.goto("/audio-dubbing");
  await page.getByLabel("Demo verification", { exact: true }).check();
  await page.getByRole("button", { name: "Unlock free trial" }).click();
  await page
    .locator("#recording-file")
    .setInputFiles({ name: "long.wav", mimeType: "audio/wav", buffer: bytes });
  await page.getByRole("button", { name: "Dub Audio Free" }).click();
  await expect(page.locator(".tool-error")).toContainText("up to 30 seconds");
  await expect(
    page.getByText("30s free trial", { exact: false }),
  ).toContainText("1 try left");
});
