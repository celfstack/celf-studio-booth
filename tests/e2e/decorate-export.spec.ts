import { readFile } from "node:fs/promises";
import { test, expect, type Page, type Download } from "@playwright/test";

async function inspectPng(page: Page, download: Download) {
  const path = await download.path();
  const data = (await readFile(path!)).toString("base64");
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] === 0) transparent++;
    return { width: image.width, height: image.height, transparent };
  }, data);
}

test("strip-only export removes paper, preserves decorations and returns to the canvas", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/decorate?preview");
  await expect(page.getByRole("button", { name: "Save image", exact: true }).first()).toBeEnabled();
  await page.getByRole("button", { name: "Loose prints" }).click();
  await page.getByRole("button", { name: "Celfstudio booth", exact: true }).click();
  await page.getByRole("button", { name: "Just the strip" }).click();
  await expect(page.getByText("Pick some paper", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Arrange the photos", { exact: true })).toHaveCount(0);
  let pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save strip", exact: true }).first().click();
  let download = await pending;
  expect(download.suggestedFilename()).toBe("celf-studio-decorated-strip.png");
  expect(await inspectPng(page, download)).toEqual({ width: 1200, height: 3600, transparent: 0 });

  await page.getByRole("button", { name: "Bedazzle", exact: true }).click();
  pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save strip", exact: true }).first().click();
  download = await pending;
  const decorated = await inspectPng(page, download);
  expect(decorated.width).toBeGreaterThan(1200);
  expect(decorated.height).toBeGreaterThanOrEqual(3600);
  expect(decorated.transparent).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Portrait" }).click();
  await expect(page.getByText("Pick some paper", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Celfstudio booth", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save image", exact: true }).first().click();
  expect(await inspectPng(page, await pending)).toEqual({
    width: 1080,
    height: 1350,
    transparent: 0,
  });
  expect(errors).toEqual([]);
});
