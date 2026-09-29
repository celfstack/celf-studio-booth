import { test, expect, chromium, webkit, type CDPSession } from "@playwright/test";

for (const engine of [chromium, webkit]) {
  test(`${engine.name()}: narrow mobile editor labels and save controls stay reachable`, async ({
    baseURL,
  }) => {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 320, height: 568 },
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
        isMobile: true,
        hasTouch: true,
      });
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
        Object.defineProperty(navigator, "share", {
          value: () => Promise.reject(new DOMException("No targets", "AbortError")),
          configurable: true,
        });
      });
      await page.goto(`${baseURL}/decorate?preview`);
      await expect(
        page.getByRole("button", { name: "Save image", exact: true }).first(),
      ).toBeEnabled();
      const finish = page.getByRole("button", { name: "Bedazzle", exact: true });
      await finish.scrollIntoViewIfNeeded();
      expect(
        await finish.evaluate((button) => {
          const label = [...button.querySelectorAll("span")].find(
            (span) => span.textContent === "Bedazzle" && !span.querySelector("span"),
          )!;
          const range = document.createRange();
          range.selectNodeContents(label);
          return range.getBoundingClientRect().right <= button.getBoundingClientRect().right - 4;
        }),
      ).toBe(true);
      for (const viewport of [
        { width: 320, height: 568 },
        { width: 844, height: 390 },
      ]) {
        await page.setViewportSize(viewport);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.getByRole("button", { name: "Save image", exact: true }).first().tap();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        const download = page.waitForEvent("download");
        await dialog.getByRole("link", { name: "Download file", exact: true }).tap();
        expect((await download).suggestedFilename()).toMatch(/\.png$/);
        await dialog.getByRole("button", { name: "close", exact: true }).tap();
        await expect(dialog).toHaveCount(0);
      }
    } finally {
      await browser.close();
    }
  });
}

async function swipe(session: CDPSession, x: number, y: number, dx: number, dy: number) {
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let step = 1; step <= 10; step++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + (dx * step) / 10, y: y + (dy * step) / 10 }],
    });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("touch swipes scroll a plain preview and drag editable photos", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await page.goto(`${baseURL}/decorate?preview`);
    await expect(
      page.getByRole("button", { name: "Save image", exact: true }).first(),
    ).toBeEnabled();
    const canvas = page.getByLabel("Decorated photo composition preview");
    let bounds = (await canvas.boundingBox())!;
    await swipe(session, bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.8, 0, -120);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(30);
    await page.getByRole("button", { name: /Loose prints/ }).tap();
    await canvas.scrollIntoViewIfNeeded();
    bounds = (await canvas.boundingBox())!;
    const before = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
    const scroll = await page.evaluate(() => scrollY);
    await swipe(session, bounds.x + bounds.width * 0.29, bounds.y + bounds.height * 0.27, 25, 35);
    await expect
      .poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL()))
      .not.toBe(before);
    expect(await page.evaluate(() => scrollY)).toBeCloseTo(scroll, 0);
    await expect(
      page.getByRole("button", { name: "Make photo larger", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
