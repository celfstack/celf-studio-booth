import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { reframeStrip, renderStrip, type BorderStyle, type PrintLook } from "../lib/strip/render";
import { getSessionPhotos, getSessionStrip, setSessionStrip } from "../lib/strip/session";

export const Route = createFileRoute("/decorate")({
  component: Decorate,
});

type FormatId = "portrait" | "story";
type BackdropId =
  "satin" | "bluePaper" | "pinkPaper" | "dots" | "stripes" | "corduroy" | "denim" | "photobooth";
type EffectId =
  | "original"
  | "dreamy"
  | "vintageColor"
  | "coolMono"
  | "warmFlash"
  | "noirPunch";
type LayoutId = "strip" | "prints";
type DecorationId = "none" | "referenceStars" | "bedazzle" | "lace";
type EditableFinishId = "referenceStars" | "bedazzle";

interface LoosePrint {
  id: number;
  photoIndex: number;
  x: number;
  y: number;
  width: number;
  rotation: number;
}

interface StarInstance {
  id: number;
  styleIndex: number;
  x: number;
  y: number;
  size: number;
  rotation: number;
}

interface EditorSnapshot {
  formatId: FormatId;
  backdrop: BackdropId;
  layout: LayoutId;
  effect: EffectId;
  border: BorderStyle;
  decorations: DecorationId[];
  loosePrints: LoosePrint[];
  starItems: StarInstance[];
  gemItems: StarInstance[];
}

type CanvasInteraction =
  | {
      kind: "print";
      id: number;
      mode: "drag" | "resize" | "rotate";
      startX: number;
      startY: number;
      item: LoosePrint;
    }
  | {
      kind: "finish";
      finish: EditableFinishId;
      id: number;
      mode: "drag" | "resize" | "rotate";
      startX: number;
      startY: number;
      item: StarInstance;
    };

interface FormatOption {
  id: FormatId;
  label: string;
  detail: string;
  width: number;
  height: number;
}

const FORMATS: FormatOption[] = [
  { id: "portrait", label: "Portrait", detail: "1080 × 1350", width: 1080, height: 1350 },
  { id: "story", label: "Story", detail: "1080 × 1920", width: 1080, height: 1920 },
];

const BACKDROPS: Array<{ id: BackdropId; label: string; color: string; src: string }> = [
  {
    id: "satin",
    label: "White satin",
    color: "#ddd9d4",
    src: "/assets/backgrounds/white-satin.jpg",
  },
  {
    id: "bluePaper",
    label: "Blue paper",
    color: "#94b4d3",
    src: "/assets/backgrounds/blue-paper.jpg",
  },
  {
    id: "pinkPaper",
    label: "Pink paper",
    color: "#ddc0c3",
    src: "/assets/backgrounds/pink-paper.jpg",
  },
  { id: "dots", label: "Ink dots", color: "#eeeade", src: "/assets/backgrounds/ink-dots.jpg" },
  {
    id: "stripes",
    label: "Pink stripes",
    color: "#b82b42",
    src: "/assets/backgrounds/pink-stripes.jpg",
  },
  {
    id: "corduroy",
    label: "Burgundy corduroy",
    color: "#42100e",
    src: "/assets/backgrounds/burgundy-corduroy.jpg",
  },
  { id: "denim", label: "Dark denim", color: "#0d2d54", src: "/assets/backgrounds/dark-denim.jpg" },
  {
    id: "photobooth",
    label: "Celfstudio booth",
    color: "#a51d13",
    src: "/assets/backgrounds/celfstudio-photobooth.png",
  },
];

const EFFECTS: Array<{ id: EffectId; label: string }> = [
  { id: "original", label: "Original B&W" },
  { id: "coolMono", label: "Cool B&W" },
  { id: "dreamy", label: "Dreamy Color" },
  { id: "vintageColor", label: "Vintage Flash" },
];

const COLOR_TREATMENTS = {
  warmFlash: {
    filter: "brightness(1.04) contrast(1.13) saturate(1.23) sepia(.14)",
    top: "rgba(255, 188, 138, .28)",
    bottom: "rgba(117, 48, 39, .12)",
    alpha: 0.72,
    blend: "soft-light",
  },
  noirPunch: {
    filter: "brightness(.98) contrast(1.48) saturate(0) sepia(.05)",
    top: "rgba(255, 255, 255, .10)",
    bottom: "rgba(20, 20, 28, .16)",
    alpha: 0.58,
    blend: "soft-light",
  },
} as const;

type ColorTreatmentId = keyof typeof COLOR_TREATMENTS;

const EFFECT_TREATMENTS: Partial<Record<EffectId, ColorTreatmentId>> = {
  dreamy: "warmFlash",
  warmFlash: "warmFlash",
  coolMono: "noirPunch",
  noirPunch: "noirPunch",
};

const ALTERNATE_EFFECTS: Array<Exclude<EffectId, "original">> = [
  "dreamy",
  "vintageColor",
  "coolMono",
];

const BORDER_OPTIONS: Array<{ id: BorderStyle; label: string; detail: string }> = [
  { id: "classic", label: "Classic thin", detail: "Dark booth edge" },
  { id: "thick", label: "Thick vintage", detail: "Warm paper frame" },
  { id: "none", label: "No border", detail: "Edge to edge" },
];

const LAYOUTS: Array<{ id: LayoutId; label: string; glyph: string }> = [
  { id: "strip", label: "One strip", glyph: "▯" },
  { id: "prints", label: "Loose prints", glyph: "▦" },
];

const DECORATIONS: Array<{
  id: DecorationId;
  label: string;
  src?: string;
  previewSrc?: string;
}> = [
  { id: "none", label: "As is" },
  {
    id: "referenceStars",
    label: "Star mix",
    previewSrc: "/assets/decorations/stars/chrome-puff.png",
  },
  {
    id: "bedazzle",
    label: "Bedazzle",
    previewSrc: "/assets/decorations/gems/pink-heart.png",
  },
  {
    id: "lace",
    label: "Lace",
    src: "/assets/decorations/ivory-lace-frame.png",
  },
];

const STAR_ASSETS = [
  "/assets/decorations/stars/silver-glitter.png",
  "/assets/decorations/stars/white-paper.png",
  "/assets/decorations/stars/silver-sketch.png",
  "/assets/decorations/stars/chrome-puff.png",
  "/assets/decorations/stars/silver-faceted.png",
  "/assets/decorations/stars/antique-gold.png",
  "/assets/decorations/stars/black-gold.png",
  "/assets/decorations/stars/chrome-sparkle.png",
] as const;

const GEM_ASSETS = [
  "/assets/decorations/gems/pink-heart.png",
  "/assets/decorations/gems/pink-round.png",
  "/assets/decorations/gems/red-flower.png",
  "/assets/decorations/gems/blue-heart.png",
  "/assets/decorations/gems/aqua-oval.png",
  "/assets/decorations/gems/pink-emerald.png",
  "/assets/decorations/gems/pearl-flower.png",
  "/assets/decorations/gems/silver-heart.png",
  "/assets/decorations/gems/opal-oval.png",
  "/assets/decorations/gems/lilac-star.png",
  "/assets/decorations/gems/yellow-emerald.png",
  "/assets/decorations/gems/emerald-heart.png",
  "/assets/decorations/gems/large-pearl.png",
] as const;

