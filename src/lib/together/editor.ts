import { useEffect, useRef, useState } from "react";
import { getTogetherLink } from "../strip/session";
import { credentialsFromLink } from "./live-types";
import { useLiveRoom } from "./live";
type Snapshot = Record<string, unknown>;
type Entity = { id: number; [key: string]: unknown };
const GROUPS = ["loosePrints", "starItems", "gemItems"];
function flat(snapshot: Snapshot): Snapshot {
  const result: Snapshot = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (GROUPS.includes(key))
      for (const item of value as Entity[]) result[`${key}:${item.id}`] = item;
    else if (key === "decorations")
      for (const id of ["referenceStars", "bedazzle", "lace"])
        result[`decorations:${id}`] = (value as string[]).includes(id);
    else result[key] = value;
  }
  return result;
}
function unflat(values: Snapshot, base: Snapshot): Snapshot {
  const result = { ...base };
  for (const group of GROUPS)
    result[group] = Object.entries(values)
      .filter(([key, value]) => key.startsWith(`${group}:`) && value !== null)
      .map(([, value]) => value);
  result.decorations = ["referenceStars", "bedazzle", "lace"].filter(
    (id) => values[`decorations:${id}`],
  );
  for (const [key, value] of Object.entries(values)) if (!key.includes(":")) result[key] = value;
  return result;
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function useSharedEditor(snapshot: Snapshot, apply: (snapshot: Snapshot) => void) {
  const [credentials] = useState(() => credentialsFromLink(getTogetherLink()));
  const live = useLiveRoom(credentials, "decorate");
  const baseline = useRef<Snapshot | null>(null);
  const current = useRef(snapshot);
  current.current = snapshot;
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const pending = useRef(new Map<string, { value: unknown; seq: number }>());
  const sequence = useRef(0);
  const [dirty, setDirty] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const history = useRef<{ before: Snapshot; after: Snapshot }[]>([]);
  const undoing = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  // Detect only this tab's changes, recording per-entity inverses for local undo.
  useEffect(() => {
    if (!credentials || !live.synced) return;
    const next = flat(snapshot);
    if (!baseline.current) {
      baseline.current = next;
      return;
    }
    const before: Snapshot = {},
      after: Snapshot = {};
    for (const key of new Set([...Object.keys(next), ...Object.keys(baseline.current)])) {
      const value = next[key] ?? null;
      if (!equal(value, baseline.current[key] ?? null)) {
        before[key] = baseline.current[key] ?? null;
        after[key] = value;
        pending.current.set(key, { value, seq: ++sequence.current });
      }
    }
    baseline.current = next;
    if (Object.keys(after).length) {
      if (!undoing.current) {
        history.current.push({ before, after });
        if (history.current.length > 60) history.current.shift();
        setCanUndo(true);
      }
      undoing.current = false;
      setDirty(sequence.current);
    }
  }, [snapshot, credentials, live.synced]);
  // Merge the authoritative document with this tab's unacknowledged changes.
  useEffect(() => {
    if (!credentials || !live.synced) return;
    const values = { ...flat(current.current), ...live.state.editor };
    for (const [key, item] of pending.current) values[key] = item.value;
    const next = unflat(values, current.current);
    if (!equal(next, current.current)) {
      baseline.current = flat(next);
      applyRef.current(next);
    }
  }, [credentials, live.state.editor, live.synced]);
  useEffect(() => {
    if (!live.client || !dirty) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const save = async () => {
      const batch = new Map(pending.current);
      if (!batch.size) {
        setSaving(false);
        return;
      }
      setSaving(true);
      try {
        await live.client!.update({
          editor: Object.fromEntries([...batch].map(([key, item]) => [key, item.value])),
        });
        for (const [key, item] of batch)
          if (pending.current.get(key)?.seq === item.seq) pending.current.delete(key);
        setSaveError("");
        setSaving(pending.current.size > 0);
      } catch {
        if (!cancelled) {
          setSaveError("Edits are still on this device. Reconnecting to save…");
          timer = setTimeout(() => void save(), 2000);
        }
      }
    };
    timer = setTimeout(() => void save(), 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dirty, live.client]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pending.current.size) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  function undo() {
    const action = history.current.pop();
    if (!action) return;
    const values = flat(current.current);
    // Never undo a partner's subsequent change to the same item.
    for (const [key, value] of Object.entries(action.before))
      if (equal(values[key] ?? null, action.after[key])) values[key] = value;
    undoing.current = true;
    applyRef.current(unflat(values, current.current));
    setCanUndo(history.current.length > 0);
  }
  return {
    ...live,
    active: Boolean(credentials),
    saving: saving || pending.current.size > 0,
    saveError,
    undo,
    canUndo,
  };
}
