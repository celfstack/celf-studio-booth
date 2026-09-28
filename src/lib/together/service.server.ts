import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createValue, deleteRoom, getValue, incrementWindow, publish } from "./store.server";
import {
  MAX_PHOTO_LENGTH,
  PHOTO_HEIGHT,
  PHOTO_WIDTH,
  ROOM_LIFETIME_SECONDS,
  type BoothRole,
  type Contribution,
  type RoomMeta,
  type RoomView,
} from "./types";

export class RoomError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const guestToken = (hostToken: string) => hash(`celf-together-invite:${hostToken}`);
const key = (id: string, part = "room") => `celf:together:${id}:${part}`;
const nameSchema = z
  .string()
  .trim()
  .min(1, "Add your first name.")
  .max(32, "Keep your name to 32 characters.")
  .regex(/^[^\p{Cc}\p{Cf}<>]+$/u, "Use a simple name without special markup.");

function isPhoto(photo: string) {
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)) return false;
  const bytes = Buffer.from(photo.slice(23), "base64");
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217)
    return false;
  // Validate the encoded JPEG's dimensions, not merely the caller's claims.
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 255) return false;
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return false;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      return (
        bytes.readUInt16BE(offset + 5) === PHOTO_HEIGHT &&
        bytes.readUInt16BE(offset + 7) === PHOTO_WIDTH
      );
    }
    if (marker === 0xda) return false;
    offset += length + 2;
  }
  return false;
}
export const contributionSchema = z.object({
  name: nameSchema,
  submissionId: z.string().uuid(),
  photos: z
    .array(
      z
        .string()
        .max(MAX_PHOTO_LENGTH)
        .refine(isPhoto, "A photo could not be read. Please retake it."),
    )
    .length(4),
});
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new RoomError(400, parsed.error.issues[0]?.message || "Check your photos and try again.");
  return parsed.data;
}
export async function createRoom(input: unknown, ip: string) {
  const { name } = parse(z.object({ name: nameSchema.default("Our booth") }), input);
  if ((await incrementWindow(`celf:together:rate:create:${hash(ip)}`, 3600)) > 10)
    throw new RoomError(429, "A few too many booths. Please try again in an hour.");
  const id = randomBytes(16).toString("hex");
  const hostToken = randomBytes(32).toString("hex");
  const now = Date.now();
  const room: RoomMeta = {
    id,
    name,
    createdAt: now,
    expiresAt: now + ROOM_LIFETIME_SECONDS * 1000,
    hostHash: hash(hostToken),
    guestHash: hash(guestToken(hostToken)),
  };
  if (!(await createValue(key(id), room, room.expiresAt)))
    throw new RoomError(503, "Please try creating your booth again.");
  return { id, token: hostToken };
}
export async function authorize(
  id: string,
  token: string,
): Promise<{ room: RoomMeta; role: BoothRole }> {
  if (!/^[a-f0-9]{32}$/.test(id) || !/^[a-f0-9]{64}$/.test(token))
    throw new RoomError(404, "This invitation is incomplete. Ask for the full link.");
  const room = await getValue<RoomMeta>(key(id));
  if (!room || room.expiresAt <= Date.now())
    throw new RoomError(
      410,
      "This booth has expired or was deleted. Start a new one to make another memory.",
    );
  const digest = Buffer.from(hash(token), "hex");
  const role = timingSafeEqual(digest, Buffer.from(room.hostHash, "hex"))
    ? "host"
    : timingSafeEqual(digest, Buffer.from(room.guestHash, "hex"))
      ? "guest"
      : null;
  if (!role) throw new RoomError(403, "This invitation is incomplete. Ask for the full link.");
  if ((await incrementWindow(`celf:together:rate:read:${id}:${role}`, 60)) > 360)
    throw new RoomError(429, "Give the booth a moment, then try again.");
  return { room, role };
}
export async function readRoom(id: string, token: string, photos = false) {
  const { room, role } = await authorize(id, token);
  const [host, guest] = await Promise.all([
    getValue<Contribution>(key(id, photos ? "host" : "host:meta")),
    getValue<Contribution>(key(id, photos ? "guest" : "guest:meta")),
  ]);
  if (photos) return { host: host?.photos || [], guest: guest?.photos || [] };
  const view: RoomView = {
    id,
    name: room.name,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    role,
    host: host ? { name: host.name, submittedAt: host.submittedAt } : null,
    guest: guest ? { name: guest.name, submittedAt: guest.submittedAt } : null,
    ...(role === "host" ? { inviteToken: guestToken(token) } : {}),
  };
  return view;
}
export async function submitPhotos(id: string, token: string, input: unknown) {
  const { room, role } = await authorize(id, token);
  const data = parse(contributionSchema, input);
  const submittedAt = Date.now();
  const result = await publish(
    key(id),
    key(id, role),
    key(id, "host"),
    { ...data, submittedAt },
    room.expiresAt,
    { name: data.name, submittedAt, submissionId: data.submissionId },
  );
  if (result === "missing") throw new RoomError(410, "This booth has expired or was deleted.");
  if (result === "waiting")
    throw new RoomError(409, "Your person is still taking their photos. Come back in a moment.");
  if (result !== "saved" && (JSON.parse(result) as Contribution).submissionId !== data.submissionId)
    throw new RoomError(409, "This side has already been shared. Refresh to see your strip.");
  return readRoom(id, token);
}
export async function removeRoom(id: string, token: string) {
  await authorize(id, token);
  await deleteRoom([
    key(id),
    key(id, "host"),
    key(id, "guest"),
    key(id, "host:meta"),
    key(id, "guest:meta"),
    key(id, "shared"),
  ]);
  return { deleted: true };
}
export async function readBody(request: Request) {
  const maxBytes = 740_000;
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new RoomError(415, "Please send photos from the booth.");
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new RoomError(413, "These photos are too large. Please retake them.");
  const reader = request.body?.getReader();
  if (!reader) throw new RoomError(400, "Missing request.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) {
        await reader.cancel();
        throw new RoomError(413, "These photos are too large. Please retake them.");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof RoomError) throw error;
    throw new RoomError(400, "The request could not be read. Please try again.");
  }
}
export async function roomResponse(request: Request, handler: (token: string) => Promise<unknown>) {
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    Vary: "Authorization",
  };
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new RoomError(403, "Open your invitation directly to continue.");
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
    return Response.json(await handler(token), { headers });
  } catch (error) {
    // Never log requests, tokens, images, or storage provider responses.
    const status = error instanceof RoomError ? error.status : 503;
    return Response.json(
      {
        error:
          error instanceof RoomError
            ? error.message
            : "Shared booths are temporarily unavailable. Please try again shortly; any photos you took on this page are still here.",
      },
      { status, headers },
    );
  }
}
