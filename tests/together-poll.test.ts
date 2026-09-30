import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { startVisiblePolling } from "../src/lib/together/poll";

function setup(t: TestContext) {
  const page = Object.assign(new EventTarget(), { hidden: false });
  Object.defineProperty(globalThis, "document", { configurable: true, value: page });
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 100_000 });
  t.after(() => {
    Reflect.deleteProperty(globalThis, "document");
    t.mock.timers.reset();
  });
  return page;
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

test("hidden tabs stop polling and resume once, without overlapping requests", async (t) => {
  const page = setup(t);
  let calls = 0;
  let release!: () => void;
  const polling = startVisiblePolling(
    () => {
      calls++;
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    { interval: () => 1200 },
  );
  assert.equal(calls, 1);
  page.hidden = true;
  page.dispatchEvent(new Event("visibilitychange"));
  page.hidden = false;
  page.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls, 1, "resuming while a request is in flight must not start a second");
  page.hidden = true;
  page.dispatchEvent(new Event("visibilitychange"));
  release();
  await flush();
  t.mock.timers.tick(120_000);
  assert.equal(calls, 1, "hidden tabs must make no background requests");
  page.hidden = false;
  page.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls, 2);
  polling.stop();
  release();
  await flush();
  page.dispatchEvent(new Event("visibilitychange"));
  t.mock.timers.tick(120_000);
  assert.equal(calls, 2, "unmount must remove timers and visibility listener");
});

test("outage retries back off, visibility cannot bypass cooldown, success restores cadence", async (t) => {
  const page = setup(t);
  let calls = 0;
  let failing = true;
  const polling = startVisiblePolling(
    async () => {
      calls++;
      if (failing) throw new Error("503");
    },
    { interval: () => 1200 },
  );
  await flush();
  for (const delay of [5000, 10_000, 20_000, 40_000, 60_000, 60_000]) {
    const before = calls;
    page.hidden = true;
    page.dispatchEvent(new Event("visibilitychange"));
    page.hidden = false;
    page.dispatchEvent(new Event("visibilitychange"));
    t.mock.timers.tick(delay - 1);
    assert.equal(calls, before);
    t.mock.timers.tick(1);
    await flush();
    assert.equal(calls, before + 1);
  }
  failing = false;
  t.mock.timers.tick(60_000);
  await flush();
  const recovered = calls;
  t.mock.timers.tick(1200);
  await flush();
  assert.equal(calls, recovered + 1);
  polling.stop();
});

test("fast readiness cadence can be requested immediately; terminal rooms do not retry", async (t) => {
  setup(t);
  let calls = 0;
  let ready = false;
  let terminal = false;
  const polling = startVisiblePolling(
    async () => {
      calls++;
    },
    {
      interval: () => (ready ? 1200 : 5000),
      stopped: () => terminal,
    },
  );
  await flush();
  t.mock.timers.tick(1200);
  assert.equal(calls, 1);
  ready = true;
  polling.wake();
  await flush();
  assert.equal(calls, 2);
  t.mock.timers.tick(1200);
  await flush();
  assert.equal(calls, 3);
  terminal = true;
  t.mock.timers.tick(60_000);
  assert.equal(calls, 3);
  polling.stop();
});
