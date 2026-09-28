import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authorize, RoomError } from "./service.server";
import { mergeShared } from "./store.server";
const coordinate = z.number().finite().min(-10000).max(10000);
const baseEntity = {
  id: z.number().int().min(0).max(1e15),
  x: coordinate,
  y: coordinate,
  rotation: coordinate,
};
const printEntity = z
  .object({
    ...baseEntity,
    width: z.number().min(0.001).max(4),
    photoIndex: z.number().int().min(0).max(3),
  })
  .strict()
  .nullable();
const finishEntity = z
  .object({
    ...baseEntity,
    size: z.number().min(0.001).max(4),
    styleIndex: z.number().int().min(0).max(40),
  })
  .strict()
  .nullable();
const choices: Record<string, string[]> = {
  formatId: ["portrait", "story"],
  backdrop: [
    "satin",
    "bluePaper",
    "pinkPaper",
    "dots",
    "stripes",
    "corduroy",
    "denim",
    "photobooth",
  ],
  layout: ["strip", "prints"],
  effect: ["original", "dreamy", "vintageColor", "coolMono", "warmFlash", "noirPunch"],
  border: ["classic", "thick", "none"],
};
const schema = z
  .object({
    presence: z
      .object({
        instance: z.string().uuid(),
        name: z
          .string()
          .trim()
          .max(32)
          .regex(/^[^\p{Cc}\p{Cf}<>]*$/u),
        camera: z.boolean(),
        ready: z.boolean(),
        connected: z.boolean(),
        stage: z.enum(["booth", "decorate"]),
        cursor: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).nullable(),
      })
      .optional(),
    signal: z
      .object({
        generation: z.string().max(100),
        type: z.enum(["offer", "answer"]),
        sdp: z.string().max(30000),
      })
      .optional(),
    editor: z.record(z.string(), z.unknown()).optional(),
    start: z.boolean().optional(),
    cancel: z.boolean().optional(),
  })
  .strict();
export async function syncRoom(id: string, token: string, input: unknown) {
  const { room, role } = await authorize(id, token);
  const result = schema.safeParse(input);
  if (!result.success) throw new RoomError(400, "The shared update could not be read.");
  const data = result.data;
  if (data.editor) {
    if (Object.keys(data.editor).length > 100) throw new RoomError(400, "Too many edits at once.");
    for (const [key, value] of Object.entries(data.editor)) {
      const valid = Object.hasOwn(choices, key)
        ? typeof value === "string" && choices[key].includes(value)
        : /^decorations:(referenceStars|bedazzle|lace)$/.test(key)
          ? typeof value === "boolean"
          : /^(loosePrints|starItems|gemItems):\d{1,15}$/.test(key) &&
            (key.startsWith("loosePrints:") ? printEntity : finishEntity).safeParse(value)
              .success &&
            (value === null || (value as { id: number }).id === Number(key.split(":")[1]));
      if (!valid) throw new RoomError(400, "That decoration update is not supported.");
    }
  }
  if (data.signal && data.signal.type !== (role === "host" ? "offer" : "answer"))
    throw new RoomError(403, "This signal belongs to the other side.");
  const now = Date.now();
  const update: Record<string, unknown> = {};
  if (data.presence)
    update[role] = {
      ...data.presence,
      name: data.presence.name || (role === "host" ? "Person 1" : "Person 2"),
      seenAt: now,
    };
  if (data.signal) update[`${role}Signal`] = data.signal;
  if (data.editor) update.editor = data.editor;
  if (data.start) update.start = { id: randomUUID(), startAt: now + 5000 };
  if (data.cancel) update.cancel = true;
  const raw = await mergeShared(
    `celf:together:${id}:room`,
    `celf:together:${id}:shared`,
    update,
    room.expiresAt,
  );
  if (raw === "too-many") throw new RoomError(400, "This strip has reached its decoration limit.");
  if (raw === "missing") throw new RoomError(410, "This booth has expired or was deleted.");
  if (raw === "not-ready")
    throw new RoomError(409, "Both people need to turn on their cameras and press Ready first.");
  return { state: JSON.parse(raw), now: Date.now() };
}
export async function iceConfig(id: string, token: string) {
  await authorize(id, token);
  if (process.env.TURN_KEY_ID && process.env.TURN_API_TOKEN) {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(process.env.TURN_KEY_ID)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.TURN_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: 3600 }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok)
      throw new RoomError(503, "The live relay is unavailable. You can still take turns.");
    return await response.json();
  }
  return { iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }], relayConfigured: false };
}
