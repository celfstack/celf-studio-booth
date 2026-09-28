import { useEffect, useState } from "react";
import { roomApi, ApiError } from "./client";
import type { Presence, RoomCredentials, SharedState, Signal, SyncResult } from "./live-types";
export interface LiveView {
  state: SharedState;
  connected: boolean;
  remoteStream: MediaStream | null;
  remoteCursor: { x: number; y: number } | null;
  error: string;
  synced: boolean;
  pending: boolean;
}
const INITIAL: LiveView = {
  state: { revision: 0 },
  connected: false,
  remoteStream: null,
  remoteCursor: null,
  error: "",
  synced: false,
  pending: false,
};
// One serialized request queue prevents stale heartbeat responses from rolling
// back local edits. Durable field/entity patches survive either person leaving.
export class LiveRoom {
  view: LiveView = INITIAL;
  presence: Omit<Presence, "seenAt">;
  offset = 0;
  private listeners = new Set<(view: LiveView) => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private stopped = false;
  private pc?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private sender?: RTCRtpSender;
  private stream: MediaStream | null = null;
  private generation = "";
  private negotiating = false;
  private answered = "";
  private ice?: RTCIceServer[];
  private cursorAt = 0;
  private peerError = "";
  constructor(
    readonly credentials: RoomCredentials,
    stage: "booth" | "decorate",
  ) {
    let name = "";
    try {
      name = localStorage.getItem(`celf-name:${credentials.id}:${credentials.role}`) || "";
    } catch {
      /* optional */
    }
    this.presence = {
      instance: crypto.randomUUID(),
      name,
      camera: false,
      ready: false,
      connected: false,
      stage,
      cursor: null,
    };
  }
  subscribe(fn: (view: LiveView) => void) {
    this.listeners.add(fn);
    fn(this.view);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private emit(patch: Partial<LiveView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const fn of this.listeners) fn(this.view);
  }
  get other() {
    return this.view.state[this.credentials.role === "host" ? "guest" : "host"];
  }
  get online() {
    return Boolean(this.other && this.other.seenAt > Date.now() + this.offset - 6500);
  }
  start() {
    const tick = async () => {
      if (this.disposed || this.stopped) return;
      try {
        await this.update({ presence: this.presence });
      } catch {
        /* visible in status; retry */
      }
      if (!this.disposed && !this.stopped) this.timer = setTimeout(() => void tick(), 1200);
    };
    void tick();
  }
  update(update: Record<string, unknown>): Promise<SyncResult> {
    const task = async () => {
      if (this.disposed) throw new Error("Room closed");
      const sent = Date.now();
      try {
        const result = await roomApi<SyncResult>(
          `/${this.credentials.id}/sync`,
          this.credentials.token,
          "POST",
          update,
        );
        this.offset = result.now - (sent + Date.now()) / 2;
        this.emit({ state: result.state, error: this.peerError, synced: true });
        void this.connect().catch(() =>
          this.emit({
            error: "Live connection interrupted. Retry live, or take your half for later.",
          }),
        );
        return result;
      } catch (error) {
        if (error instanceof ApiError && [403, 404, 410].includes(error.status)) {
          this.stopped = true;
          this.closePeer();
        }
        this.emit({
          error: error instanceof Error ? error.message : "Reconnecting to your booth…",
        });
        throw error;
      }
    };
    const result = this.queue.then(task, task);
    this.queue = result.catch(() => {});
    return result;
  }
  private async gather(pc: RTCPeerConnection) {
    if (pc.iceGatheringState === "complete") return;
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        pc.removeEventListener("icegatheringstatechange", change);
        resolve();
      };
      const change = () => {
        if (pc.iceGatheringState === "complete") finish();
      };
      const timer = setTimeout(finish, 4500);
      pc.addEventListener("icegatheringstatechange", change);
    });
  }
  private closePeer() {
    this.channel?.close();
    this.pc?.close();
    this.pc = undefined;
    this.sender = undefined;
    this.channel = undefined;
    this.generation = "";
    this.answered = "";
    this.presence.connected = false;
    this.emit({ connected: false, remoteStream: null, remoteCursor: null });
  }
  private async connect() {
    if (this.disposed || this.negotiating) return;
    if (!this.online) {
      if (this.pc) this.closePeer();
      return;
    }
    const other = this.other!;
    const generation =
      this.credentials.role === "host"
        ? `${this.presence.instance}:${other.instance}`
        : `${other.instance}:${this.presence.instance}`;
    const signal = this.view.state[this.credentials.role === "host" ? "guestSignal" : "hostSignal"];
    this.negotiating = true;
    try {
      if (!this.ice) {
        const config = await roomApi<{ iceServers: RTCIceServer | RTCIceServer[] }>(
          `/${this.credentials.id}/sync`,
          this.credentials.token,
        );
        this.ice = Array.isArray(config.iceServers) ? config.iceServers : [config.iceServers];
      }
      if (this.disposed) return;
      if (this.generation !== generation) {
        this.closePeer();
        this.generation = generation;
        const pc = new RTCPeerConnection({ iceServers: this.ice });
        this.pc = pc;
        if (this.credentials.role === "host") {
          this.sender = pc.addTransceiver("video", { direction: "sendrecv" }).sender;
          if (this.stream) await this.sender.replaceTrack(this.stream.getVideoTracks()[0]);
        }
        pc.ontrack = (event) => {
          this.emit({ remoteStream: new MediaStream([event.track]) });
        };
        pc.onconnectionstatechange = () => {
          if (this.pc !== pc) return;
          this.presence.connected = pc.connectionState === "connected";
          this.emit({ connected: this.presence.connected });
          if (this.presence.connected) this.peerError = "";
          if (["failed", "disconnected"].includes(pc.connectionState)) {
            this.presence.ready = false;
            this.peerError =
              "Live connection interrupted. Retry live, or take your half for later.";
            this.emit({ error: this.peerError });
          }
        };
        const channel = pc.createDataChannel("celf", { negotiated: true, id: 0 });
        this.channel = channel;
        channel.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "cursor") {
              const c = data.cursor;
              if (
                c === null ||
                (Number.isFinite(c.x) &&
                  Number.isFinite(c.y) &&
                  c.x >= 0 &&
                  c.x <= 1 &&
                  c.y >= 0 &&
                  c.y <= 1)
              )
                this.emit({ remoteCursor: c });
            }
          } catch {
            /* discard malformed peer messages */
          }
        };
        if (this.credentials.role === "host") {
          await pc.setLocalDescription(await pc.createOffer());
          await this.gather(pc);
          if (this.pc === pc && !this.disposed)
            void this.update({
              signal: { generation, type: "offer", sdp: pc.localDescription!.sdp },
            }).catch(() => {});
        }
      }
      const pc = this.pc;
      if (!pc || !signal || signal.generation !== generation || this.answered === signal.sdp)
        return;
      if (this.credentials.role === "guest" && signal.type === "offer") {
        await pc.setRemoteDescription(signal);
        const video = pc.getTransceivers().find((item) => item.receiver.track.kind === "video");
        if (video) {
          video.direction = "sendrecv";
          this.sender = video.sender;
          await this.sender.replaceTrack(this.stream?.getVideoTracks()[0] || null);
        }
        await pc.setLocalDescription(await pc.createAnswer());
        await this.gather(pc);
        if (this.pc !== pc || this.disposed) return;
        this.answered = signal.sdp;
        void this.update({
          signal: { generation, type: "answer", sdp: pc.localDescription!.sdp } satisfies Signal,
        }).catch(() => {});
      } else if (
        this.credentials.role === "host" &&
        signal.type === "answer" &&
        pc.signalingState === "have-local-offer"
      ) {
        await pc.setRemoteDescription(signal);
        this.answered = signal.sdp;
      }
    } finally {
      this.negotiating = false;
    }
  }
  setName(name: string) {
    this.presence.name = name;
    try {
      localStorage.setItem(`celf-name:${this.credentials.id}:${this.credentials.role}`, name);
    } catch {
      /*optional*/
    }
  }
  setReady(ready: boolean) {
    this.presence.ready = ready;
    void this.update({ presence: this.presence }).catch(() => {});
  }
  setCamera(stream: MediaStream | null) {
    this.stream = stream;
    this.presence.camera = Boolean(stream);
    this.presence.ready = false;
    if (this.sender)
      void this.sender
        .replaceTrack(stream?.getVideoTracks()[0] || null)
        .catch(() => this.emit({ error: "Please retry the live connection." }));
    void this.update({ presence: this.presence }).catch(() => {});
  }
  cursor(cursor: { x: number; y: number } | null) {
    this.presence.cursor = cursor;
    if (Date.now() - this.cursorAt < 40 && cursor) return;
    this.cursorAt = Date.now();
    if (this.channel?.readyState === "open")
      this.channel.send(JSON.stringify({ type: "cursor", cursor }));
  }
  async capture() {
    return this.update({ start: true });
  }
  cancel() {
    this.presence.ready = false;
    void this.update({ cancel: true, presence: this.presence }).catch(() => {});
  }
  restart() {
    this.peerError = "";
    this.closePeer();
    this.presence.instance = crypto.randomUUID();
    this.ice = undefined;
    void this.update({ presence: this.presence }).catch(() => {});
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.closePeer();
    this.listeners.clear();
  }
}
export function useLiveRoom(
  credentials: RoomCredentials | null,
  stage: "booth" | "decorate" = "booth",
) {
  const [client, setClient] = useState<LiveRoom | null>(null);
  const [view, setView] = useState<LiveView>(INITIAL);
  const id = credentials?.id,
    token = credentials?.token,
    role = credentials?.role;
  useEffect(() => {
    if (!id || !token || !role) return;
    const room = new LiveRoom({ id, token, role }, stage);
    setClient(room);
    const unsubscribe = room.subscribe(setView);
    room.start();
    return () => {
      unsubscribe();
      room.dispose();
    };
  }, [id, token, role, stage]);
  return { client, ...view };
}
export type LiveRoomHook = ReturnType<typeof useLiveRoom>;
