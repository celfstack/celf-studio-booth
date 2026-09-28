export interface Presence {
  instance: string;
  name: string;
  camera: boolean;
  ready: boolean;
  connected: boolean;
  stage: "booth" | "decorate";
  seenAt: number;
  cursor: { x: number; y: number } | null;
}
export interface Signal {
  generation: string;
  type: "offer" | "answer";
  sdp: string;
}
export interface CapturePlan {
  id: string;
  startAt: number;
  cancelled?: boolean;
}
export interface SharedState {
  revision: number;
  host?: Presence;
  guest?: Presence;
  hostSignal?: Signal;
  guestSignal?: Signal;
  capture?: CapturePlan;
  editor?: Record<string, unknown>;
}
export interface SyncResult {
  state: SharedState;
  now: number;
}
export interface RoomCredentials {
  id: string;
  token: string;
  role: "host" | "guest";
}
export function credentialsFromLink(link: string | null): RoomCredentials | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    const hash = new URLSearchParams(url.hash.slice(1));
    const role = hash.has("host") ? "host" : "guest";
    const token = hash.get(role) || "";
    const id = url.pathname.split("/")[2] || "";
    return /^[a-f0-9]{32}$/.test(id) && /^[a-f0-9]{64}$/.test(token) ? { id, token, role } : null;
  } catch {
    return null;
  }
}