function makeDefaultStars(): StarInstance[] {
  const random = (index: number) => {
    const n = Math.sin(index * 7129.37 + 41.83) * 43758.5453;
    return n - Math.floor(n);
  };
  const clusters: Array<[number, number, number]> = [
    // Irregular handfuls collect around the strip edges rather than its center.
    [0.35, 0.15, 4],
    [0.67, 0.2, 5],
    [0.3, 0.39, 5],
    [0.7, 0.47, 4],
    [0.34, 0.67, 4],
    [0.68, 0.75, 5],
  ];
  const stars: StarInstance[] = [];
  let id = 1;

  clusters.forEach(([cx, cy, count], clusterIndex) => {
    for (let index = 0; index < count; index++) {
      const seed = clusterIndex * 17 + index * 3;
      const angle = random(seed) * Math.PI * 2;
      const distance = 0.008 + random(seed + 1) * 0.057;
      stars.push({
        id: id++,
        styleIndex: Math.floor(random(seed + 2) * STAR_ASSETS.length),
        x: Math.max(0.035, Math.min(0.965, cx + Math.cos(angle) * distance)),
        y: Math.max(0.035, Math.min(0.965, cy + Math.sin(angle) * distance * 0.78)),
        size: 0.017 + random(seed + 4) * 0.032,
        rotation: -22 + random(seed + 5) * 44,
      });
    }
  });

  const scattered: Array<[number, number]> = [
    [0.12, 0.23],
    [0.78, 0.1],
    [0.9, 0.31],
    [0.09, 0.38],
    [0.14, 0.52],
    [0.81, 0.58],
    [0.91, 0.69],
    [0.23, 0.78],
    [0.86, 0.86],
    [0.18, 0.91],
    [0.43, 0.92],
    [0.72, 0.95],
  ];
  scattered.forEach(([x, y], index) => {
    const seed = 300 + index * 5;
    stars.push({
      id: id++,
      styleIndex: Math.floor(random(seed) * STAR_ASSETS.length),
      x,
      y,
      size: 0.018 + random(seed + 1) * 0.031,
      rotation: -25 + random(seed + 2) * 50,
    });
  });
  return stars;
}

const DEFAULT_STARS = makeDefaultStars();

function makeDefaultGems(): StarInstance[] {
  const placements: Array<[number, number, number, number, number]> = [
    // Loose upper clusters: close enough to read as groups, with air between pieces.
    [0.26, 0.14, 0, 0.057, -11],
    [0.32, 0.18, 8, 0.033, 13],
    [0.36, 0.13, 10, 0.04, -8],
    [0.64, 0.14, 6, 0.055, 7],
    [0.7, 0.19, 4, 0.045, 18],
    [0.76, 0.15, 1, 0.034, -6],

    // Side clusters hug and occasionally overlap the photo edges like loose gems on paper.
    [0.2, 0.39, 5, 0.052, 10],
    [0.26, 0.44, 12, 0.049, -13],
    [0.32, 0.4, 2, 0.054, -12],
    [0.68, 0.4, 9, 0.033, 17],
    [0.74, 0.45, 3, 0.061, -6],
    [0.81, 0.41, 7, 0.054, 12],

    // Lower clusters are slightly asymmetric so the layout does not feel tiled.
    [0.24, 0.7, 11, 0.059, 8],
    [0.3, 0.75, 1, 0.034, -15],
    [0.36, 0.7, 8, 0.037, 11],
    [0.64, 0.73, 0, 0.048, -9],
    [0.7, 0.68, 6, 0.057, -8],
    [0.77, 0.75, 10, 0.039, 15],
    [0.82, 0.69, 5, 0.05, -11],

    // A few quiet singles keep the clustered pattern natural rather than condensed.
    [0.1, 0.22, 9, 0.026, 4],
    [0.89, 0.28, 1, 0.029, -7],
    [0.12, 0.59, 8, 0.027, 12],
    [0.88, 0.6, 12, 0.044, 9],
    [0.52, 0.88, 10, 0.031, -12],
  ];
  return placements.map(([x, y, styleIndex, size, rotation], index) => ({
    id: index + 1,
    styleIndex,
    x,
    y,
    size,
    rotation,
  }));
}

const DEFAULT_GEMS = makeDefaultGems();

const DEFAULT_LOOSE_PRINTS: LoosePrint[] = [
  { id: 1, photoIndex: 0, x: 0.29, y: 0.27, width: 0.34, rotation: 0 },
  { id: 2, photoIndex: 1, x: 0.71, y: 0.27, width: 0.34, rotation: 0 },
  { id: 3, photoIndex: 2, x: 0.29, y: 0.73, width: 0.34, rotation: 0 },
  { id: 4, photoIndex: 3, x: 0.71, y: 0.73, width: 0.34, rotation: 0 },
];

