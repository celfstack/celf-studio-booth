export type ImageSaveResult =
  | { status: "downloaded"; url: string }
  | { status: "shared" }
  | { status: "cancelled" }
  | { status: "manual"; url: string };

function isAppleTouchDevice() {
  const userAgent = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isRestrictedInAppBrowser() {
  return /FBAN|FBAV|Instagram|TikTok|Line\/|MicroMessenger|Twitter|\bwv\b/i.test(
    navigator.userAgent,
  );
}

function isLikelyMobileDevice() {
  return /Android|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Saves a generated image without relying on the download attribute on iOS,
 * where blob URL downloads are frequently ignored. The caller owns returned
 * URLs and must revoke them when its fallback or recovery link is discarded.
 */
export async function saveImageBlob(blob: Blob, filename: string): Promise<ImageSaveResult> {
  const needsMobileFallback =
    isAppleTouchDevice() || isLikelyMobileDevice() || isRestrictedInAppBrowser();

  if (needsMobileFallback && typeof navigator.share === "function") {
    const file = new File([blob], filename, { type: blob.type || "image/png" });
    const shareData = { files: [file], title: "Celf Studio photo" };

    if (typeof navigator.canShare === "function" && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return { status: "shared" };
      } catch (error) {
        if (isAbortError(error)) return { status: "cancelled" };
        // Fall through to a full-size image the user can press and hold to save.
      }
    }
  }

  const url = URL.createObjectURL(blob);
  if (needsMobileFallback) return { status: "manual", url };

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return { status: "downloaded", url };
}

/** Remove empty canvas margins without flattening PNG transparency or clipping decorations. */
export function cropTransparentCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const { width, height } = source;
  const pixels = source.getContext("2d")!.getImageData(0, 0, width, height).data;
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left) return source;
  const cropped = document.createElement("canvas");
  cropped.width = right - left + 1;
  cropped.height = bottom - top + 1;
  cropped
    .getContext("2d")!
    .drawImage(
      source,
      left,
      top,
      cropped.width,
      cropped.height,
      0,
      0,
      cropped.width,
      cropped.height,
    );
  return cropped;
}
