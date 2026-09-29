import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
const dir = mkdtempSync(join(tmpdir(), "celf-booth-test-"));
process.env.NODE_ENV = "test";
process.env.TOGETHER_LOCAL_DB = join(dir, "rooms.sqlite");
delete process.env.VERCEL;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.KV_REST_API_URL;
const { createRoom, readRoom, submitPhotos, removeRoom, retakeRoom, roomResponse, readBody } =
  await import("../src/lib/together/service.server");
const { createValue, getValue, publish } = await import("../src/lib/together/store.server");
import type { RoomView } from "../src/lib/together/types";
// Tiny header fixture for server validation. Full real-image decode/rendering is covered by E2E.
const jpeg =
  "data:image/jpeg;base64," +
  Buffer.from([255, 216, 255, 192, 0, 11, 8, 3, 42, 2, 28, 1, 1, 17, 0, 255, 217]).toString(
    "base64",
  );
const data = (name: string) => ({ name, submissionId: randomUUID(), photos: Array(4).fill(jpeg) });
const make = () => createRoom({ name: "Celina" }, randomUUID());

test("two people publish independently; a shared link never grants host overwrite", async () => {
  const { id, token } = await make();
  const first = (await readRoom(id, token)) as RoomView;
  assert.equal(first.role, "host");
  assert.ok(first.inviteToken);
  assert.equal("hostHash" in first, false);
  const guestToken = first.inviteToken!;
  const guest = (await readRoom(id, guestToken)) as RoomView;
  assert.equal(guest.role, "guest");
  assert.equal(guest.inviteToken, undefined);
  const hostData = data("Celina");
  await submitPhotos(id, token, hostData);
  await submitPhotos(id, token, hostData); // idempotent retry
  await assert.rejects(submitPhotos(id, token, data("Overwrite")), { status: 409 });
  const competing = await Promise.allSettled([
    submitPhotos(id, guestToken, data("Robin")),
    submitPhotos(id, guestToken, data("Intruder")),
  ]);
  assert.equal(competing.filter((x) => x.status === "fulfilled").length, 1);
  const final = (await readRoom(id, token)) as RoomView;
  assert.equal(final.host?.name, "Celina");
  assert.ok(final.guest);
  const photos = (await readRoom(id, guestToken, true)) as { host: string[]; guest: string[] };
  assert.equal(photos.host.length, 4);
  assert.equal(photos.guest.length, 4);
  await removeRoom(id, guestToken);
  await assert.rejects(readRoom(id, token), { status: 410 });
  assert.equal(await getValue(`celf:together:${id}:host`), null);
  assert.equal(await getValue(`celf:together:${id}:guest`), null);
});
test("auth, invalid payloads and expiration are enforced server-side", async () => {
  const { id, token } = await make();
  await assert.rejects(readRoom(id, "a".repeat(64)), { status: 403 });
  await assert.rejects(readRoom("../../private", token), { status: 404 });
  await assert.rejects(submitPhotos(id, token, { ...data("Robin"), photos: [jpeg] }), {
    status: 400,
  });
  await assert.rejects(
    submitPhotos(id, token, {
      ...data("Robin"),
      photos: Array(4).fill("data:image/svg+xml,<svg/>"),
    }),
    { status: 400 },
  );
  await assert.rejects(createRoom({ name: "<script>" }, randomUUID()), { status: 400 });
  const original = await getValue<Record<string, unknown>>(`celf:together:${id}:room`);
  const expiredId = "c".repeat(32);
  await createValue(
    `celf:together:${expiredId}:room`,
    { ...original, id: expiredId, expiresAt: Date.now() - 1 },
    Date.now() - 1,
  );
  await assert.rejects(readRoom(expiredId, token), { status: 410 });
  await removeRoom(id, token);
});
test("deleted rooms cannot be resurrected by an in-flight upload", async () => {
  const { id, token } = await make();
  await removeRoom(id, token);
  assert.equal(
    await publish(
      `celf:together:${id}:room`,
      `celf:together:${id}:host`,
      `celf:together:${id}:host`,
      data("X"),
      Date.now() + 10_000,
    ),
    "missing",
  );
});
test("cross-origin requests, oversized bodies and private response caching", async () => {
  const foreign = await roomResponse(
    new Request("https://celf.test/api/together", {
      method: "POST",
      headers: { Origin: "https://evil.test" },
    }),
    async () => ({ ok: true }),
  );
  assert.equal(foreign.status, 403);
  const own = await roomResponse(new Request("https://celf.test/api/together"), async () => ({
    ok: true,
  }));
  assert.equal(own.headers.get("cache-control"), "private, no-store");
  const large = new Request("https://celf.test/api/together", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "x".repeat(740_001),
  });
  await assert.rejects(readBody(large), { status: 413 });
  const malformed = new Request("https://celf.test/api/together", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  await assert.rejects(readBody(malformed), { status: 400 });
});
test("creation allows repeated retakes but still limits bursts per network", async () => {
  const ip = randomUUID();
  const rooms = [];
  for (let i = 0; i < 30; i++) rooms.push(await createRoom({ name: "Test" }, ip));
  await assert.rejects(createRoom({ name: "Test" }, ip), { status: 429 });
  // Hitting the creation limit must not block using an existing invitation.
  assert.equal(((await readRoom(rooms[0].id, rooms[0].token)) as RoomView).role, "host");
  const otherNetwork = await createRoom({}, randomUUID());
  for (const room of [...rooms, otherNetwork]) await removeRoom(room.id, room.token);
});
test("guest may finish before the host; shared state merges independent changes and enforces readiness", async () => {
  const { syncRoom } = await import("../src/lib/together/live.server");
  const { id, token } = await createRoom({}, randomUUID());
  const guest = ((await readRoom(id, token)) as RoomView).inviteToken!;
  await submitPhotos(id, guest, data("Robin"));
  assert.equal(((await readRoom(id, token)) as RoomView).guest?.name, "Robin");
  await assert.rejects(syncRoom(id, token, { start: true }), { status: 409 });
  await assert.rejects(
    syncRoom(id, guest, { signal: { generation: "bad", type: "offer", sdp: "bad" } }),
    { status: 403 },
  );
  await assert.rejects(syncRoom(id, token, { editor: { __proto__: "bad", effect: "invalid" } }), {
    status: 400,
  });
  const presence = {
    instance: randomUUID(),
    name: "A",
    camera: true,
    ready: true,
    connected: true,
    stage: "booth",
    cursor: null,
  };
  await syncRoom(id, token, { presence });
  await syncRoom(id, guest, { presence: { ...presence, instance: randomUUID() } });
  const [a, b] = await Promise.all([
    syncRoom(id, token, { start: true, editor: { effect: "dreamy", formatId: "strip" } }),
    syncRoom(id, guest, { start: true, editor: { backdrop: "satin" } }),
  ]);
  assert.equal(a.state.capture.id, b.state.capture.id);
  const state = (await syncRoom(id, guest, {})).state;
  assert.equal(state.editor.effect, "dreamy");
  assert.equal(state.editor.formatId, "strip");
  assert.equal(state.editor.backdrop, "satin");
  assert.ok(state.capture.startAt > Date.now() + 3000);
  assert.equal((await syncRoom(id, guest, { cancel: true })).state.capture.cancelled, true);
  await removeRoom(id, token);
  assert.equal(await getValue(`celf:together:${id}:shared`), null);
  await assert.rejects(syncRoom(id, guest, { editor: { effect: "dreamy" } }), { status: 410 });
});
test("retakes reuse both invitations, reset atomically, and reject delayed old-round work", async () => {
  const { syncRoom } = await import("../src/lib/together/live.server");
  const { id, token } = await make();
  const initial = (await readRoom(id, token)) as RoomView;
  const guest = initial.inviteToken!;
  await submitPhotos(id, token, data("Host"));
  await submitPhotos(id, guest, data("Guest"));
  await syncRoom(id, token, { editor: { effect: "dreamy" } });
  const results = (await Promise.all([
    retakeRoom(id, token, { round: 0 }),
    retakeRoom(id, guest, { round: 0 }),
  ])) as RoomView[];
  assert.ok(results.every((r) => r.round === 1 && !r.host && !r.guest));
  assert.equal(((await readRoom(id, token)) as RoomView).inviteToken, guest);
  assert.deepEqual(await readRoom(id, guest, true), { host: [], guest: [] });
  await assert.rejects(submitPhotos(id, token, data("Late photo")), { status: 409 });
  await assert.rejects(syncRoom(id, guest, { round: 0, editor: { effect: "dreamy" } }), {
    status: 409,
  });
  // A fresh round remains usable after retries and old requests arrive.
  await submitPhotos(id, guest, { ...data("Guest again"), round: 1 });
  await retakeRoom(id, token, { round: 0 });
  assert.ok(((await readRoom(id, token)) as RoomView).guest);
  await submitPhotos(id, token, { ...data("Host again"), round: 1 });
  const state = (await syncRoom(id, token, { round: 1 })).state;
  assert.equal(state.round, 1);
  assert.equal(state.editor, undefined);
  assert.equal(state.capture, undefined);
  await removeRoom(id, token);
});
test("production never falls back to local storage", async () => {
  process.env.NODE_ENV = "production";
  try {
    await assert.rejects(getValue("missing"), /not configured/);
  } finally {
    process.env.NODE_ENV = "test";
    rmSync(dir, { recursive: true, force: true });
  }
});
