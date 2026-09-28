import { MAX_PHOTO_LENGTH, PHOTO_HEIGHT, PHOTO_WIDTH, type RoomPhotos } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function roomApi<T>(
  path: string,
  token = "",
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/together${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new ApiError(response.status, data.error || "The booth could not connect. Try again.");
  return data;
}
export function roomLink(id: string, role: "host" | "guest", token: string) {
  return `${window.location.origin}/together/${id}#${role}=${token}`;
}
export function rememberRoom(id: string, token: string, role: "host" | "guest") {
  try {
    localStorage.setItem("celf-together-recent", JSON.stringify({ id, token, role }));
  } catch {
    /* The full link still works in private browsing. */
  }
}
export function recentRoom(): string | null {
  try {
    const data = JSON.parse(localStorage.getItem("celf-together-recent") || "null");
    if (
      data &&
      /^[a-f0-9]{32}$/.test(data.id) &&
      /^[a-f0-9]{64}$/.test(data.token) &&
      ["host", "guest"].includes(data.role)
    )
      return roomLink(data.id, data.role, data.token);
  } catch {
    /* Storage may be disabled. */
  }
  return null;
}
function sourceSize(source: HTMLVideoElement | HTMLImageElement | ImageBitmap) {
  if (source instanceof HTMLVideoElement) return [source.videoWidth, source.videoHeight];
  if (source instanceof HTMLImageElement) return [source.naturalWidth, source.naturalHeight];
  return [source.width, source.height];
}
/** Match the portrait half-frame shown in the camera exactly, including mirroring. */
export function encodeHalf(
  source: HTMLVideoElement | HTMLImageElement | ImageBitmap,
  mirror = false,
): string {
  const [width, height] = sourceSize(source);
  if (!width || !height) throw new Error("The camera is still warming up. Try again in a moment.");
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_WIDTH;
  canvas.height = PHOTO_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't open the camera canvas.");
  const scale = Math.max(PHOTO_WIDTH / width, PHOTO_HEIGHT / height);
  if (mirror) {
    ctx.translate(PHOTO_WIDTH, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(
    source,
    (PHOTO_WIDTH - width * scale) / 2,
    (PHOTO_HEIGHT - height * scale) / 2,
    width * scale,
    height * scale,
  );
  for (const quality of [0.88, 0.76, 0.64, 0.5, 0.36]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length <= MAX_PHOTO_LENGTH) return url;
  }
  throw new Error("This photo has too much detail to send. Try a simpler background.");
}
export function loadPhoto(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("A photo could not be opened. Please reload your booth."));
    image.src = url;
  });
}
/** Four paired images feed the original renderer, so all decorations still work. */
export async function combinePhotos(photos: RoomPhotos): Promise<HTMLImageElement[]> {
  if (photos.host.length !== 4 || photos.guest.length !== 4)
    throw new Error("Both sides need four photos first.");
  return Promise.all(
    photos.host.map(async (host, index) => {
      const [left, right] = await Promise.all([loadPhoto(host), loadPhoto(photos.guest[index])]);
      const canvas = document.createElement("canvas");
      canvas.width = PHOTO_WIDTH * 2;
      canvas.height = PHOTO_HEIGHT;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(left, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);
      ctx.drawImage(right, PHOTO_WIDTH, 0, PHOTO_WIDTH, PHOTO_HEIGHT);
      return loadPhoto(canvas.toDataURL("image/png"));
    }),
  );
}

/** Explicit booth management remains reachable after automatic developing. */
export function roomManagementLink(link: string | null) {
  if (!link) return "/";
  const url = new URL(link);
  url.searchParams.set("manage", "1");
  return url.toString();
}
