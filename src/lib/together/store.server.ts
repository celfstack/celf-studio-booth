import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Production always uses durable Redis. SQLite is deliberately restricted to
// local development/test; a serverless deployment must never fall back to disk.
interface LocalDb {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...values: (string | number)[]): unknown;
    run(...values: (string | number)[]): { changes: number | bigint };
  };
}
let localDb: LocalDb | undefined;
async function database() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new Error("Together storage is not configured");
  }
  if (!localDb) {
    const path = resolve(process.env.TOGETHER_LOCAL_DB || ".local/together.sqlite");
    mkdirSync(dirname(path), { recursive: true });
    const { DatabaseSync } = await import("node:sqlite");
    localDb = new DatabaseSync(path);
    localDb.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL)",
    );
  }
  localDb.prepare("DELETE FROM kv WHERE expires <= ?").run(Date.now());
  return localDb;
}
function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}
async function command<T>(args: (string | number)[]): Promise<T> {
  const config = redisConfig();
  if (!config) throw new Error("Together storage is not configured");
  const response = await fetch(config.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Together storage unavailable");
  const data = (await response.json()) as { result: T; error?: string };
  if (data.error) throw new Error("Together storage unavailable");
  return data.result;
}
export async function getValue<T>(key: string): Promise<T | null> {
  if (redisConfig()) {
    const value = await command<string | null>(["GET", key]);
    return value ? (JSON.parse(value) as T) : null;
  }
  const row = (await database()).prepare("SELECT value FROM kv WHERE key = ?").get(key) as
    { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : null;
}
export async function createValue(key: string, value: unknown, expires: number) {
  if (redisConfig()) {
    return (
      (await command<string | null>(["SET", key, JSON.stringify(value), "NX", "PXAT", expires])) ===
      "OK"
    );
  }
  return (
    (await database())
      .prepare("INSERT OR IGNORE INTO kv VALUES (?, ?, ?)")
      .run(key, JSON.stringify(value), expires).changes === 1
  );
}
// Check existence and publish atomically: no resurrecting a deleted room,
// no second guest overwriting photos, and safe retries after a lost response.
export async function publish(
  roomKey: string,
  sideKey: string,
  hostKey: string,
  value: unknown,
  expires: number,
  summary: unknown = value,
) {
  if (redisConfig()) {
    return command<string>([
      "EVAL",
      `
      if redis.call('EXISTS', KEYS[1]) == 0 then return 'missing' end
      local previous = redis.call('GET', KEYS[4])
      if previous then return previous end
      redis.call('SET', KEYS[2], ARGV[1], 'PXAT', ARGV[2])
      redis.call('SET', KEYS[4], ARGV[4], 'PXAT', ARGV[2])
      return 'saved'`,
      4,
      roomKey,
      sideKey,
      hostKey,
      `${sideKey}:meta`,
      JSON.stringify(value),
      expires,
      sideKey.endsWith(":guest") ? "guest" : "host",
      JSON.stringify(summary),
    ]);
  }
  const db = await database();
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!db.prepare("SELECT value FROM kv WHERE key = ?").get(roomKey)) return "missing";
    const previous = db.prepare("SELECT value FROM kv WHERE key = ?").get(`${sideKey}:meta`) as
      { value: string } | undefined;
    if (previous) return previous.value;
    db.prepare("INSERT INTO kv VALUES (?, ?, ?)").run(sideKey, JSON.stringify(value), expires);
    db.prepare("INSERT INTO kv VALUES (?, ?, ?)").run(
      `${sideKey}:meta`,
      JSON.stringify(summary),
      expires,
    );
    return "saved";
  } finally {
    db.exec("COMMIT");
  }
}
export async function deleteRoom(keys: string[]) {
  if (redisConfig()) {
    await command(["DEL", ...keys]);
    return;
  }
  const db = await database();
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const key of keys) db.prepare("DELETE FROM kv WHERE key = ?").run(key);
  } finally {
    db.exec("COMMIT");
  }
}
export async function incrementWindow(key: string, seconds: number): Promise<number> {
  if (redisConfig())
    return command<number>([
      "EVAL",
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
      1,
      key,
      seconds,
    ]);
  const db = await database();
  db.prepare(
    "INSERT INTO kv VALUES (?, '1', ?) ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1",
  ).run(key, Date.now() + seconds * 1000);
  return Number(
    (db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string }).value,
  );
}

// A room's small collaboration document is merged atomically. Independent edits
// use individual keys, so moving one star cannot overwrite another person's gem.
export async function mergeShared(
  roomKey: string,
  stateKey: string,
  update: Record<string, unknown>,
  expires: number,
): Promise<string> {
  const now = Date.now();
  if (redisConfig())
    return command<string>([
      "EVAL",
      `
    if redis.call('EXISTS', KEYS[1]) == 0 then return 'missing' end
    local raw = redis.call('GET', KEYS[2])
    local s = raw and cjson.decode(raw) or {revision=0}
    local u = cjson.decode(ARGV[1])
    if u.start then
      if not s.host or not s.guest or not s.host.ready or not s.guest.ready or not s.host.camera or not s.guest.camera or not s.host.connected or not s.guest.connected or s.host.seenAt < tonumber(ARGV[3])-6000 or s.guest.seenAt < tonumber(ARGV[3])-6000 then return 'not-ready' end
      if not s.capture or s.capture.cancelled or s.capture.startAt < tonumber(ARGV[3])-18000 then s.capture=u.start end
    end
    if u.cancel and s.capture then s.capture.cancelled=true end
    for k,v in pairs(u) do
      if k == 'editor' then
        if not s.editor then s.editor={} end
        for ek,ev in pairs(v) do s.editor[ek]=ev end
      elseif k ~= 'start' and k ~= 'cancel' then s[k]=v end
    end
    if s.editor then local count=0; for _ in pairs(s.editor) do count=count+1 end; if count>256 then return 'too-many' end end
    s.revision=s.revision+1
    local result=cjson.encode(s)
    redis.call('SET',KEYS[2],result,'PXAT',ARGV[2])
    return result`,
      2,
      roomKey,
      stateKey,
      JSON.stringify(update),
      expires,
      now,
    ]);
  const db = await database();
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!db.prepare("SELECT value FROM kv WHERE key=?").get(roomKey)) return "missing";
    const row = db.prepare("SELECT value FROM kv WHERE key=?").get(stateKey) as
      { value: string } | undefined;
    const s = row ? JSON.parse(row.value) : { revision: 0 };
    if (update.start) {
      if (
        ![s.host, s.guest].every(
          (p) => p?.ready && p.camera && p.connected && p.seenAt >= now - 6000,
        )
      )
        return "not-ready";
      if (!s.capture || s.capture.cancelled || s.capture.startAt < now - 18000)
        s.capture = update.start;
    }
    if (update.cancel && s.capture) s.capture.cancelled = true;
    for (const [k, v] of Object.entries(update)) {
      if (k === "editor") s.editor = { ...s.editor, ...(v as object) };
      else if (k !== "start" && k !== "cancel") s[k] = v;
    }
    if (Object.keys(s.editor || {}).length > 256) return "too-many";
    s.revision++;
    const result = JSON.stringify(s);
    db.prepare(
      "INSERT INTO kv VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, expires=excluded.expires",
    ).run(stateKey, result, expires);
    return result;
  } finally {
    db.exec("COMMIT");
  }
}
