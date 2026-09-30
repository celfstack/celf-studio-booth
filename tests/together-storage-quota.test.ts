import assert from "node:assert/strict";
import { test } from "node:test";
import { getValue } from "../src/lib/together/store.server";

test("quota failure backs off server retries, logs no provider payload, and recovers", async (t) => {
  const oldUrl = process.env.UPSTASH_REDIS_REST_URL;
  const oldToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://test.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fake-test-token";
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  t.after(() => {
    if (oldUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = oldUrl;
    if (oldToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = oldToken;
    t.mock.timers.reset();
  });
  let exhausted = true;
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify(
          exhausted
            ? { error: "ERR max requests limit exceeded. PRIVATE_PROVIDER_DETAILS" }
            : { result: JSON.stringify({ restored: true }) },
        ),
        { status: exhausted ? 400 : 200 },
      ),
  );
  const warn = t.mock.method(console, "warn", () => {});
  await assert.rejects(getValue("private-room"), /storage unavailable/);
  await assert.rejects(getValue("private-room"), /storage unavailable/);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(warn.mock.callCount(), 1);
  assert.deepEqual(warn.mock.calls[0].arguments, [
    "[together:storage] request failed",
    { reason: "request_quota_exhausted", status: 400 },
  ]);
  exhausted = false;
  t.mock.timers.tick(60_000);
  assert.deepEqual(await getValue("private-room"), { restored: true });
  assert.equal(fetch.mock.callCount(), 2);
});
