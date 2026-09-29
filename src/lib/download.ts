export type ImageSaveResult = { status: "downloaded" | "shared" | "manual"; url: string };

function needsMobileSave() {
  return (
    /Android|Mobile|iPad|iPhone|iPod|FBAN|FBAV|Instagram|TikTok|Line\/|MicroMessenger|Twitter|\bwv\b/i.test(
      navigator.userAgent,
    ) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Saves without treating a share-sheet result as proof that a file was saved.
 * Every outcome retains a URL for the caller's fallback/recovery UI.
 * The caller owns that URL and revokes it when the UI is discarded. */
export async function saveImageBlob(blob: Blob, filename: string): Promise<ImageSaveResult> {
  if (!blob.size) throw new Error("The image is empty");
  const mobile = needsMobileSave();
  if (mobile && typeof navigator.share === "function") {
    try {
      const file = new File([blob], filename, { type: blob.type || "image/png" });
      // Only test the file capability; optional metadata varies between browsers.
      if (
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] }) &&
        (!navigator.userActivation || navigator.userActivation.isActive)
      ) {
        const sharing = navigator.share({ files: [file] });
        // Some embedded browsers expose a nonfunctional share method.
        if (sharing && typeof sharing.then === "function") {
          await sharing;
          return { status: "shared", url: URL.createObjectURL(blob) };
        }
      }
    } catch (error) {
      // AbortError also means no share targets, so never silently abandon the save.
      // Log only the failure type, never photos, filenames, or invitation links.
      if (!(error instanceof DOMException && error.name === "AbortError"))
        console.warn(
          "[photo-save] Native sharing unavailable; showing save options.",
          error instanceof Error ? error.name : "UnknownError",
        );
    }
  }

  const url = URL.createObjectURL(blob);
  if (mobile) return { status: "manual", url };

  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
    }
    return { status: "downloaded", url };
  } catch {
    return { status: "manual", url };
  }
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
