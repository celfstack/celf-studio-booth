// Photo Strip Studio: client-only canvas rendering pipeline.
// Everything in this module runs in the browser (called from event handlers);
// never import it at SSR render time except as dead code behind handlers.

export type PresetId = "booth";
export type PrintLook = "booth" | "dreamy" | "vintageColor" | "coolMono";

/** Strip border styles: all keep the celfstudio footer mark. */
export type BorderStyle = "classic" | "thick" | "none";

interface BorderSpec {
  side: number;
  top: number;
  gap: number;
  paper: string;
  footerColor: string;
  frameStroke: string | null;
  jitter: boolean;
  paperGrain: number;
}

const BORDER_SPECS: Record<BorderStyle, BorderSpec> = {
  // narrow black frame, like a machine print
  classic: {
    side: 66,
    top: 112,
    gap: 36,
    paper: "#17120e",
    footerColor: "rgba(224, 212, 190, 0.8)",
    frameStroke: "rgba(10, 7, 5, 0.5)",
    jitter: true,
    paperGrain: 0.03,
  },
  // wide warm-cream paper border, like an old developed print
  thick: {
    side: 110,
    top: 170,
    gap: 56,
    paper: "#f0e7d3",
    footerColor: "rgba(88, 70, 52, 0.9)",
    frameStroke: "rgba(60, 45, 30, 0.4)",
    jitter: true,
    paperGrain: 0.025,
  },
  // edge-to-edge photos, only the footer band remains
  none: {
    side: 0,
    top: 0,
    gap: 8,
    paper: "#17120e",
    footerColor: "rgba(224, 212, 190, 0.8)",
    frameStroke: null,
    jitter: false,
    paperGrain: 0.03,
  },
};

// Print geometry: 2in x 6in strip at 600 px/in => 1200 x 3600 px.
const STRIP_W = 1200;
const STRIP_H = 3600;
const SIDE = 66; // side paper border
const TOP = 112; // wider top border
const GAP = 36; // even thin gaps between frames
const PHOTO_W = STRIP_W - SIDE * 2; // 1068
const PHOTO_RATIO = 4 / 3; // slightly wider than tall, like a booth frame
const PHOTO_H = Math.round(PHOTO_W / PHOTO_RATIO); // 801
const BOTTOM = STRIP_H - TOP - PHOTO_H * 4 - GAP * 3; // wider bottom border
const PIXELS_PER_INCH = 600;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function stripDateLabel(now = new Date()): string {
  return `${MONTHS[now.getMonth()]} ${String(now.getDate()).padStart(2, "0")} ${now.getFullYear()}`;
}

// ---------------------------------------------------------------- decoding

const HEIC_RE = /\.(heic|heif)$/i;

export function isSupportedPhotoFile(file: File): boolean {
  if (/^image\/(jpeg|png|heic|heif)$/i.test(file.type)) return true;
  if (file.type === "" && HEIC_RE.test(file.name)) return true;
  return /\.(jpe?g|png)$/i.test(file.name);
}

async function decodeViaImg(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // Revoke after decode; the bitmap is copied to canvas immediately after.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

/**
 * Decode a photo file into an ImageBitmap/HTMLImageElement source.
 * Tries the native decoder first; falls back to heic2any for HEIC/HEIF
 * in browsers without native HEIC support.
 */
export async function decodePhoto(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file);
  } catch {
    // Native decode failed. If it looks like HEIC, convert client-side.
    if (/heic|heif/i.test(file.type) || HEIC_RE.test(file.name)) {
      const mod = await import("heic2any");
      const heic2any = mod.default as (opts: {
        blob: Blob;
        toType?: string;
        quality?: number;
      }) => Promise<Blob | Blob[]>;
      const out = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.92,
      });
      const jpeg = Array.isArray(out) ? out[0] : out;
      return decodeViaImg(jpeg);
    }
    // Last chance: some browsers decode via <img> what createImageBitmap won't.
    return decodeViaImg(file);
  }
}

