import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(projectRoot, "public/assets/celfstudio-social-preview.svg");
const outputPath = join(projectRoot, "public/assets/celfstudio-social-preview.png");
const assetDirectory = dirname(sourcePath);
const temporaryDirectory = mkdtempSync(join(tmpdir(), "celf-social-preview-"));
const temporarySvg = join(temporaryDirectory, "preview.svg");

const mimeTypes = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

let source = readFileSync(sourcePath, "utf8");
source = source.replace(/href="([^"#]+\.(?:png|jpe?g|webp))"/gi, (match, assetPath) => {
  const extension = assetPath.slice(assetPath.lastIndexOf(".")).toLowerCase();
  const mimeType = mimeTypes[extension];
  const contents = readFileSync(resolve(assetDirectory, assetPath)).toString("base64");
  return `href="data:${mimeType};base64,${contents}"`;
});

try {
  writeFileSync(temporarySvg, source);
  execFileSync("/usr/bin/sips", ["-s", "format", "png", temporarySvg, "--out", outputPath], {
    stdio: "ignore",
  });
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log(`Rendered ${outputPath}`);
