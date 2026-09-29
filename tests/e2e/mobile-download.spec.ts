import { test, expect, chromium, webkit, type Page } from "@playwright/test";

const mobileOptions = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
};

async function prepare(page: Page, baseURL: string, print: boolean) {
  await page.goto(`${baseURL}/decorate?preview`);
  await expect(page.getByRole("button", { name: "Save image", exact: true }).first()).toBeEnabled();
  if (print) {
    await page.getByRole("button", { name: /← back/ }).click();
    await expect(page.getByRole("button", { name: "Download", exact: true })).toBeEnabled();
  }
}

for (const engine of [chromium, webkit]) {
  for (const print of [true, false]) {
    test(`${engine.name()}: ${print ? "print" : "decorated image"} offers a usable fallback when sharing aborts`, async ({
      baseURL,
    }) => {
      const browser = await engine.launch();
      try {
        const page = await browser.newPage(mobileOptions);
        await page.addInitScript(() => {
          Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
          Object.defineProperty(navigator, "share", {
            value: () => Promise.reject(new DOMException("No share targets", "AbortError")),
            configurable: true,
          });
        });
        await prepare(page, baseURL!, print);
        await page
          .getByRole("button", { name: print ? "Download" : "Save image", exact: true })
          .first()
          .click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible({ timeout: 4000 });
        await expect
          .poll(() =>
            dialog.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth),
          )
          .toBeGreaterThan(0);
        const download = page.waitForEvent("download");
        await dialog.getByRole("link", { name: "Download file", exact: true }).click();
        expect((await download).suggestedFilename()).toMatch(/\.png$/);
        const href = await dialog
          .getByRole("link", { name: "Open full-size image" })
          .getAttribute("href");
        expect(await page.evaluate(async (url) => (await fetch(url!)).ok, href)).toBe(true);
      } finally {
        await browser.close();
      }
    });
  }
}

for (const engine of [chromium, webkit]) {
  test(`${engine.name()}: retry shares the prepared PNG with a fresh tap`, async ({ baseURL }) => {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage(mobileOptions);
      await prepare(page, baseURL!, false);
      await page.evaluate(() => {
        const state = { shares: 0, encodes: 0, active: false, sizes: [] as number[] };
        Object.assign(window, { saveTest: state });
        const encode = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (...args) {
          state.encodes++;
          return encode.apply(this, args);
        };
        Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value: (data: ShareData) => {
            state.shares++;
            state.active = navigator.userActivation.isActive;
            state.sizes.push(data.files![0].size);
            return state.shares === 1
              ? Promise.reject(new DOMException("Activation expired", "NotAllowedError"))
              : Promise.resolve();
          },
        });
      });
      await page.getByRole("button", { name: "Save image", exact: true }).first().click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Share / save" }).click();
      await expect(
        page.getByRole("link", { name: "download not appearing? open image" }),
      ).toHaveCount(1);
      const state = await page.evaluate(
        () =>
          (
            window as unknown as {
              saveTest: { shares: number; encodes: number; active: boolean; sizes: number[] };
            }
          ).saveTest,
      );
      expect(state.shares).toBe(2);
      expect(state.encodes).toBe(1);
      expect(state.active).toBe(true);
      expect(state.sizes[0]).toBeGreaterThan(0);
      expect(state.sizes[1]).toBe(state.sizes[0]);
      // Changing the recovery link must not revoke the still-open preview.
      const href = await dialog.getByRole("link", { name: "Download file" }).getAttribute("href");
      expect(await page.evaluate(async (url) => (await fetch(url!)).ok, href)).toBe(true);
      await page.screenshot({ path: `test-results/${engine.name()}-mobile-save.png` });
    } finally {
      await browser.close();
    }
  });
}

test("mobile without file sharing can download, and touch laptops still use a direct download", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    ...mobileOptions,
    userAgent:
      "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36",
  });
  try {
    const page = await context.newPage();
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true }),
    );
    await prepare(page, baseURL!, true);
    await page.getByRole("button", { name: "Download", exact: true }).click();
    const pending = page.waitForEvent("download");
    await page.getByRole("dialog").getByRole("link", { name: "Download file" }).click();
    expect((await pending).suggestedFilename()).toMatch(/\.png$/);
  } finally {
    await context.close();
  }
  const desktop = await browser.newContext({
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
  });
  try {
    const page = await desktop.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "maxTouchPoints", { value: 10, configurable: true });
      Object.defineProperty(navigator, "platform", { value: "Win32", configurable: true });
    });
    await prepare(page, baseURL!, true);
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    expect((await pending).suggestedFilename()).toMatch(/\.png$/);
  } finally {
    await desktop.close();
  }
});
