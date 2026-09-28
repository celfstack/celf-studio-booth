import { test, expect, type Page } from "@playwright/test";

async function photos(page: Page, color: string) {
  const urls = await page.evaluate(
    (color) =>
      [0, 1, 2, 3].map((i) => {
        const c = document.createElement("canvas");
        c.width = 540;
        c.height = 810;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 540, 810);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 180px sans-serif";
        ctx.fillText(String(i + 1), 210, 470);
        return c.toDataURL("image/png");
      }),
    color,
  );
  return urls.map((url, i) => ({
    name: `pose-${i + 1}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(url.split(",")[1], "base64"),
  }));
}

test("two separate browsers create, join, recover, decorate and download a shared strip", async ({
  browser,
  baseURL,
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const errors: string[] = [];
  host.on("pageerror", (e) => errors.push(e.message));
  guest.on("pageerror", (e) => errors.push(e.message));
  await host.goto(`${baseURL}/`);
  await expect(host.getByRole("link", { name: /Together, anywhere/ })).toBeVisible();
  await host.getByRole("link", { name: /Together, anywhere/ }).click();
  await host.getByLabel("What should your person call you?").fill("Celina");
  await host.getByRole("button", { name: "Make a booth for two →" }).click();
  await expect(host.getByRole("heading", { name: "Leave a little room for them." })).toBeVisible();
  const returnLink = host.url();
  const input = host.getByLabel("Upload four photos");
  const hostFiles = await photos(host, "#b83928");
  await input.setInputFiles(hostFiles.slice(0, 3));
  await expect(host.getByRole("alert")).toContainText("exactly four");
  await input.setInputFiles(hostFiles);
  await expect(host.getByRole("heading", { name: "Four little moments. All you." })).toBeVisible();
  await host.getByRole("button", { name: /Happy with these/ }).click();
  await expect(
    host.getByRole("heading", { name: "Your half is here. Their turn next." }),
  ).toBeVisible();
  const invite = await host.getByLabel("A little invitation for your person").inputValue();
  expect(invite).toContain("#guest=");
  expect(returnLink).toContain("#host=");
  await host.reload();
  await expect(
    host.getByRole("heading", { name: "Your half is here. Their turn next." }),
  ).toBeVisible();
  await guest.goto(invite);
  await expect(guest.getByRole("heading", { name: "They saved a place for you." })).toBeVisible();
  await expect(guest.getByAltText("Celina's matching pose 1")).toBeVisible();
  await guest.getByLabel("Your first name or nickname").fill("Robin");
  await guest.getByLabel("Upload four photos").setInputFiles(await photos(guest, "#2762b0"));
  await guest.getByRole("button", { name: /Review photo 2/ }).click();
  await expect(guest.getByAltText("Celina's matching pose 2")).toBeVisible();
  await guest.getByRole("button", { name: /Happy with these/ }).click();
  await expect(guest.getByRole("heading", { name: /Celina & Robin/ })).toBeVisible();
  await expect(host.getByRole("heading", { name: /Celina & Robin/ })).toBeVisible({
    timeout: 15_000,
  });
  expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await guest.screenshot({ path: "test-results/together-mobile-finished.png", fullPage: true });
  await host.getByRole("button", { name: "Develop our strip →" }).click();
  await expect(host).toHaveURL(/\/print$/);
  const strip = host
    .getByRole("button", { name: "View your photo strip in full size" })
    .locator("img");
  await expect(strip).toBeVisible();
  expect(
    await strip.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight]),
  ).toEqual([1200, 3600]);
  // Inspect paired sources, before artistic filters: creator must remain left.
  const pixels = await host.evaluate(async () => {
    const { getSessionPhotos } = await import("/src/lib/strip/session.ts");
    return getSessionPhotos().map((photo) => {
      const c = document.createElement("canvas");
      c.width = 1080;
      c.height = 810;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(photo, 0, 0);
      return [
        Array.from(ctx.getImageData(40, 40, 1, 1).data),
        Array.from(ctx.getImageData(1040, 40, 1, 1).data),
      ];
    });
  });
  for (const [left, right] of pixels) {
    expect(left[0]).toBeGreaterThan(left[2]);
    expect(right[2]).toBeGreaterThan(right[0]);
  }
  const download = host.waitForEvent("download");
  await host.getByRole("button", { name: "Download", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
  await host
    .getByRole("button", { name: /Decorate/i })
    .first()
    .click();
  await expect(host).toHaveURL(/\/decorate$/);
  await expect(host.getByRole("button", { name: "Save image", exact: true }).first()).toBeEnabled({
    timeout: 30_000,
  });
  await host.getByRole("button", { name: /Dreamy Color/ }).click();
  await host.getByRole("button", { name: /Star mix/ }).click();
  await host.getByRole("radio", { name: /Thick vintage/ }).click();
  await expect(host.getByRole("button", { name: "Save image", exact: true }).first()).toBeEnabled({
    timeout: 30_000,
  });
  const decorated = host.waitForEvent("download");
  await host.getByRole("button", { name: "Save image", exact: true }).first().click();
  expect((await decorated).suggestedFilename()).toBe("celf-studio-decorated-portrait.png");
  await host.screenshot({ path: "test-results/together-decorated.png", fullPage: true });
  await guest.reload();
  await expect(guest.getByRole("heading", { name: /Celina & Robin/ })).toBeVisible();
  await guest.getByText("Your return link & privacy", { exact: true }).click();
  await guest.getByRole("button", { name: "Delete this shared booth" }).click();
  await guest.getByRole("button", { name: "Yes, delete booth" }).click();
  await expect(guest.getByRole("alert")).toContainText("have been deleted");
  await host.goto(returnLink);
  await expect(host.getByRole("alert")).toContainText("expired or was deleted");
  expect(errors).toEqual([]);
  await hostContext.close();
  await guestContext.close();
});

test("camera countdown, cancel, retake and denied-camera upload fallback", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ permissions: ["camera"] });
  const page = await context.newPage();
  await page.goto(`${baseURL}/together`);
  await page.getByLabel("What should your person call you?").fill("Camera test");
  await page.getByRole("button", { name: "Make a booth for two →" }).click();
  await page.getByRole("button", { name: "Start my camera" }).click();
  await expect(page.locator("video")).toBeVisible();
  await expect
    .poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Take my four photos" }).click();
  await page.getByRole("button", { name: "Cancel countdown" }).click();
  await expect(page.getByRole("button", { name: "Take my four photos" })).toBeVisible();
  await page.getByRole("button", { name: "Take my four photos" }).click();
  await expect(page.getByRole("heading", { name: "Four little moments. All you." })).toBeVisible({
    timeout: 25_000,
  });
  await page.getByRole("button", { name: "Review photo 2" }).click();
  const original = await page
    .getByRole("button", { name: "Review photo 2" })
    .locator("img")
    .getAttribute("src");
  await page.getByRole("button", { name: "Retake photo 2" }).click();
  await expect(page.locator("video")).toBeVisible();
  await expect
    .poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Retake photo 2" }).click();
  await expect(page.getByRole("heading", { name: "Four little moments. All you." })).toBeVisible({
    timeout: 10_000,
  });
  expect(
    await page.getByRole("button", { name: "Review photo 2" }).locator("img").getAttribute("src"),
  ).not.toBe(original);
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("Denied", "NotAllowedError"));
  });
  await page.getByRole("button", { name: "Retake photo 2" }).click();
  await expect(page.getByRole("alert")).toContainText("camera isn’t available");
  await expect(page.getByRole("button", { name: "or upload four photos" })).toBeVisible();
  await context.close();
});

test("solo photo uploads still develop and reach the original decoration editor", async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}/booth`);
  await page.locator('input[type="file"]').setInputFiles(await photos(page, "#765634"));
  await expect(page).toHaveURL(/\/print$/);
  await expect(page.getByRole("button", { name: "Download", exact: true })).toBeEnabled({
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: "retake", exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: /Decorate/i })
    .first()
    .click();
  await expect(page.getByRole("button", { name: "Save image", exact: true }).first()).toBeEnabled({
    timeout: 30_000,
  });
});