function drawPaper(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  backdrop: BackdropId,
  image?: HTMLImageElement,
) {
  const match = BACKDROPS.find((item) => item.id === backdrop)!;
  ctx.fillStyle = match.color;
  ctx.fillRect(0, 0, w, h);
  if (!image) return { x: 0, y: 0, scale: 1 };

  const scale =
    backdrop === "photobooth"
      ? Math.min(w / image.width, h / image.height)
      : Math.max(w / image.width, h / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const x = (w - drawWidth) / 2;
  const y = (h - drawHeight) / 2;
  ctx.drawImage(image, x, y, drawWidth, drawHeight);
  return { x, y, scale };
}

function drawImageWithEffect(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  effect: EffectId,
) {
  ctx.save();
  const treatmentId = EFFECT_TREATMENTS[effect];
  const treatment = treatmentId ? COLOR_TREATMENTS[treatmentId] : null;
  if (treatment) ctx.filter = treatment.filter;
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
  if (treatment) {
    ctx.filter = "none";
    ctx.globalAlpha = treatment.alpha;
    ctx.globalCompositeOperation = treatment.blend;
    const wash = ctx.createLinearGradient(dx, dy, dx, dy + dh);
    wash.addColorStop(0, treatment.top);
    wash.addColorStop(1, treatment.bottom);
    ctx.fillStyle = wash;
    ctx.fillRect(dx, dy, dw, dh);
  }
  ctx.restore();
}

function drawPhotoCard(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  source: { x: number; y: number; w: number; h: number },
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
  effect: EffectId,
  footerLabel?: string,
  borderStyle: BorderStyle = "classic",
) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.shadowColor = "rgba(33,23,17,.35)";
  ctx.shadowBlur = Math.max(12, w * 0.055);
  ctx.shadowOffsetY = w * 0.025;
  const borderWidth = borderStyle === "none" ? 0 : borderStyle === "thick" ? w * 0.065 : w * 0.018;
  if (borderWidth > 0) {
    ctx.fillStyle = borderStyle === "thick" ? "#f0e7d3" : "#17120e";
    ctx.fillRect(
      -w / 2 - borderWidth,
      -h / 2 - borderWidth,
      w + borderWidth * 2,
      h + borderWidth * 2,
    );
  }
  ctx.shadowColor = "transparent";
  const footerHeight = footerLabel ? h * 0.105 : 0;
  drawImageWithEffect(
    ctx,
    image,
    source.x,
    source.y,
    source.w,
    source.h,
    -w / 2,
    -h / 2,
    w,
    h - footerHeight,
    effect,
  );
  if (footerLabel) {
    ctx.fillStyle = borderStyle === "thick" ? "#f0e7d3" : "#17120e";
    ctx.fillRect(-w / 2, h / 2 - footerHeight, w, footerHeight);
    ctx.fillStyle = borderStyle === "thick" ? "rgba(68,54,42,.9)" : "rgba(232,220,197,.94)";
    ctx.font = `${Math.max(14, footerHeight * 0.36)}px "Courier Prime", "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(footerLabel, 0, h / 2 - footerHeight / 2 + footerHeight * 0.04);
  }
  ctx.restore();
}

function drawLaceFrame(
  ctx: CanvasRenderingContext2D,
  lace: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
) {
  // Nine-slice the photographed lace so its thread detail remains believable
  // while the opening follows each photo's current dimensions.
  const sx = [0, lace.width * 0.225, lace.width * 0.775, lace.width];
  const sy = [0, lace.height * 0.145, lace.height * 0.835, lace.height];
  const border = Math.max(28, Math.min(w * 0.34, h * 0.16));
  const dx = [-w / 2 - border, -w / 2, w / 2, w / 2 + border];
  const dy = [-h / 2 - border, -h / 2, h / 2, h / 2 + border];

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.shadowColor = "rgba(45, 30, 18, .28)";
  ctx.shadowBlur = Math.max(5, border * 0.22);
  ctx.shadowOffsetY = Math.max(2, border * 0.09);
  ctx.filter = "brightness(1.1) contrast(1.08)";
  // A second pass strengthens the photographed thread opacity without
  // flattening its tiny holes and fiber detail.
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1) ctx.shadowColor = "transparent";
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (row === 1 && col === 1) continue;
        ctx.drawImage(
          lace,
          sx[col],
          sy[row],
          sx[col + 1] - sx[col],
          sy[row + 1] - sy[row],
          dx[col],
          dy[row],
          dx[col + 1] - dx[col],
          dy[row + 1] - dy[row],
        );
      }
    }
  }
  ctx.restore();
}

function getLooseRect(canvas: HTMLCanvasElement, item: LoosePrint) {
  const ratio = 0.78;
  const w = canvas.width * item.width;
  const h = w / ratio;
  return {
    x: canvas.width * item.x - w / 2,
    y: canvas.height * item.y - h / 2,
    cx: canvas.width * item.x,
    cy: canvas.height * item.y,
    w,
    h,
  };
}

function drawSelection(
  ctx: CanvasRenderingContext2D,
  rect: ReturnType<typeof getLooseRect>,
  rotation: number,
) {
  const handle = Math.max(16, rect.w * 0.045);
  ctx.save();
  ctx.translate(rect.cx, rect.cy);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.strokeStyle = "#fffaf2";
  ctx.lineWidth = Math.max(4, rect.w * 0.012);
  ctx.setLineDash([handle * 0.8, handle * 0.45]);
  ctx.strokeRect(-rect.w / 2 - 7, -rect.h / 2 - 7, rect.w + 14, rect.h + 14);
  ctx.setLineDash([]);
  ctx.fillStyle = "#a03d2e";
  ctx.strokeStyle = "#fffaf2";
  ctx.lineWidth = Math.max(3, handle * 0.15);
  ctx.beginPath();
  ctx.arc(rect.w / 2, rect.h / 2, handle, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -rect.h / 2);
  ctx.lineTo(0, -rect.h / 2 - handle * 2.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -rect.h / 2 - handle * 2.2, handle, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawSparseStars(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  stars: HTMLImageElement[],
  starItems: StarInstance[],
) {
  if (stars.length !== STAR_ASSETS.length) return;
  starItems.forEach((item) => {
    const image = stars[item.styleIndex];
    const rect = getStarRect(canvas, item, image);
    ctx.save();
    ctx.translate(rect.cx, rect.cy);
    ctx.rotate((item.rotation * Math.PI) / 180);
    ctx.shadowColor = "rgba(25, 18, 14, .24)";
    ctx.shadowBlur = Math.max(2, rect.w * 0.08);
    ctx.shadowOffsetY = Math.max(1, rect.w * 0.035);
    ctx.drawImage(image, -rect.w / 2, -rect.h / 2, rect.w, rect.h);
    ctx.restore();
  });
}

function drawGemMix(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  images: HTMLImageElement[],
  items: StarInstance[],
) {
  if (images.length !== GEM_ASSETS.length) return;
  items.forEach((item) => {
    const image = images[item.styleIndex];
    const rect = getStarRect(canvas, item, image);
    ctx.save();
    ctx.translate(rect.cx, rect.cy);
    ctx.rotate((item.rotation * Math.PI) / 180);
    ctx.shadowColor = "rgba(20,12,10,.46)";
    ctx.shadowBlur = Math.max(5, rect.w * 0.13);
    ctx.shadowOffsetX = Math.max(2, rect.w * 0.055);
    ctx.shadowOffsetY = Math.max(3, rect.w * 0.08);
    ctx.drawImage(image, -rect.w / 2, -rect.h / 2, rect.w, rect.h);
    ctx.restore();
  });
}

function getStarRect(canvas: HTMLCanvasElement, item: StarInstance, image: HTMLImageElement) {
  const size = canvas.width * item.size;
  const aspect = image.width / image.height;
  const w = aspect >= 1 ? size : size * aspect;
  const h = aspect >= 1 ? size / aspect : size;
  return {
    x: canvas.width * item.x - w / 2,
    y: canvas.height * item.y - h / 2,
    cx: canvas.width * item.x,
    cy: canvas.height * item.y,
    w,
    h,
  };
}

function drawComposition(
  canvas: HTMLCanvasElement,
  format: FormatOption,
  backdrop: BackdropId,
  backdropImage: HTMLImageElement | undefined,
  layout: LayoutId,
  effect: EffectId,
  border: BorderStyle,
  strip: HTMLImageElement,
  decorations: DecorationId[],
  decorationImages: Partial<Record<DecorationId, HTMLImageElement>>,
  starImages: HTMLImageElement[],
  gemImages: HTMLImageElement[],
  loosePrints: LoosePrint[],
  starItems: StarInstance[],
  gemItems: StarInstance[],
  selectedPrintId?: number | null,
  selectedFinish?: EditableFinishId | null,
  selectedFinishItemId?: number | null,
  showSelection = false,
) {
  canvas.width = format.width;
  canvas.height = format.height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const backdropTransform = drawPaper(ctx, canvas.width, canvas.height, backdrop, backdropImage);

  if (backdrop === "photobooth" && backdropImage) {
    const h = backdropImage.height * 0.49 * backdropTransform.scale;
    const w = h * (strip.width / strip.height);
    const centerX = backdropTransform.x + backdropImage.width * 0.51 * backdropTransform.scale;
    const centerY = backdropTransform.y + backdropImage.height * 0.62 * backdropTransform.scale;
    const x = centerX - w / 2;
    const y = centerY - h / 2;
    if (decorations.includes("lace") && decorationImages.lace) {
      drawLaceFrame(ctx, decorationImages.lace, x, y, w, h, -6.5);
    }
    drawPhotoCard(
      ctx,
      strip,
      { x: 0, y: 0, w: strip.width, h: strip.height },
      x,
      y,
      w,
      h,
      -6.5,
      effect,
    );
  } else if (layout === "strip") {
    const h = canvas.height * 0.72;
    const w = h * (strip.width / strip.height);
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;
    if (decorations.includes("lace") && decorationImages.lace) {
      drawLaceFrame(ctx, decorationImages.lace, x, y, w, h, -1.1);
    }
    drawPhotoCard(
      ctx,
      strip,
      { x: 0, y: 0, w: strip.width, h: strip.height },
      x,
      y,
      w,
      h,
      -1.1,
      effect,
    );
  } else {
    loosePrints.forEach((item) => {
      const rect = getLooseRect(canvas, item);
      const centersByBorder: Record<BorderStyle, number[]> = {
        classic: [0.142, 0.375, 0.607, 0.84],
        thick: [0.149, 0.369, 0.589, 0.808],
        none: [0.12, 0.361, 0.601, 0.842],
      };
      const sourceH = strip.height * (border === "thick" ? 0.165 : 0.185);
      const sourceW = sourceH * 0.872;
      const sourceY = strip.height * centersByBorder[border][item.photoIndex] - sourceH / 2;
      const sourceX = (strip.width - sourceW) / 2;
      if (decorations.includes("lace") && decorationImages.lace) {
        drawLaceFrame(ctx, decorationImages.lace, rect.x, rect.y, rect.w, rect.h, item.rotation);
      }
      drawPhotoCard(
        ctx,
        strip,
        { x: sourceX, y: sourceY, w: sourceW, h: sourceH },
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        item.rotation,
        effect,
        "celfstudio",
        border,
      );
    });
  }

  if (decorations.includes("referenceStars")) {
    drawSparseStars(ctx, canvas, starImages, starItems);
  }
  if (decorations.includes("bedazzle")) {
    drawGemMix(ctx, canvas, gemImages, gemItems);
  }

  if (
    showSelection &&
    backdrop !== "photobooth" &&
    layout === "prints" &&
    selectedPrintId != null
  ) {
    const selected = loosePrints.find((item) => item.id === selectedPrintId);
    if (selected) drawSelection(ctx, getLooseRect(canvas, selected), selected.rotation);
  }
  if (showSelection && selectedFinish && selectedFinishItemId != null) {
    const items = selectedFinish === "bedazzle" ? gemItems : starItems;
    const images = selectedFinish === "bedazzle" ? gemImages : starImages;
    const selected = items.find((item) => item.id === selectedFinishItemId);
    const image = selected ? images[selected.styleIndex] : undefined;
    if (selected && image)
      drawSelection(ctx, getStarRect(canvas, selected, image), selected.rotation);
  }
}

function Decorate() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stripImageRef = useRef<HTMLImageElement | null>(null);
  const alternateStripImagesRef = useRef<Partial<Record<EffectId, HTMLImageElement>>>({});
  const alternateBordersRef = useRef<Partial<Record<EffectId, BorderStyle>>>({});
  const activeBorderRef = useRef<BorderStyle>("classic");
  const backdropImagesRef = useRef<Partial<Record<BackdropId, HTMLImageElement>>>({});
  const decorationImagesRef = useRef<Partial<Record<DecorationId, HTMLImageElement>>>({});
  const starImagesRef = useRef<HTMLImageElement[]>([]);
  const gemImagesRef = useRef<HTMLImageElement[]>([]);
  const [formatId, setFormatId] = useState<FormatId>("portrait");
  const [backdrop, setBackdrop] = useState<BackdropId>("bluePaper");
  const [layout, setLayout] = useState<LayoutId>("strip");
  const [effect, setEffect] = useState<EffectId>("original");
  const [border, setBorder] = useState<BorderStyle>("classic");
  const [borderRendering, setBorderRendering] = useState(false);
  const [decorations, setDecorations] = useState<DecorationId[]>([]);
  const [loosePrints, setLoosePrints] = useState<LoosePrint[]>(DEFAULT_LOOSE_PRINTS);
  const [starItems, setStarItems] = useState<StarInstance[]>(DEFAULT_STARS);
  const [gemItems, setGemItems] = useState<StarInstance[]>(DEFAULT_GEMS);
  const [selectedPrintId, setSelectedPrintId] = useState<number | null>(null);
  const [selectedFinish, setSelectedFinish] = useState<EditableFinishId | null>(null);
  const [selectedFinishItemId, setSelectedFinishItemId] = useState<number | null>(null);
  const [stripReady, setStripReady] = useState(false);
  const [stripRenderRevision, setStripRenderRevision] = useState(0);
  const [backdropsReady, setBackdropsReady] = useState(false);
  const [decorationsReady, setDecorationsReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const format = FORMATS.find((item) => item.id === formatId)!;
  const ready = stripReady && backdropsReady && decorationsReady;
  const interactionRef = useRef<CanvasInteraction | null>(null);
  const undoHistoryRef = useRef<EditorSnapshot[]>([]);
  const lastSnapshotRef = useRef<EditorSnapshot | null>(null);
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyingUndoRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  activeBorderRef.current = border;

  useEffect(() => {
    const current: EditorSnapshot = {
      formatId,
      backdrop,
      layout,
      effect,
      border,
      decorations: [...decorations],
      loosePrints: loosePrints.map((item) => ({ ...item })),
      starItems: starItems.map((item) => ({ ...item })),
      gemItems: gemItems.map((item) => ({ ...item })),
    };

    if (applyingUndoRef.current) {
      applyingUndoRef.current = false;
      lastSnapshotRef.current = current;
      return;
    }
    if (!lastSnapshotRef.current) {
      lastSnapshotRef.current = current;
      return;
    }

    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    setCanUndo(true);
    historyTimerRef.current = setTimeout(() => {
      if (lastSnapshotRef.current) {
        undoHistoryRef.current.push(lastSnapshotRef.current);
        if (undoHistoryRef.current.length > 60) undoHistoryRef.current.shift();
      }
      lastSnapshotRef.current = current;
      historyTimerRef.current = null;
    }, 180);
  }, [backdrop, border, decorations, effect, formatId, gemItems, layout, loosePrints, starItems]);

  useEffect(
    () => () => {
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    },
    [],
  );

  const undo = useCallback(() => {
    let target: EditorSnapshot | undefined;
    if (historyTimerRef.current && lastSnapshotRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
      target = lastSnapshotRef.current;
    } else {
      target = undoHistoryRef.current.pop();
    }
    if (!target) return;

    applyingUndoRef.current = true;
    lastSnapshotRef.current = target;
    setFormatId(target.formatId);
    setBackdrop(target.backdrop);
    setLayout(target.layout);
    setEffect(target.effect);
    setBorder(target.border);
    setDecorations([...target.decorations]);
    setLoosePrints(target.loosePrints.map((item) => ({ ...item })));
    setStarItems(target.starItems.map((item) => ({ ...item })));
    setGemItems(target.gemItems.map((item) => ({ ...item })));
    setSelectedPrintId(null);
    setSelectedFinish(null);
    setSelectedFinishItemId(null);
    setCanUndo(undoHistoryRef.current.length > 0);
  }, []);

  const paint = useCallback(() => {
    if (!canvasRef.current || !stripImageRef.current) return;
    const activeStrip =
      effect === "original"
        ? stripImageRef.current
        : (alternateStripImagesRef.current[effect] ?? stripImageRef.current);
    drawComposition(
      canvasRef.current,
      format,
      backdrop,
      backdropImagesRef.current[backdrop],
      layout,
      effect,
      border,
      activeStrip,
      decorations,
      decorationImagesRef.current,
      starImagesRef.current,
      gemImagesRef.current,
      loosePrints,
      starItems,
      gemItems,
      selectedPrintId,
      selectedFinish,
      selectedFinishItemId,
      layout === "prints" ||
        decorations.includes("referenceStars") ||
        decorations.includes("bedazzle"),
    );
  }, [
    backdrop,
    border,
    decorations,
    effect,
    format,
    gemItems,
    layout,
    loosePrints,
    selectedFinish,
    selectedFinishItemId,
    selectedPrintId,
    starItems,
    stripRenderRevision,
  ]);

  useEffect(() => {
    const promises = BACKDROPS.map(
      (item) =>
        new Promise<void>((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            backdropImagesRef.current[item.id] = image;
            resolve();
          };
          image.onerror = () => reject(new Error(`Could not load ${item.label}`));
          image.src = item.src;
        }),
    );
    void Promise.all(promises).then(() => setBackdropsReady(true));
  }, []);

  useEffect(() => {
    const imageOptions = DECORATIONS.filter((item) => item.src);
    const decorationPromises = imageOptions.map(
      (item) =>
        new Promise<void>((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            decorationImagesRef.current[item.id] = image;
            resolve();
          };
          image.onerror = () => reject(new Error(`Could not load ${item.label}`));
          image.src = item.src!;
        }),
    );
    const starPromises = STAR_ASSETS.map(
      (src, index) =>
        new Promise<void>((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            starImagesRef.current[index] = image;
            resolve();
          };
          image.onerror = () => reject(new Error(`Could not load star asset ${index + 1}`));
          image.src = src;
        }),
    );
    const gemPromises = GEM_ASSETS.map(
      (src, index) =>
        new Promise<void>((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            gemImagesRef.current[index] = image;
            resolve();
          };
          image.onerror = () => reject(new Error(`Could not load gem asset ${index + 1}`));
          image.src = src;
        }),
    );
    void Promise.all([...decorationPromises, ...starPromises, ...gemPromises]).then(() =>
      setDecorationsReady(true),
    );
  }, []);

  useEffect(() => {
    const stored = getSessionStrip();
    if (!stored) {
      if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview")) {
        const fixture = document.createElement("canvas");
        fixture.width = 1200;
        fixture.height = 3600;
        const fixtureCtx = fixture.getContext("2d")!;
        fixtureCtx.fillStyle = "#17120e";
        fixtureCtx.fillRect(0, 0, fixture.width, fixture.height);
        ["#bca18f", "#8fa6aa", "#c5ab9a", "#87918a"].forEach((color, index) => {
          const y = 110 + index * 820;
          fixtureCtx.fillStyle = color;
          fixtureCtx.fillRect(65, y, 1070, 780);
          fixtureCtx.fillStyle = "rgba(38,29,24,.34)";
          fixtureCtx.beginPath();
          fixtureCtx.arc(600, y + 300, 165, 0, Math.PI * 2);
          fixtureCtx.fill();
          fixtureCtx.fillRect(360, y + 455, 480, 260);
        });
        fixtureCtx.fillStyle = "#e8dcc5";
        fixtureCtx.font = "44px monospace";
        fixtureCtx.textAlign = "center";
        fixtureCtx.fillText("celfstudio", 600, 3520);
        fixture.toBlob((blob) => {
          if (!blob) return;
          const fixtureUrl = URL.createObjectURL(blob);
          const preview = new Image();
          preview.onload = () => {
            stripImageRef.current = preview;
            setSessionStrip({ url: fixtureUrl, blob, border: "classic" });
            setStripReady(true);
          };
          preview.src = fixtureUrl;
        }, "image/png");
        return;
      }
      void navigate({ to: "/print" });
      return;
    }
    setBorder(stored.border ?? "classic");
    const image = new Image();
    image.onload = () => {
      stripImageRef.current = image;
      setStripReady(true);
    };
    image.src = stored.url;

    const photos = getSessionPhotos();
    if (photos.length === 4) {
      const initialBorder = stored.border ?? "classic";
      ALTERNATE_EFFECTS.forEach((alternateEffect) => {
        void renderStrip(photos, initialBorder, alternateEffect as PrintLook).then((result) => {
          const alternate = new Image();
          alternate.onload = () => {
            if (activeBorderRef.current === initialBorder) {
              alternateStripImagesRef.current[alternateEffect] = alternate;
              alternateBordersRef.current[alternateEffect] = initialBorder;
              setStripRenderRevision((revision) => revision + 1);
            }
            URL.revokeObjectURL(result.url);
          };
          alternate.src = result.url;
        });
      });
    }
  }, [navigate]);

  useEffect(() => {
    const stored = getSessionStrip();
    const boothSource = stripImageRef.current;
    const previousBorder = stored?.border ?? "classic";
    if (!stored || !boothSource || previousBorder === border) {
      setBorderRendering(false);
      return;
    }

    let cancelled = false;
    setBorderRendering(true);
    const loadImage = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Could not load regenerated strip"));
        image.src = src;
      });

    const alternateSources = ALTERNATE_EFFECTS.map((alternateEffect) =>
      alternateBordersRef.current[alternateEffect] === previousBorder
        ? (alternateStripImagesRef.current[alternateEffect] ?? null)
        : null,
    );
    void Promise.all([
      reframeStrip(boothSource, previousBorder, border),
      ...alternateSources.map((source) =>
        source ? reframeStrip(source, previousBorder, border) : Promise.resolve(null),
      ),
    ])
      .then(async ([boothResult, ...alternateResults]) => {
        const boothImage = await loadImage(boothResult.url);
        const alternateImages = await Promise.all(
          alternateResults.map((result) =>
            result ? loadImage(result.url) : Promise.resolve(null),
          ),
        );
        if (cancelled) {
          URL.revokeObjectURL(boothResult.url);
          alternateResults.forEach((result) => {
            if (result) URL.revokeObjectURL(result.url);
          });
          return;
        }
        stripImageRef.current = boothImage;
        ALTERNATE_EFFECTS.forEach((alternateEffect, index) => {
          const image = alternateImages[index];
          const result = alternateResults[index];
          if (image && result) {
            alternateStripImagesRef.current[alternateEffect] = image;
            alternateBordersRef.current[alternateEffect] = border;
            URL.revokeObjectURL(result.url);
          } else {
            delete alternateStripImagesRef.current[alternateEffect];
            delete alternateBordersRef.current[alternateEffect];
          }
        });
        setSessionStrip({ url: boothResult.url, blob: boothResult.blob, border });
        setStripRenderRevision((revision) => revision + 1);

        const photos = getSessionPhotos();
        if (photos.length === 4) {
          ALTERNATE_EFFECTS.forEach((alternateEffect, index) => {
            if (alternateImages[index]) return;
            void renderStrip(photos, border, alternateEffect as PrintLook).then((result) => {
              const regenerated = new Image();
              regenerated.onload = () => {
                if (activeBorderRef.current === border) {
                  alternateStripImagesRef.current[alternateEffect] = regenerated;
                  alternateBordersRef.current[alternateEffect] = border;
                  setStripRenderRevision((revision) => revision + 1);
                }
                URL.revokeObjectURL(result.url);
              };
              regenerated.src = result.url;
            });
          });
        }
      })
      .catch(() => {
        // Keep the previous rendered strip available if the browser cannot reprint.
      })
      .finally(() => {
        if (!cancelled) setBorderRendering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [border]);

  useEffect(() => {
    if (ready) paint();
  }, [paint, ready]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        const target = event.target as HTMLElement | null;
        if (target?.matches("input, textarea, [contenteditable='true']")) return;
        if (selectedFinish && selectedFinishItemId != null) {
          event.preventDefault();
          if (selectedFinish === "bedazzle") {
            setGemItems((items) => items.filter((item) => item.id !== selectedFinishItemId));
          } else {
            setStarItems((items) => items.filter((item) => item.id !== selectedFinishItemId));
          }
          setSelectedFinishItemId(null);
          setSelectedFinish(null);
        } else if (layout === "prints" && selectedPrintId != null) {
          event.preventDefault();
          setLoosePrints((items) => items.filter((item) => item.id !== selectedPrintId));
          setSelectedPrintId(null);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [layout, selectedFinish, selectedFinishItemId, selectedPrintId, undo]);

  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    };
  };

  const pointInRect = (
    point: { x: number; y: number },
    rect: ReturnType<typeof getLooseRect>,
    rotation: number,
  ) => {
    const angle = (-rotation * Math.PI) / 180;
    const dx = point.x - rect.cx;
    const dy = point.y - rect.cy;
    const lx = dx * Math.cos(angle) - dy * Math.sin(angle);
    const ly = dx * Math.sin(angle) + dy * Math.cos(angle);
    return { rect, lx, ly, inside: Math.abs(lx) <= rect.w / 2 && Math.abs(ly) <= rect.h / 2 };
  };

  const pointInPrint = (point: { x: number; y: number }, item: LoosePrint) =>
    pointInRect(point, getLooseRect(canvasRef.current!, item), item.rotation);

  const pointInFinish = (
    point: { x: number; y: number },
    item: StarInstance,
    finish: EditableFinishId,
  ) => {
    const images = finish === "bedazzle" ? gemImagesRef.current : starImagesRef.current;
    const image = images[item.styleIndex];
    if (!image) return undefined;
    return pointInRect(point, getStarRect(canvasRef.current!, item, image), item.rotation);
  };

  const onCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const point = canvasPoint(event);
    let mode: "drag" | "resize" | "rotate" = "drag";

    const finishOrder: EditableFinishId[] = ["bedazzle", "referenceStars"];
    for (const finish of finishOrder) {
      if (!decorations.includes(finish)) continue;
      const finishItems = finish === "bedazzle" ? gemItems : starItems;
      let finishHit =
        selectedFinish === finish && selectedFinishItemId != null
          ? finishItems.find((item) => item.id === selectedFinishItemId)
          : undefined;
      if (finishHit) {
        const local = pointInFinish(point, finishHit, finish);
        if (local) {
          const handle = Math.max(22, local.rect.w * 0.12);
          if (Math.hypot(local.lx - local.rect.w / 2, local.ly - local.rect.h / 2) <= handle * 1.6)
            mode = "resize";
          else if (Math.hypot(local.lx, local.ly + local.rect.h / 2 + handle * 2.2) <= handle * 1.6)
            mode = "rotate";
          else if (!local.inside) finishHit = undefined;
        }
      }
      if (!finishHit) {
        finishHit = [...finishItems]
          .reverse()
          .find((item) => pointInFinish(point, item, finish)?.inside);
        mode = "drag";
      }
      if (finishHit) {
        setSelectedFinish(finish);
        setSelectedFinishItemId(finishHit.id);
        setSelectedPrintId(null);
        if (finish === "bedazzle") {
          setGemItems((items) => [
            ...items.filter((item) => item.id !== finishHit!.id),
            finishHit!,
          ]);
        } else {
          setStarItems((items) => [
            ...items.filter((item) => item.id !== finishHit!.id),
            finishHit!,
          ]);
        }
        interactionRef.current = {
          kind: "finish",
          finish,
          id: finishHit.id,
          mode,
          startX: point.x,
          startY: point.y,
          item: { ...finishHit },
        };
        canvas.setPointerCapture(event.pointerId);
        return;
      }
    }
    setSelectedFinish(null);
    setSelectedFinishItemId(null);

    if (layout !== "prints") return;
    let hit =
      selectedPrintId == null ? undefined : loosePrints.find((item) => item.id === selectedPrintId);
    mode = "drag";

    if (hit) {
      const local = pointInPrint(point, hit);
      const handle = Math.max(22, local.rect.w * 0.065);
      if (Math.hypot(local.lx - local.rect.w / 2, local.ly - local.rect.h / 2) <= handle * 1.6)
        mode = "resize";
      else if (Math.hypot(local.lx, local.ly + local.rect.h / 2 + handle * 2.2) <= handle * 1.6)
        mode = "rotate";
      else if (!local.inside) hit = undefined;
    }

    if (!hit) {
      hit = [...loosePrints].reverse().find((item) => pointInPrint(point, item).inside);
      mode = "drag";
    }
    if (!hit) {
      setSelectedPrintId(null);
      return;
    }

    setSelectedPrintId(hit.id);
    setSelectedFinish(null);
    setSelectedFinishItemId(null);
    setLoosePrints((items) => [...items.filter((item) => item.id !== hit!.id), hit!]);
    interactionRef.current = {
      kind: "print",
      id: hit.id,
      mode,
      startX: point.x,
      startY: point.y,
      item: { ...hit },
    };
    canvas.setPointerCapture(event.pointerId);
  };

  const onCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const action = interactionRef.current;
    const canvas = canvasRef.current;
    if (!action || !canvas) return;
    const point = canvasPoint(event);
    if (action.kind === "finish") {
      const finishAction = action;
      const updateItems = (items: StarInstance[]) =>
        items.map((item) => {
          if (item.id !== finishAction.id) return item;
          if (finishAction.mode === "drag") {
            return {
              ...item,
              x: Math.max(
                0.01,
                Math.min(
                  0.99,
                  finishAction.item.x + (point.x - finishAction.startX) / canvas.width,
                ),
              ),
              y: Math.max(
                0.01,
                Math.min(
                  0.99,
                  finishAction.item.y + (point.y - finishAction.startY) / canvas.height,
                ),
              ),
            };
          }
          const images =
            finishAction.finish === "bedazzle" ? gemImagesRef.current : starImagesRef.current;
          const image = images[finishAction.item.styleIndex];
          const rect = getStarRect(canvas, finishAction.item, image);
          if (finishAction.mode === "rotate") {
            return {
              ...item,
              rotation: (Math.atan2(point.y - rect.cy, point.x - rect.cx) * 180) / Math.PI + 90,
            };
          }
          const angle = (-finishAction.item.rotation * Math.PI) / 180;
          const dx = point.x - rect.cx;
          const dy = point.y - rect.cy;
          const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
          return {
            ...item,
            size: Math.max(0.018, Math.min(0.13, (Math.abs(localX) * 2) / canvas.width)),
          };
        });
      if (finishAction.finish === "bedazzle") setGemItems(updateItems);
      else setStarItems(updateItems);
      return;
    }
    const printAction = action;
    setLoosePrints((items) =>
      items.map((item) => {
        if (item.id !== printAction.id) return item;
        if (printAction.mode === "drag") {
          return {
            ...item,
            x: Math.max(
              0.03,
              Math.min(0.97, printAction.item.x + (point.x - printAction.startX) / canvas.width),
            ),
            y: Math.max(
              0.03,
              Math.min(0.97, printAction.item.y + (point.y - printAction.startY) / canvas.height),
            ),
          };
        }
        if (printAction.mode === "rotate") {
          const rect = getLooseRect(canvas, printAction.item);
          return {
            ...item,
            rotation: (Math.atan2(point.y - rect.cy, point.x - rect.cx) * 180) / Math.PI + 90,
          };
        }
        const rect = getLooseRect(canvas, printAction.item);
        const angle = (-printAction.item.rotation * Math.PI) / 180;
        const dx = point.x - rect.cx;
        const dy = point.y - rect.cy;
        const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
        return {
          ...item,
          width: Math.max(0.16, Math.min(0.62, (Math.abs(localX) * 2) / canvas.width)),
        };
      }),
    );
  };

  const endCanvasInteraction = (event: React.PointerEvent<HTMLCanvasElement>) => {
    interactionRef.current = null;
    if (canvasRef.current?.hasPointerCapture(event.pointerId))
      canvasRef.current.releasePointerCapture(event.pointerId);
  };

  const updateSelectedPrint = (change: Partial<LoosePrint>) => {
    if (selectedPrintId == null) return;
    setLoosePrints((items) =>
      items.map((item) => (item.id === selectedPrintId ? { ...item, ...change } : item)),
    );
  };

  const selectedPrint = loosePrints.find((item) => item.id === selectedPrintId);

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !stripImageRef.current) return;
    setSaving(true);
    const activeStrip =
      effect === "original"
        ? stripImageRef.current
        : (alternateStripImagesRef.current[effect] ?? stripImageRef.current);
    drawComposition(
      canvas,
      format,
      backdrop,
      backdropImagesRef.current[backdrop],
      layout,
      effect,
      border,
      activeStrip,
      decorations,
      decorationImagesRef.current,
      starImagesRef.current,
      gemImagesRef.current,
      loosePrints,
      starItems,
      gemItems,
      null,
      null,
      null,
      false,
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png", 1),
    );
    if (blob) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `celf-studio-decorated-${formatId}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15_000);
    }
    setSaving(false);
    paint();
  };

  return (
    <main className="min-h-dvh bg-[#f3eee5] text-ink">
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-paper/90 px-4 py-3 backdrop-blur-md sm:px-7">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => void navigate({ to: "/print" })}
            className="font-hand text-lg text-ink-soft transition-colors hover:text-rust"
          >
            ← back to the print
          </button>
          <div className="text-center">
            <h1 className="font-hand text-2xl tracking-[-.5px] sm:text-3xl">final touches !!</h1>
            <p className="font-type hidden text-[10px] uppercase tracking-[.18em] text-ink-soft sm:block">
              make it yours
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              title="Undo previous action"
              className="rounded-full border border-ink/20 bg-paper px-3.5 py-2.5 font-hand text-sm text-ink transition hover:-translate-y-0.5 hover:border-ink/45 disabled:cursor-not-allowed disabled:opacity-35 sm:px-5"
            >
              ↶ Undo
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!ready || saving || borderRendering}
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition hover:-translate-y-0.5 disabled:opacity-40 sm:px-7"
            >
              {saving ? "Saving…" : "Save image"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(460px,520px)] lg:gap-5 lg:px-7 lg:py-4">
        <section className="flex min-h-[62dvh] items-center justify-center rounded-[28px] border border-ink/10 bg-[#e8e0d3] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.8)] sm:p-8 lg:sticky lg:top-24 lg:h-[calc(100dvh-8rem)]">
          {ready ? (
            <div className="flex max-h-full max-w-full flex-col items-center gap-3">
              <canvas
                ref={canvasRef}
                aria-label="Decorated photo composition preview"
                onPointerDown={onCanvasPointerDown}
                onPointerMove={onCanvasPointerMove}
                onPointerUp={endCanvasInteraction}
                onPointerCancel={endCanvasInteraction}
                className={`max-h-[calc(100dvh-12rem)] max-w-full touch-none rounded-[3px] shadow-[0_24px_70px_-25px_rgba(40,28,20,.55)] ${layout === "prints" || decorations.includes("referenceStars") || decorations.includes("bedazzle") ? "cursor-grab active:cursor-grabbing" : ""}`}
                style={{ aspectRatio: `${format.width}/${format.height}` }}
              />
              {(decorations.includes("referenceStars") ||
                decorations.includes("bedazzle") ||
                layout === "prints") && (
                <p className="font-type text-[10px] uppercase tracking-[.13em] text-ink-soft">
                  {decorations.includes("referenceStars") || decorations.includes("bedazzle")
                    ? "Tap a star or gem · drag to move · use the dots to resize or turn"
                    : "Tap a print · drag to move · use the dots to resize or turn"}
                </p>
              )}
            </div>
          ) : (
            <p className="font-hand text-2xl text-ink-soft">loading...</p>
          )}
        </section>

        <aside className="space-y-3 pb-10 lg:grid lg:grid-cols-2 lg:content-start lg:gap-2 lg:space-y-0 lg:pb-0">
          <EditorSection number="01" title="Choose the canvas">
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map((item) => (
                <ChoiceButton
                  key={item.id}
                  active={formatId === item.id}
                  onClick={() => setFormatId(item.id)}
                  label={item.label}
                  detail={item.detail}
                />
              ))}
            </div>
          </EditorSection>

          <EditorSection number="02" title="Arrange the photos">
            <div className="grid grid-cols-2 gap-2">
              {LAYOUTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setLayout(item.id);
                    setSelectedPrintId(
                      item.id === "prints" ? (loosePrints.at(-1)?.id ?? null) : null,
                    );
                  }}
                  className={`rounded-xl border px-2 py-3 text-center transition ${layout === item.id ? "border-ink bg-ink text-paper" : "border-ink/15 bg-white/45 hover:border-ink/35"}`}
                >
                  <span className="font-type block text-lg leading-none">{item.glyph}</span>
                  <span className="font-hand mt-1 block text-base">{item.label}</span>
                </button>
              ))}
            </div>
            {layout === "prints" && (
              <div className="mt-3 rounded-xl border border-ink/10 bg-white/35 p-3">
                {selectedPrint ? (
                  <>
                    <p className="font-type mb-2 text-[9px] uppercase tracking-[.12em] text-ink-soft">
                      Editing photo {selectedPrint.photoIndex + 1}
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      <button
                        type="button"
                        aria-label="Make photo smaller"
                        onClick={() =>
                          updateSelectedPrint({ width: Math.max(0.16, selectedPrint.width - 0.04) })
                        }
                        className="rounded-lg border border-ink/15 bg-paper px-2 py-2 font-hand text-lg"
                      >
                        −
                      </button>
                      <button
                        type="button"
                        aria-label="Make photo larger"
                        onClick={() =>
                          updateSelectedPrint({ width: Math.min(0.62, selectedPrint.width + 0.04) })
                        }
                        className="rounded-lg border border-ink/15 bg-paper px-2 py-2 font-hand text-lg"
                      >
                        ＋
                      </button>
                      <button
                        type="button"
                        aria-label="Rotate photo"
                        onClick={() =>
                          updateSelectedPrint({ rotation: selectedPrint.rotation + 8 })
                        }
                        className="rounded-lg border border-ink/15 bg-paper px-2 py-2 font-hand text-lg"
                      >
                        ↻
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLoosePrints((items) =>
                            items.filter((item) => item.id !== selectedPrint.id),
                          );
                          setSelectedPrintId(null);
                        }}
                        className="rounded-lg border border-rust/30 bg-rust/5 px-2 py-2 font-hand text-sm text-rust"
                      >
                        delete
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-ink-soft">Tap a photo to edit it.</p>
                    <button
                      type="button"
                      onClick={() => setLoosePrints(DEFAULT_LOOSE_PRINTS)}
                      className="font-hand text-sm text-rust underline underline-offset-2"
                    >
                      restore all
                    </button>
                  </div>
                )}
              </div>
            )}
          </EditorSection>

          <EditorSection number="03" title="Frame the strip" className="lg:col-span-2">
            <div
              className="grid grid-cols-3 gap-2"
              role="radiogroup"
              aria-label="Photo border style"
            >
              {BORDER_OPTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={border === item.id}
                  disabled={borderRendering}
                  onClick={() => setBorder(item.id)}
                  className={`rounded-xl border px-2 py-3 text-left transition disabled:cursor-wait disabled:opacity-60 ${border === item.id ? "border-ink bg-ink text-paper" : "border-ink/15 bg-white/45 hover:border-ink/35"}`}
                >
                  <span className="font-hand block text-base leading-tight">{item.label}</span>
                  <span
                    className={`mt-1 block text-[10px] leading-tight ${border === item.id ? "text-paper/65" : "text-ink-soft"}`}
                  >
                    {item.detail}
                  </span>
                </button>
              ))}
            </div>
            {borderRendering ? (
              <p className="font-type mt-2 text-[9px] uppercase tracking-[.12em] text-ink-soft">
                reprinting the frame…
              </p>
            ) : null}
          </EditorSection>

          <EditorSection number="04" title="Tune the print">
            <div className="flex flex-wrap gap-2">
              {EFFECTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setEffect(item.id)}
                  className={`font-hand rounded-full border px-3.5 py-1.5 text-base transition ${effect === item.id ? "border-rust bg-rust text-paper" : "border-ink/20 bg-white/45 hover:border-ink/50"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </EditorSection>

          <EditorSection number="05" title="Pick some paper">
            <div className="grid grid-cols-8 gap-1.5">
              {BACKDROPS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  aria-label={item.label}
                  aria-pressed={backdrop === item.id}
                  onClick={() => {
                    setBackdrop(item.id);
                    if (item.id === "photobooth") {
                      setLayout("strip");
                      setSelectedPrintId(null);
                    }
                  }}
                  className={`aspect-square rounded-lg border-2 p-0.5 transition hover:-translate-y-0.5 ${backdrop === item.id ? "border-rust shadow-[0_0_0_2px_#faf6ef,0_0_0_4px_#a03d2e]" : "border-transparent"}`}
                >
                  <span
                    className="block h-full w-full rounded-[5px] border border-ink/15"
                    style={{
                      backgroundColor: item.color,
                      backgroundImage: `url("${item.src}")`,
                      backgroundPosition: "center",
                      backgroundSize: "cover",
                    }}
                  />
                </button>
              ))}
            </div>
          </EditorSection>

          <EditorSection number="06" title="Choose a finish" className="lg:col-span-2">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {DECORATIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={
                    item.id === "none" ? decorations.length === 0 : decorations.includes(item.id)
                  }
                  onClick={() => {
                    if (item.id === "none") {
                      setDecorations([]);
                      setSelectedFinish(null);
                      setSelectedFinishItemId(null);
                      return;
                    }
                    const isActive = decorations.includes(item.id);
                    setDecorations((current) =>
                      isActive
                        ? current.filter((finish) => finish !== item.id)
                        : [...current, item.id],
                    );
                    if (item.id === "referenceStars" || item.id === "bedazzle") {
                      if (isActive) {
                        if (selectedFinish === item.id) {
                          setSelectedFinish(null);
                          setSelectedFinishItemId(null);
                        }
                      } else {
                        const items = item.id === "bedazzle" ? gemItems : starItems;
                        setSelectedFinish(item.id);
                        setSelectedFinishItemId(items.at(-1)?.id ?? null);
                      }
                    }
                  }}
                  className={`flex min-h-[76px] items-center gap-2.5 overflow-hidden rounded-xl border p-2.5 text-left transition hover:-translate-y-0.5 lg:min-h-[62px] lg:gap-2 lg:p-2 ${(item.id === "none" ? decorations.length === 0 : decorations.includes(item.id)) ? "border-rust bg-rust/5 shadow-[inset_0_0_0_1px_#a03d2e]" : "border-ink/15 bg-white/45 hover:border-ink/35"}`}
                >
                  <span
                    className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg lg:h-10 lg:w-10 ${item.id === "lace" ? "bg-[#684a43]" : "bg-[#e8e1d6]"}`}
                  >
                    {(item.previewSrc ?? item.src) ? (
                      <img
                        src={item.previewSrc ?? item.src}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="font-hand text-sm text-ink-soft">as is</span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="font-hand block text-base leading-tight">{item.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </EditorSection>

          <button
            type="button"
            onClick={() => void save()}
            disabled={!ready || saving || borderRendering}
            className="w-full rounded-2xl bg-ink px-6 py-3 text-base font-semibold text-paper shadow-[0_12px_30px_-16px_rgba(42,36,30,.7)] transition hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 lg:col-span-2"
          >
            Save image
          </button>
          <p className="font-type text-center text-[10px] uppercase tracking-[.12em] text-ink-soft lg:col-span-2">
            Made privately in your browser
          </p>
        </aside>
      </div>
    </main>
  );
}

function EditorSection({
  number,
  title,
  children,
  className = "",
}: {
  number: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[22px] border border-ink/10 bg-paper/80 p-4 shadow-[0_8px_28px_-24px_rgba(42,36,30,.6)] sm:p-5 lg:rounded-[18px] lg:p-3 ${className}`}
    >
      <div className="mb-3 flex items-baseline gap-2 lg:mb-2">
        <span className="font-type text-[10px] text-rust">{number}</span>
        <h2 className="font-hand text-xl tracking-[-.2px] lg:text-lg">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ChoiceButton({
  active,
  onClick,
  label,
  detail,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition lg:p-2.5 ${active ? "border-rust bg-rust/5 shadow-[inset_0_0_0_1px_#a03d2e]" : "border-ink/15 bg-white/45 hover:border-ink/35"}`}
    >
      <span className="font-hand block text-lg leading-tight lg:text-base">{label}</span>
      <span className="font-type mt-1 block text-[10px] text-ink-soft lg:text-[9px]">{detail}</span>
    </button>
  );
}