/** Small square thumbnail data URL for the upload slot preview. */
export function makeThumbnail(source: ImageBitmap | HTMLImageElement, size = 480): string {
  const sw = source.width;
  const sh = source.height;
  const side = Math.min(sw, sh);
  const c = document.createElement("canvas");
  c.width = size;
  c.height = Math.round(size / PHOTO_RATIO);
  const ctx = c.getContext("2d")!;
  // center-crop preview at the booth frame ratio
  let cw = sw;
  let ch = sw / PHOTO_RATIO;
  if (ch > sh) {
    ch = sh;
    cw = sh * PHOTO_RATIO;
  }
  void side;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}

// ---------------------------------------------------------------- filters
// Preset pipeline implemented exactly per spec: canvas compositing only
// (no CSS-filter shortcuts on the DOM), tuned constants left untouched.

// Center-crop source image to frame
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: ImageBitmap | HTMLImageElement,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale,
    sh = h / scale;
  const sx = (img.width - sw) / 2,
    sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

// Film grain
function addGrain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(imgData, 0, 0);
}

// Warm-dark radial vignette
function addVignette(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number) {
  const g = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.35,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.75,
  );
  g.addColorStop(0, "rgba(30,20,14,0)");
  g.addColorStop(1, `rgba(30,20,14,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// Bloom: blurred copy screened back over itself — creates the glow
function addBloom(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  blurPx: number,
  opacity: number,
  extraFilter = "",
) {
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d")!;
  octx.filter = `blur(${blurPx}px) ${extraFilter}`.trim();
  octx.drawImage(ctx.canvas, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = opacity;
  ctx.drawImage(off, 0, 0);
  ctx.restore();
}

// ---------- THE BOOTH FILM (single fixed look) ----------
// Contrasty vintage photobooth print: rich sepia monochrome with deep brown
// shadows and bright glowing highlights, flash-lit faces, fine grain, faint
// dust and scan noise, slight edge softness.
function applyBoothFilm(
  ctx: CanvasRenderingContext2D,
  img: ImageBitmap | HTMLImageElement,
  w: number,
  h: number,
) {
  // Punchy flash-lit base: contrast up before the tone mapping.
  ctx.filter = "contrast(1.12) brightness(1.04)";
  drawCover(ctx, img, w, h);
  ctx.filter = "none";

  // Soft skin smoothing: blurred copy folded back in at low opacity BEFORE the
  // tone mapping, so texture stays but harsh detail relaxes.
  const soft = document.createElement("canvas");
  soft.width = w;
  soft.height = h;
  const sctx = soft.getContext("2d")!;
  sctx.filter = `blur(${Math.max(2, w * 0.004)}px)`;
  sctx.drawImage(ctx.canvas, 0, 0);
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.drawImage(soft, 0, 0);
  ctx.restore();

  // Rich sepia monochrome map: deep brown shadows, bright creamy highlights,
  // strong S-curve for real contrast between the bright and dark elements.
  const SHADOW = [26, 18, 13]; // deep espresso brown, near-black
  const HIGHLIGHT = [246, 234, 211]; // bright glowing cream
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    let lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    // slight midtone density so eyes, lips and hair stay dark and dramatic
    lum = Math.pow(lum, 1.18);
    // strong S-curve: crush the shadows, push the highlights hot
    const s = lum * lum * (3 - 2 * lum);
    lum = s * s * (3 - 2 * s) * 0.35 + s * 0.65;
    // nearly full range: barely lifted floor, bright ceiling
    lum = 0.03 + lum * 0.95;
    d[i] = SHADOW[0] + (HIGHLIGHT[0] - SHADOW[0]) * lum;
    d[i + 1] = SHADOW[1] + (HIGHLIGHT[1] - SHADOW[1]) * lum;
    d[i + 2] = SHADOW[2] + (HIGHLIGHT[2] - SHADOW[2]) * lum;
  }
  ctx.putImageData(imgData, 0, 0);

  // Glowing flash highlights: stronger bloom so bright areas bleed softly.
  addBloom(ctx, w, h, w * 0.008, 0.32);

  // Fine film grain, a touch heavier for the printed feel.
  addGrain(ctx, w, h, 0.05);

  // Faint dust specks and developer blotches.
  ctx.save();
  for (let i = 0; i < 26; i++) {
    const dx = Math.random() * w;
    const dy = Math.random() * h;
    const r = 0.6 + Math.random() * 2.4;
    const light = Math.random() > 0.45;
    ctx.fillStyle = light
      ? `rgba(240, 232, 214, ${0.05 + Math.random() * 0.09})`
      : `rgba(40, 30, 22, ${0.04 + Math.random() * 0.07})`;
    ctx.beginPath();
    ctx.ellipse(
      dx,
      dy,
      r,
      r * (0.5 + Math.random() * 0.8),
      Math.random() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  // a couple of larger, very faint chemical blotches
  for (let i = 0; i < 3; i++) {
    const bx = Math.random() * w;
    const by = Math.random() * h;
    const br = w * (0.04 + Math.random() * 0.08);
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0, "rgba(226, 214, 192, 0.05)");
    g.addColorStop(1, "rgba(226, 214, 192, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(bx - br, by - br, br * 2, br * 2);
  }
  ctx.restore();

  // Light horizontal scan noise: sparse, very faint one-pixel bands.
  ctx.save();
  for (let i = 0; i < 10; i++) {
    const sy = Math.random() * h;
    ctx.fillStyle =
      Math.random() > 0.5
        ? `rgba(238, 228, 208, ${0.02 + Math.random() * 0.03})`
        : `rgba(36, 28, 22, ${0.02 + Math.random() * 0.03})`;
    ctx.fillRect(0, sy, w, 1 + Math.random() * 1.5);
  }
  ctx.restore();

  // Slight softness at the frame edges: blurred copy faded in via an
  // edge-only radial mask, plus a mild warm vignette.
  const edge = document.createElement("canvas");
  edge.width = w;
  edge.height = h;
  const ectx = edge.getContext("2d")!;
  ectx.filter = `blur(${Math.max(3, w * 0.006)}px)`;
  ectx.drawImage(ctx.canvas, 0, 0);
  ectx.filter = "none";
  const mask = ectx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.32,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.62,
  );
  mask.addColorStop(0, "rgba(0,0,0,1)");
  mask.addColorStop(1, "rgba(0,0,0,0)");
  ectx.save();
  ectx.globalCompositeOperation = "destination-out";
  ectx.fillStyle = mask;
  ectx.fillRect(0, 0, w, h);
  ectx.restore();
  ctx.drawImage(edge, 0, 0);

  addVignette(ctx, w, h, 0.24);
}

// A softened color print made from the untouched camera frames. This keeps
// real skin, clothing and backdrop color instead of trying to colorize the
// already-developed monochrome strip.
function applyDreamyColor(
  ctx: CanvasRenderingContext2D,
  img: ImageBitmap | HTMLImageElement,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.filter = "brightness(1.055) contrast(1.12) saturate(1.16) sepia(.1)";
  drawCover(ctx, img, w, h);
  ctx.restore();

  const glow = document.createElement("canvas");
  glow.width = w;
  glow.height = h;
  const glowCtx = glow.getContext("2d")!;
  glowCtx.filter = `blur(${Math.max(2.5, w * 0.006)}px) brightness(1.09) saturate(1.05)`;
  glowCtx.drawImage(ctx.canvas, 0, 0);
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(glow, 0, 0);
  const wash = ctx.createLinearGradient(0, 0, w, h);
  wash.addColorStop(0, "rgba(255,185,161,.16)");
  wash.addColorStop(0.48, "rgba(255,228,190,.07)");
  wash.addColorStop(1, "rgba(255,184,194,.09)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  addGrain(ctx, w, h, 0.042);
  addVignette(ctx, w, h, 0.18);
}

// Punchy color film with the slightly muted palette, hard flash and worn
// texture of a well-loved late-90s point-and-shoot print.
function applyVintageFlashColor(
  ctx: CanvasRenderingContext2D,
  img: ImageBitmap | HTMLImageElement,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.filter = "brightness(1.06) contrast(1.3) saturate(.9) sepia(.13)";
  drawCover(ctx, img, w, h);
  ctx.restore();

  // A broad frontal-flash lift keeps faces bright while the corners retain
  // the dense contrast of old consumer film.
  const flash = ctx.createRadialGradient(
    w * 0.5,
    h * 0.38,
    0,
    w * 0.5,
    h * 0.38,
    Math.max(w, h) * 0.62,
  );
  flash.addColorStop(0, "rgba(255,244,221,.16)");
  flash.addColorStop(0.46, "rgba(255,224,194,.055)");
  flash.addColorStop(1, "rgba(255,214,181,0)");
  ctx.fillStyle = flash;
  ctx.fillRect(0, 0, w, h);

  addBloom(ctx, w, h, w * 0.0045, 0.12, "brightness(1.08)");
  addGrain(ctx, w, h, 0.068);
  addPrintWear(ctx, w, h, false);
  addVignette(ctx, w, h, 0.25);
}

// Cooler silver-gelatin style monochrome: bright direct flash, deep charcoal
// shadows, visible grain and just enough scratches to feel physically worn.
function applyCoolFlashMono(
  ctx: CanvasRenderingContext2D,
  img: ImageBitmap | HTMLImageElement,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.filter = "brightness(1.075) contrast(1.26) grayscale(1)";
  drawCover(ctx, img, w, h);
  ctx.restore();

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const shadow = [15, 20, 25];
  const highlight = [239, 244, 246];
  for (let i = 0; i < data.length; i += 4) {
    let tone = data[i] / 255;
    tone = tone * tone * (3 - 2 * tone);
    tone = Math.max(0, Math.min(1, 0.025 + tone * 1.01));
    data[i] = shadow[0] + (highlight[0] - shadow[0]) * tone;
    data[i + 1] = shadow[1] + (highlight[1] - shadow[1]) * tone;
    data[i + 2] = shadow[2] + (highlight[2] - shadow[2]) * tone;
  }
  ctx.putImageData(imageData, 0, 0);

  addBloom(ctx, w, h, w * 0.0055, 0.16, "brightness(1.12)");
  addGrain(ctx, w, h, 0.082);
  addPrintWear(ctx, w, h, true);
  addVignette(ctx, w, h, 0.27);
}

function addPrintWear(ctx: CanvasRenderingContext2D, w: number, h: number, monochrome: boolean) {
  ctx.save();
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const radius = 0.5 + Math.random() * 2.2;
    const light = Math.random() > 0.42;
    ctx.fillStyle = light
      ? `rgba(${monochrome ? "235,242,245" : "250,230,204"},${0.05 + Math.random() * 0.11})`
      : `rgba(${monochrome ? "16,22,28" : "58,38,27"},${0.035 + Math.random() * 0.075})`;
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      radius,
      radius * (0.45 + Math.random()),
      Math.random() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * w;
    ctx.strokeStyle = monochrome
      ? `rgba(238,244,246,${0.035 + Math.random() * 0.045})`
      : `rgba(255,235,211,${0.025 + Math.random() * 0.035})`;
    ctx.lineWidth = 0.5 + Math.random() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, Math.random() * h * 0.18);
    ctx.lineTo(x + (Math.random() - 0.5) * 8, h * (0.35 + Math.random() * 0.58));
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- strip

export interface RenderedStrip {
  blob: Blob;
  url: string;
  widthIn: number;
  heightIn: number;
}

function getStripGeometry(border: BorderStyle) {
  const spec = BORDER_SPECS[border];
  const photoW = STRIP_W - spec.side * 2;
  const photoH =
    border === "none"
      ? Math.floor((STRIP_H - 132 - spec.gap * 3) / 4)
      : Math.round(photoW / PHOTO_RATIO);
  const bottom = STRIP_H - spec.top - photoH * 4 - spec.gap * 3;
  return { spec, photoW, photoH, bottom };
}

function drawContainedFrame(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  source: { x: number; y: number; w: number; h: number },
  target: { x: number; y: number; w: number; h: number },
) {
  const sourceRatio = source.w / source.h;
  const targetRatio = target.w / target.h;
  let sx = source.x;
  let sy = source.y;
  let sw = source.w;
  let sh = source.h;
  if (sourceRatio > targetRatio) {
    sw = source.h * targetRatio;
    sx += (source.w - sw) / 2;
  } else if (sourceRatio < targetRatio) {
    sh = source.w / targetRatio;
    sy += (source.h - sh) / 2;
  }
  ctx.drawImage(image, sx, sy, sw, sh, target.x, target.y, target.w, target.h);
}

/**
 * Change only the paper/frame around an already-developed strip. This avoids
 * rerunning the film pipeline for all four photos when the editor toggles a
 * border, making the preview effectively immediate.
 */
export async function reframeStrip(
  strip: HTMLImageElement,
  fromBorder: BorderStyle,
  toBorder: BorderStyle,
): Promise<RenderedStrip> {
  const from = getStripGeometry(fromBorder);
  const to = getStripGeometry(toBorder);
  const canvas = document.createElement("canvas");
  canvas.width = STRIP_W;
  canvas.height = STRIP_H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = to.spec.paper;
  ctx.fillRect(0, 0, STRIP_W, STRIP_H);

  for (let index = 0; index < 4; index++) {
    const sourceY = from.spec.top + index * (from.photoH + from.spec.gap);
    const targetY = to.spec.top + index * (to.photoH + to.spec.gap);
    drawContainedFrame(
      ctx,
      strip,
      { x: from.spec.side, y: sourceY, w: from.photoW, h: from.photoH },
      { x: to.spec.side, y: targetY, w: to.photoW, h: to.photoH },
    );
    if (to.spec.frameStroke) {
      ctx.strokeStyle = to.spec.frameStroke;
      ctx.lineWidth = 3;
      ctx.strokeRect(to.spec.side + 1, targetY + 1, to.photoW - 2, to.photoH - 2);
    }
  }

  ctx.save();
  ctx.fillStyle = to.spec.footerColor;
  ctx.font = '44px "Courier Prime", "Courier New", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lettered = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in lettered) lettered.letterSpacing = "8px";
  ctx.fillText("celfstudio", STRIP_W / 2, STRIP_H - to.bottom / 2 + 8);
  ctx.restore();

  const raw: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the strip."))),
      "image/png",
    );
  });
  const blob = await withPngDpi(raw, PIXELS_PER_INCH);
  return {
    blob,
    url: URL.createObjectURL(blob),
    widthIn: STRIP_W / PIXELS_PER_INCH,
    heightIn: STRIP_H / PIXELS_PER_INCH,
  };
}

/**
 * Render the full print-resolution strip: 4 center-cropped photos with the
 * fixed booth film applied, stacked in the chosen border style (all styles
 * keep the celfstudio footer mark), with slightly imperfect analog placement.
 */
export async function renderStrip(
  photos: Array<ImageBitmap | HTMLImageElement>,
  border: BorderStyle = "classic",
  look: PrintLook = "booth",
): Promise<RenderedStrip> {
  if (photos.length !== 4) throw new Error("Exactly 4 photos are required.");

  // Make sure the typewriter font is available to the canvas.
  try {
    await document.fonts.load('44px "Courier Prime"');
  } catch {
    // Font loading is best-effort; the monospace fallback still prints fine.
  }

  const { spec, photoW, photoH, bottom } = getStripGeometry(border);

  const canvas = document.createElement("canvas");
  canvas.width = STRIP_W;
  canvas.height = STRIP_H;
  const ctx = canvas.getContext("2d")!;

  // Paper base (never pure black or white) with a whisper of print mottle.
  ctx.fillStyle = spec.paper;
  ctx.fillRect(0, 0, STRIP_W, STRIP_H);
  addGrain(ctx, STRIP_W, STRIP_H, spec.paperGrain);

  // Photo frames: booth film applied to each photo on its own canvas first,
  // then composited into the strip with slight machine-print imperfection.
  const work = document.createElement("canvas");
  work.width = photoW;
  work.height = photoH;
  const wctx = work.getContext("2d", { willReadFrequently: true })!;

  for (let idx = 0; idx < 4; idx++) {
    const src = photos[idx];
    wctx.save();
    wctx.filter = "none";
    wctx.globalCompositeOperation = "source-over";
    wctx.globalAlpha = 1;
    wctx.clearRect(0, 0, photoW, photoH);
    wctx.imageSmoothingQuality = "high";
    if (look === "dreamy") applyDreamyColor(wctx, src, photoW, photoH);
    else if (look === "vintageColor") applyVintageFlashColor(wctx, src, photoW, photoH);
    else if (look === "coolMono") applyCoolFlashMono(wctx, src, photoW, photoH);
    else applyBoothFilm(wctx, src, photoW, photoH);
    wctx.restore();

    const y = spec.top + idx * (photoH + spec.gap);

    // Slightly imperfect placement, like a real booth print: a hair of
    // rotation and offset, different for every frame (skipped edge-to-edge).
    const jitterX = spec.jitter ? (Math.random() - 0.5) * 6 : 0;
    const jitterY = spec.jitter ? (Math.random() - 0.5) * 4 : 0;
    const tilt = spec.jitter ? ((Math.random() - 0.5) * 0.5 * Math.PI) / 180 : 0;
    ctx.save();
    ctx.translate(spec.side + photoW / 2 + jitterX, y + photoH / 2 + jitterY);
    ctx.rotate(tilt);
    ctx.drawImage(work, -photoW / 2, -photoH / 2);
    if (spec.frameStroke) {
      // subtle uneven print line around the frame edge
      ctx.strokeStyle = spec.frameStroke;
      ctx.lineWidth = 3;
      ctx.strokeRect(-photoW / 2 + 1, -photoH / 2 + 1, photoW - 2, photoH - 2);
    }
    ctx.restore();
  }

  // Typewriter studio mark in the footer band, in the style's ink.
  ctx.save();
  ctx.fillStyle = spec.footerColor;
  ctx.font = '44px "Courier Prime", "Courier New", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = "8px";
  ctx.fillText("celfstudio", STRIP_W / 2, STRIP_H - bottom / 2 + 8);
  ctx.restore();

  const raw: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode the strip."))),
      "image/png",
    );
  });
  const blob = await withPngDpi(raw, PIXELS_PER_INCH);

  return {
    blob,
    url: URL.createObjectURL(blob),
    widthIn: STRIP_W / PIXELS_PER_INCH,
    heightIn: STRIP_H / PIXELS_PER_INCH,
  };
}

// ------------------------------------------------- PNG pHYs (print DPI)

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Insert a pHYs chunk so print software opens the PNG at true 2in x 6in. */
async function withPngDpi(blob: Blob, ppi: number): Promise<Blob> {
  try {
    const buf = new Uint8Array(await blob.arrayBuffer());
    // PNG signature (8) + IHDR (4 len + 4 type + 13 data + 4 crc) = 33 bytes.
    const insertAt = 33;
    const ppm = Math.round(ppi / 0.0254);
    const chunk = new Uint8Array(4 + 4 + 9 + 4);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9); // data length
    chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
    dv.setUint32(8, ppm);
    dv.setUint32(12, ppm);
    chunk[16] = 1; // unit: meter
    dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    const out = new Uint8Array(buf.length + chunk.length);
    out.set(buf.subarray(0, insertAt), 0);
    out.set(chunk, insertAt);
    out.set(buf.subarray(insertAt), insertAt + chunk.length);
    return new Blob([out], { type: "image/png" });
  } catch {
    return blob; // DPI metadata is a bonus; never fail the render over it.
  }
}
