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
const { createRoom, readRoom, submitPhotos, removeRoom, roomResponse, readBody } =
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
  await assert.rejects(submitPhotos(id, guestToken, data("Robin")), { status: 409 });
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
test("creation has a fixed-window rate limit", async () => {
  const ip = randomUUID();
  for (let i = 0; i < 10; i++) await createRoom({ name: "Test" }, ip);
  await assert.rejects(createRoom({ name: "Test" }, ip), { status: 429 });
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
