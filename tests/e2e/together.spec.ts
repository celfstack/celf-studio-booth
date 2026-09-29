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

async function copyInvite(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as unknown as { copiedInvite: string }).copiedInvite = value;
        },
      },
    });
  });
  await page.getByRole("button", { name: "Copy invite ↗", exact: true }).click();
  return page.evaluate(() => (window as unknown as { copiedInvite: string }).copiedInvite);
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
  await host.getByRole("button", { name: "together ♡", exact: true }).click();
  await expect(host).toHaveURL(`${baseURL}/`);
  await host.getByRole("button", { name: "Enter Photo Booth", exact: true }).click();
  await expect(host.getByLabel("Together photo booth")).toBeVisible();
  await expect(host.getByLabel("Invitation link")).toHaveCount(0);
  await host.getByLabel("Your name (optional)").fill("Celina");
  const returnLink = host.url();
  const input = host.getByLabel("Upload four photos");
  const hostFiles = await photos(host, "#b83928");
  await input.setInputFiles(hostFiles.slice(0, 3));
  await expect(host.getByRole("alert")).toContainText("exactly four");
  await input.setInputFiles(hostFiles);
  await expect(host.getByRole("button", { name: "Save my half →", exact: true })).toBeVisible();
  await host.getByRole("button", { name: /Save my half/ }).click();
  await expect(host.getByRole("heading", { name: "your half is saved" })).toBeVisible();
  const invite = await copyInvite(host);
  expect(invite).toContain("#guest=");
  expect(returnLink).toContain("#host=");
  await host.reload();
  await expect(host.getByRole("heading", { name: "your half is saved" })).toBeVisible();
  await guest.goto(invite);
  await expect(guest.getByLabel("Together photo booth")).toBeVisible();
  await expect(guest.getByAltText("Celina's matching pose 1")).toBeVisible();
  await guest.getByLabel("Your name (optional)").fill("Robin");
  await guest.getByLabel("Upload four photos").setInputFiles(await photos(guest, "#2762b0"));
  await guest.getByRole("button", { name: /Review photo 2/ }).click();
  await expect(guest.getByAltText("Celina's matching pose 2")).toBeVisible();
  await guest.getByRole("button", { name: /Save my half/ }).click();
  await expect(guest).toHaveURL(/\/print$/, { timeout: 15000 });
  await expect(host).toHaveURL(/\/print$/, { timeout: 15000 });
  await expect(guest.getByRole("button", { name: "Develop our strip →" })).toHaveCount(0);
  expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
  await guest
    .getByRole("button", { name: /Decorate/i })
    .first()
    .click();
  await expect(guest.getByRole("button", { name: "Save image", exact: true }).first()).toBeEnabled({
    timeout: 30000,
  });
  await host.getByRole("button", { name: /Dreamy Color/ }).click();
  await host.getByRole("button", { name: /Star mix/ }).click();
  await host.getByRole("radio", { name: /Thick vintage/ }).click();
  await expect(host.getByRole("button", { name: "Save image", exact: true }).first()).toBeEnabled({
    timeout: 30_000,
  });
  await expect(guest.getByRole("radio", { name: /Thick vintage/ })).toBeChecked({ timeout: 10000 });
  await expect(guest.getByRole("button", { name: /Dreamy Color/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Independent simultaneous changes must both survive the merge.
  await Promise.all([
    host.getByRole("button", { name: /Star mix/ }).click(),
    guest.getByRole("button", { name: /Vintage Flash/i }).click(),
  ]);
  await expect(host.getByRole("button", { name: /Vintage Flash/i })).toHaveAttribute(
    "aria-pressed",
    "true",
    { timeout: 10000 },
  );
  await host.reload();
  await expect(host.getByRole("button", { name: /Vintage Flash/i })).toHaveAttribute(
    "aria-pressed",
    "true",
    { timeout: 30000 },
  );
  await expect(host.getByRole("button", { name: "Save image", exact: true }).first()).toBeEnabled({
    timeout: 30000,
  });
  await host.getByRole("button", { name: /Loose prints/ }).click();
  await expect(guest.getByRole("button", { name: /Loose prints/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const dragPrint = async (page: Page, x: number) => {
    await page.getByLabel("Decorated photo composition preview").scrollIntoViewIfNeeded();
    const bounds = (await page.getByLabel("Decorated photo composition preview").boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width * x, bounds.y + bounds.height * 0.27);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * (x + 0.04), bounds.y + bounds.height * 0.32, {
      steps: 5,
    });
    await page.mouse.up();
  };
  await Promise.all([dragPrint(host, 0.29), dragPrint(guest, 0.71)]);
  await expect
    .poll(() =>
      host.evaluate(async () => {
        const { getTogetherLink } = await import("/src/lib/strip/session.ts");
        const url = new URL(getTogetherLink()!);
        const hash = new URLSearchParams(url.hash.slice(1));
        const response = await fetch(`/api/together/${url.pathname.split("/")[2]}/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${hash.get("host")}`,
          },
          body: "{}",
        });
        const { state } = await response.json();
        return [state.editor["loosePrints:1"]?.x, state.editor["loosePrints:2"]?.x];
      }),
    )
    .toEqual([expect.any(Number), expect.any(Number)]);
  await expect(host.getByRole("button", { name: "Save image", exact: true }).first()).toBeEnabled({
    timeout: 15000,
  });
  const canvas = host.getByLabel("Decorated photo composition preview");
  await canvas.hover({ position: { x: 60, y: 60 } });
  await expect(guest.getByTestId("partner-cursor")).toContainText("Celina", { timeout: 15000 });
  const guestDownload = guest.waitForEvent("download");
  await guest.getByRole("button", { name: "Save image", exact: true }).first().click();
  expect((await guestDownload).suggestedFilename()).toMatch(/decorated/);
  const decorated = host.waitForEvent("download");
  await host.getByRole("button", { name: "Save image", exact: true }).first().click();
  expect((await decorated).suggestedFilename()).toBe("celf-studio-decorated-portrait.png");
  await host.screenshot({ path: "test-results/together-decorated.png", fullPage: true });
  await guest.goto(invite);
  await expect(guest).toHaveURL(/\/print$/, { timeout: 15000 });
  await guest.getByRole("button", { name: "back to our booth", exact: true }).first().click();
  await expect(guest).toHaveURL(/manage=(1|true)/);
  await expect(guest.getByRole("button", { name: "Return to our strip →" })).toBeVisible();
  await expect(guest.getByLabel("Together photo booth")).toBeVisible();
  await expect(guest.getByLabel("Your mirrored camera preview")).toBeVisible();
  await expect(guest.getByRole("button", { name: "Review photo 1" }).locator("img")).toBeVisible();
  await guest.getByRole("button", { name: "Return to our strip →" }).click();
  await expect(guest).toHaveURL(/\/print$/);
  await guest.getByRole("button", { name: "back to our booth", exact: true }).first().click();
  await expect(guest.getByLabel("Your mirrored camera preview")).toBeVisible();
  await guest.screenshot({ path: "test-results/together-return-camera.png", fullPage: true });
  const previousRoom = new URL(invite).pathname;
  await guest.getByRole("button", { name: "Retake our strip", exact: true }).click();
  await expect(guest).toHaveURL(
    (url) => url.pathname === new URL(invite).pathname && url.hash === new URL(invite).hash,
  );
  await expect(host).toHaveURL(returnLink, { timeout: 15000 });
  expect(new URL(guest.url()).pathname).toBe(previousRoom);
  for (const page of [host, guest]) {
    await expect(page.getByLabel("Together photo booth")).toBeVisible();
    await expect(page.getByRole("button", { name: "Review photo 1" }).locator("img")).toHaveCount(
      0,
    );
  }
  expect(await copyInvite(host)).toBe(invite);
  await host.getByLabel("Upload four photos").setInputFiles(await photos(host, "#b83928"));
  await host.getByRole("button", { name: "Save my half →", exact: true }).click();
  await guest.getByLabel("Upload four photos").setInputFiles(await photos(guest, "#2762b0"));
  await guest.getByRole("button", { name: "Save my half →", exact: true }).click();
  await expect(host).toHaveURL(/\/print$/, { timeout: 15000 });
  await expect(guest).toHaveURL(/\/print$/, { timeout: 15000 });
  await host.goto(returnLink);
  await expect(host).toHaveURL(/\/print$/, { timeout: 15000 });

  await expect(guest.getByText("Your return link & privacy", { exact: true })).toHaveCount(0);
  // Room deletion remains covered through the API after removing the privacy panel.
  const deleted = await guest.evaluate(async (link) => {
    const url = new URL(link);
    const token = new URLSearchParams(url.hash.slice(1)).get("guest");
    const response = await fetch(`/api${url.pathname}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    return response.ok;
  }, invite);
  expect(deleted).toBe(true);
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
  await page.goto(`${baseURL}/?mode=together`);
  await expect(page.getByRole("button", { name: "together ♡", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Enter Photo Booth", exact: true }).click();
  await expect(page.locator("video")).toBeVisible();
  await expect
    .poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(2);
  const stopButton = page.getByRole("button", { name: "Stop camera", exact: true });
  await stopButton.scrollIntoViewIfNeeded();
  const stopPosition = await stopButton.boundingBox();
  await stopButton.click();
  const openButton = page.getByRole("button", { name: "Open camera", exact: true });
  await expect(openButton).toBeVisible();
  const openPosition = await openButton.boundingBox();
  expect(openPosition!.y).toBeCloseTo(stopPosition!.y, 0);
  expect(openPosition!.x + openPosition!.width / 2).toBeCloseTo(
    stopPosition!.x + stopPosition!.width / 2,
    0,
  );
  await expect(page.getByRole("button", { name: "Take my four photos" })).toBeDisabled();
  await openButton.click();
  await expect(page.getByRole("button", { name: "Take my four photos" })).toBeEnabled();
  await page.getByRole("button", { name: "Take my four photos" }).click();
  await page.getByRole("button", { name: "Cancel countdown" }).click();
  await expect(page.getByRole("button", { name: "Take my four photos" })).toBeVisible();
  await page.getByRole("button", { name: "Take my four photos" }).click();
  await expect(page.getByRole("button", { name: "Save my half →", exact: true })).toBeVisible({
    timeout: 25_000,
  });
  await page.getByRole("button", { name: "Review photo 2" }).click();
  const original = await page
    .getByRole("button", { name: "Review photo 2" })
    .locator("img")
    .getAttribute("src");
  await page.getByRole("button", { name: "Open camera" }).click();
  await expect(page.locator("video")).toBeVisible();
  await expect
    .poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Retake photo 2" }).click();
  await expect(page.getByRole("button", { name: "Save my half →", exact: true })).toBeVisible({
    timeout: 10_000,
  });
  expect(
    await page.getByRole("button", { name: "Review photo 2" }).locator("img").getAttribute("src"),
  ).not.toBe(original);
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("Denied", "NotAllowedError"));
  });
  await page.getByRole("button", { name: "Open camera" }).click();
  await expect(page.getByRole("alert")).toContainText("camera isn’t available");
  await expect(page.getByRole("button", { name: "upload photos →" })).toBeVisible();
  await context.close();
});

test("solo photo uploads still develop and reach the original decoration editor", async ({
  page,
  baseURL,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "celf-active-together",
      `http://127.0.0.1:3100/together/${"a".repeat(32)}#host=${"b".repeat(64)}`,
    ),
  );
  await page.goto(`${baseURL}/booth`);
  await expect(
    page.getByRole("button", { name: "Press to start the four-photo countdown" }),
  ).toBeEnabled();
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

test("live cameras, one synchronized countdown, shared cancellation, and guest-first saving", async ({
  browser,
  baseURL,
}) => {
  const hc = await browser.newContext({ permissions: ["camera"] });
  const gc = await browser.newContext({ permissions: ["camera"] });
  // Run with CELF_TEST_FORCE_RELAY=1 to rule out same-network shortcuts.
  const forceRelay = process.env.CELF_TEST_FORCE_RELAY === "1";
  for (const context of [hc, gc]) {
    await context.addInitScript((relay) => {
      const peers: RTCPeerConnection[] = [];
      (window as typeof window & { __celfTestPeers: RTCPeerConnection[] }).__celfTestPeers = peers;
      const NativePeer = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends NativePeer {
        constructor(config?: RTCConfiguration) {
          super({ ...config, ...(relay ? { iceTransportPolicy: "relay" as const } : {}) });
          peers.push(this);
        }
      };
    }, forceRelay);
  }
  const h = await hc.newPage(),
    g = await gc.newPage();
  const errors: string[] = [];
  h.on("pageerror", (e) => errors.push(e.message));
  g.on("pageerror", (e) => errors.push(e.message));
  await h.goto(`${baseURL}/?mode=together`);
  await expect(h.getByRole("button", { name: "together ♡", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await h.getByRole("button", { name: "Enter Photo Booth", exact: true }).click();
  const invite = await copyInvite(h);
  await g.goto(invite);
  await expect(h.getByText("● Together live", { exact: true })).toBeVisible({ timeout: 40000 });
  await expect(g.getByText("● Together live", { exact: true })).toBeVisible({ timeout: 40000 });
  await Promise.all(
    [h, g].map(async (page) => {
      await page.getByRole("button", { name: "Stop camera", exact: true }).click();
      await page.getByRole("button", { name: "Open camera", exact: true }).click();
    }),
  );
  await expect(h.getByText("● Together live", { exact: true })).toBeVisible({ timeout: 40000 });
  await expect(g.getByText("● Together live", { exact: true })).toBeVisible({ timeout: 40000 });
  for (const page of [h, g]) {
    const remote = page.getByLabel("Your person’s live camera");
    await expect(remote).toBeVisible();
    await expect
      .poll(() => remote.evaluate((v: HTMLVideoElement) => v.readyState))
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(async () =>
        page.evaluate(async (relay) => {
          const peers = (window as typeof window & { __celfTestPeers: RTCPeerConnection[] })
            .__celfTestPeers;
          const pc = peers.findLast((peer) => peer.connectionState === "connected");
          if (!pc) return false;
          const stats = await pc.getStats();
          let hasFrames = false;
          let relayed = false;
          stats.forEach((entry) => {
            if (entry.type === "inbound-rtp" && entry.kind === "video" && entry.framesDecoded > 0)
              hasFrames = true;
            if (entry.type === "candidate-pair" && entry.state === "succeeded" && entry.nominated)
              relayed = stats.get(entry.localCandidateId)?.candidateType === "relay";
          });
          return hasFrames && (!relay || relayed);
        }, forceRelay),
      )
      .toBe(true);
    await page.getByRole("button", { name: "I'm ready", exact: true }).click();
  }
  await expect(h.getByRole("button", { name: "Start together", exact: true })).toBeEnabled();
  await h.getByRole("button", { name: "Start together", exact: true }).click();
  await expect(g.getByRole("button", { name: "Cancel countdown" })).toBeVisible({ timeout: 10000 });
  await g.getByRole("button", { name: "Cancel countdown" }).click();
  await expect(h.getByRole("button", { name: "Start together", exact: true })).toBeVisible({
    timeout: 10000,
  });
  await g.reload();
  await expect(g.getByText("● Together live", { exact: true })).toBeVisible({ timeout: 40000 });
  await expect
    .poll(() =>
      h.getByLabel("Your person’s live camera").evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  for (const page of [h, g]) {
    const ready = page.getByRole("button", { name: "I'm ready", exact: true });
    if (await ready.isVisible()) await ready.click();
  }
  await expect(g.getByRole("button", { name: "Start together", exact: true })).toBeEnabled();
  await g.getByRole("button", { name: "Start together", exact: true }).click();
  await Promise.all(
    [h, g].map((page) =>
      expect(page.getByRole("button", { name: "Save my half →", exact: true })).toBeVisible({
        timeout: 30000,
      }),
    ),
  );
  for (const page of [h, g])
    await expect(page.getByRole("button", { name: /Review photo/ })).toHaveCount(4);
  await g.getByRole("button", { name: "Save my half →" }).click();
  await h.getByRole("button", { name: "Save my half →" }).click();
  await expect(h).toHaveURL(/\/print$/, { timeout: 15000 });
  await expect(g).toHaveURL(/\/print$/, { timeout: 15000 });
  // A completed live strip can be retaken without re-inviting either person.
  await h.getByRole("button", { name: "back to our booth", exact: true }).first().click();
  await h.getByRole("button", { name: "Retake our strip", exact: true }).click();
  for (const page of [h, g]) {
    await expect(page.getByLabel("Together photo booth")).toBeVisible({ timeout: 15000 });
    expect(new URL(page.url()).pathname).toBe(new URL(invite).pathname);
    await expect(page.getByText("● Together live", { exact: true })).toBeVisible({
      timeout: 40000,
    });
    await page.getByRole("button", { name: "I'm ready", exact: true }).click();
  }
  expect(await copyInvite(h)).toBe(invite);
  await expect(h.getByRole("button", { name: "Start together", exact: true })).toBeEnabled();
  await h.getByRole("button", { name: "Start together", exact: true }).click();
  for (const page of [h, g]) {
    await expect(page.getByRole("button", { name: "Save my half →", exact: true })).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole("button", { name: "Save my half →", exact: true }).click();
  }
  await expect(h).toHaveURL(/\/print$/, { timeout: 15000 });
  await expect(g).toHaveURL(/\/print$/, { timeout: 15000 });
  expect(errors).toEqual([]);
  await hc.close();
  await gc.close();
});
