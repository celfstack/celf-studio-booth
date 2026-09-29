import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  combinePhotos,
  encodeHalf,
  rememberRoom,
  roomApi,
  roomLink,
} from "../lib/together/client";
import { useLiveRoom, type LiveRoomHook } from "../lib/together/live";
import type { RoomPhotos, RoomView } from "../lib/together/types";
import { decodePhoto, isSupportedPhotoFile } from "../lib/strip/render";
import { resetSession, setSessionPhotos, setTogetherLink } from "../lib/strip/session";

export const Route = createFileRoute("/together/$roomId")({
  validateSearch: (search: Record<string, unknown>): { manage?: boolean } => ({
    manage: search.manage === true || search.manage === 1 || search.manage === "1",
  }),
  head: () => ({
    meta: [
      { title: "Our little booth · celf studio" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: SharedBooth,
});
const EMPTY_PHOTOS: RoomPhotos = { host: [], guest: [] };

function SharedBooth() {
  const { roomId } = Route.useParams();
  const { manage } = Route.useSearch();
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [room, setRoom] = useState<RoomView | null>(null);
  const [photos, setPhotos] = useState<RoomPhotos>(EMPTY_PHOTOS);
  const [error, setError] = useState("");
  const [developError, setDevelopError] = useState("");
  const [terminal, setTerminal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [retry, setRetry] = useState(0);
  const photosVersion = useRef("");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const credential = hash.get("host") || hash.get("guest") || "";
    setToken(credential);
    if (!/^[a-f0-9]{64}$/.test(credential)) {
      setError(
        "This invitation is incomplete. Ask your person to copy the full link, including the part after #.",
      );
      setTerminal(true);
      setLoading(false);
    }
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, [roomId]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        if (document.hidden) return;
        const next = await roomApi<RoomView>(`/${roomId}`, token);
        if (cancelled) return;
        const version = `${next.host?.submittedAt || 0}:${next.guest?.submittedAt || 0}`;
        if (photosVersion.current !== version) {
          const images = await roomApi<RoomPhotos>(`/${roomId}?photos=1`, token);
          if (cancelled) return;
          setPhotos(images);
          photosVersion.current = version;
        }
        setRoom(next);
        setLoading(false);
        setError("");
        setTerminal(false);
        rememberRoom(roomId, token, next.role);
      } catch (e) {
        if (cancelled) return;
        const expired = e instanceof ApiError && [400, 403, 404, 410].includes(e.status);
        setError(e instanceof Error ? e.message : "We lost the connection. Trying again…");
        setTerminal(expired);
        setLoading(false);
        if (expired) {
          cancelled = true;
          setPhotos(EMPTY_PHOTOS);
          setRoom(null);
        }
      } finally {
        if (!cancelled) timer = setTimeout(() => void refresh(), 7000);
      }
    }
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [roomId, token, retry]);

  const live = useLiveRoom(room && token ? { id: roomId, token, role: room.role } : null);
  const [nickname, setNickname] = useState("");
  useEffect(() => {
    if (live.client) setNickname(live.client.presence.name);
  }, [live.client]);

  async function copy(value: string, kind: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(""), 3000);
    } catch {
      setError("Copy is unavailable. Check clipboard permissions and try again.");
    }
  }
  const role = room?.role;
  const openStrip = useCallback(
    async (isCancelled: () => boolean = () => false) => {
      if (!role) return;
      setBusy(true);
      setDevelopError("");
      try {
        const paired = await combinePhotos(photos);
        if (isCancelled()) return;
        resetSession();
        setSessionPhotos(paired);
        setTogetherLink(roomLink(roomId, role, token));
        await navigate({ to: "/print", replace: true });
      } catch (e) {
        if (!isCancelled())
          setDevelopError(
            e instanceof Error ? e.message : "Couldn't develop your strip. Try again.",
          );
      } finally {
        if (!isCancelled()) setBusy(false);
      }
    },
    [photos, roomId, role, token, navigate],
  );
  const complete = Boolean(room?.host && room.guest);
  useEffect(() => {
    if (!complete || manage || photos.host.length !== 4 || photos.guest.length !== 4) return;
    let cancelled = false;
    void openStrip(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [complete, manage, photos, openStrip, retry]);
  const submitted = room ? Boolean(room[room.role]) : false;
  const canCapture = room && !submitted;
  const invite = room?.inviteToken ? roomLink(roomId, "guest", room.inviteToken) : "";
  const ownLink = room ? roomLink(roomId, room.role, token) : "";

  if (complete && !manage)
    return (
      <main className="together-page flex min-h-dvh items-center justify-center text-center">
        {developError || error ? (
          <div role="alert">
            <p>{developError || error}</p>
            <button
              className="together-primary mt-4"
              onClick={() => setRetry((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : (
          <p role="status">Developing your strip…</p>
        )}
      </main>
    );

  return (
    <main className="paired-booth-page">
      <section className="paired-booth-room">
        {loading && <p role="status">Opening your little booth…</p>}
        {error && (
          <div className="together-error" role="alert">
            {error}
            {!terminal && (
              <button className="ml-3 underline" onClick={() => setRetry((v) => v + 1)}>
                Try again
              </button>
            )}
          </div>
        )}
        {terminal && (
          <Link className="together-primary mt-7" to="/together">
            Make a new booth →
          </Link>
        )}
        {room && (
          <div className="paired-booth-toolbar">
            <input
              aria-label="Your name (optional)"
              maxLength={32}
              value={nickname}
              placeholder="your name"
              onChange={(e) => {
                const value = e.target.value.replace(/[<>\p{Cc}\p{Cf}]/gu, "");
                setNickname(value);
                live.client?.setName(value);
              }}
            />
            <button onClick={() => void copy(invite || ownLink, "invite")}>
              {copied === "invite" ? "Copied ✓" : "Copy invite ↗"}
            </button>
            <span className="sr-only" role="status">
              {live.connected ? "● Together live" : ""}
            </span>
          </div>
        )}
        {live.error && (
          <p role="alert" className="paired-booth-error">
            {live.error}{" "}
            <button className="underline" onClick={() => live.client?.restart()}>
              Retry live
            </button>
          </p>
        )}
        {canCapture && (
          <Capture
            key={room.role}
            room={room}
            token={token}
            partnerPhotos={room.role === "host" ? photos.guest : photos.host}
            live={live}
            name={nickname}
            onShared={(next) => {
              setRoom(next);
              setRetry((v) => v + 1);
            }}
          />
        )}
        {room && !canCapture && !complete && (
          <div className="paired-booth-card paired-booth-waiting">
            <LookHere />
            <MiniStrip photos={photos} />
            <h1 className="font-hand mt-5 text-2xl">your half is saved</h1>
            <p className="mt-2 text-sm text-ink-soft">
              They can join with your invite, whenever they’re ready.
            </p>
          </div>
        )}
        {!canCapture && (
          <Link className="paired-booth-back" to="/">
            ← sneak back out
          </Link>
        )}
        {room && complete && (
          <div className="together-actions">
            <button
              className="together-primary"
              disabled={busy || photos.host.length !== 4 || photos.guest.length !== 4}
              onClick={() => void openStrip()}
            >
              Return to our strip →
            </button>
            {developError && <p role="alert">{developError}</p>}
          </div>
        )}
      </section>
    </main>
  );
}
function LookHere() {
  return (
    <div className="flex items-center justify-center">
      <div className="flex w-fit items-center gap-2.5 rounded-full border border-ink/20 px-4 py-2">
        <span className="font-type text-[10px] font-bold tracking-[0.18em] text-ink uppercase">
          Look here
        </span>
        <span
          aria-hidden="true"
          className="h-4 w-4 rounded-full bg-ink shadow-[inset_0_2px_3px_rgba(255,255,255,0.35),0_0_0_3px_rgba(42,36,30,0.15)]"
        />
        <span className="font-type text-[10px] font-bold tracking-[0.18em] text-ink uppercase">
          Smile
        </span>
      </div>
    </div>
  );
}
function ShutterStar() {
  return (
    <svg
      viewBox="0 0 100 100"
      className="h-20 w-20 transition-transform duration-200 ease-out group-hover:-rotate-12 group-hover:scale-110 group-active:scale-95"
      aria-hidden="true"
    >
      <path
        d="M50 6 L61 36 Q62 39 65 39 L94 39 L71 58 Q68 60 69 63 L78 93 L53 75 Q50 73 47 75 L22 93 L31 63 Q32 60 29 58 L6 39 L35 39 Q38 39 39 36 Z"
        fill="#f2c94c"
        stroke="#2a241e"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function MiniStrip({ photos }: { photos: RoomPhotos }) {
  return (
    <div className="together-mini-strip" aria-label="Your shared four-photo strip">
      {[0, 1, 2, 3].map((i) => (
        <div className="together-mini-pair" key={i}>
          {photos.host[i] ? (
            <img src={photos.host[i]} alt={`First person's pose ${i + 1}`} />
          ) : (
            <span>♡</span>
          )}
          {photos.guest[i] ? (
            <img src={photos.guest[i]} alt={`Second person's pose ${i + 1}`} />
          ) : (
            <span>♡</span>
          )}
        </div>
      ))}
      <p>celfstudio</p>
    </div>
  );
}

function Capture({
  room,
  token,
  partnerPhotos,
  live,
  name,
  onShared,
}: {
  room: RoomView;
  token: string;
  partnerPhotos: string[];
  live: LiveRoomHook;
  name: string;
  onShared: (room: RoomView) => void;
}) {
  const liveRef = useRef(live);
  liveRef.current = live;
  const seenCapture = useRef("");
  const activeCapture = useRef(false);
  const [shots, setShots] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [cameraOn, setCameraOn] = useState(false);
  const [opening, setOpening] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [flash, setFlash] = useState(false);
  const autoStarted = useRef(false);
  const [shooting, setShooting] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const run = useRef(0);
  const openingRun = useRef(0);
  const submissionId = useRef(crypto.randomUUID());
  const complete = shots.filter(Boolean).length === 4;
  const stopCamera = useCallback(() => {
    openingRun.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    liveRef.current.client?.setCamera(null);
    setCameraOn(false);
    setOpening(false);
  }, []);
  const cancel = useCallback(() => {
    run.current++;
    setShooting(false);
    setCount(null);
    setFlash(false);
  }, []);
  useEffect(() => {
    alive.current = true;
    const visibility = () => {
      if (document.hidden) {
        liveRef.current.client?.cancel();
        cancel();
        stopCamera();
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      alive.current = false;
      // These are generation counters, not DOM refs; invalidate the latest tasks.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      run.current++;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      openingRun.current++;
      stream.current?.getTracks().forEach((t) => t.stop());
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [cancel, stopCamera]);
  useEffect(() => {
    if (cameraOn && video.current && stream.current) {
      video.current.srcObject = stream.current;
      void video.current.play().catch(() => setError("Tap Start camera again to enable playback."));
    }
  }, [cameraOn]);
  useEffect(() => {
    if (!shots.length) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [shots.length]);
  async function startCamera() {
    if (opening || cameraOn) return;
    const current = ++openingRun.current;
    setOpening(true);
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Use HTTPS or localhost to open your camera, or upload four photos instead.",
        );
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1620 } },
        audio: false,
      });
      if (!alive.current || current !== openingRun.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      liveRef.current.client?.setCamera(media);
      media.getVideoTracks()[0].onended = () => {
        liveRef.current.client?.cancel();
        cancel();
        stopCamera();
        setError(
          "Your camera disconnected. Your finished shots are still here; reconnect or upload photos.",
        );
      };
      setCameraOn(true);
    } catch (e) {
      if (alive.current && current === openingRun.current)
        setError(
          e instanceof DOMException
            ? "Your camera isn’t available. Allow camera access in your browser, retry, or upload four photos below."
            : e instanceof Error
              ? e.message
              : "Could not start the camera.",
        );
    } finally {
      if (alive.current && current === openingRun.current) setOpening(false);
    }
  }
  const startCameraRef = useRef(startCamera);
  startCameraRef.current = startCamera;
  useEffect(() => {
    if (live.client && !autoStarted.current) {
      autoStarted.current = true;
      void startCameraRef.current();
    }
  }, [live.client]);
  async function capture(startAt?: number) {
    if (shooting || !video.current || !cameraOn) return;
    const generation = ++run.current;
    const indices = startAt
      ? [0, 1, 2, 3]
      : complete
        ? [selected]
        : [0, 1, 2, 3].filter((i) => !shots[i]);
    activeCapture.current = Boolean(startAt);
    setShooting(true);
    setError("");
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    try {
      for (const index of indices) {
        setSelected(index);
        const deadline = startAt ? startAt + index * 3700 : Date.now() + 3000;
        while (Date.now() + (startAt ? liveRef.current.client?.offset || 0 : 0) < deadline) {
          if (!alive.current || generation !== run.current) return;
          const remaining =
            deadline - Date.now() - (startAt ? liveRef.current.client?.offset || 0 : 0);
          setCount(Math.min(3, Math.max(1, Math.ceil(remaining / 1000))));
          if (flashEnabled && remaining <= 160) setFlash(true);
          await sleep(Math.min(80, remaining));
        }
        if (!alive.current || generation !== run.current || document.hidden) return;
        const photo = encodeHalf(video.current!, true);
        setShots((previous) => {
          const next = [...previous];
          next[index] = photo;
          return next;
        });
        submissionId.current = crypto.randomUUID();
        setCount(null);
        setFlash(false);
        await sleep(700);
      }
      if (generation === run.current) stopCamera();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That shot didn’t work. Please try again.");
    } finally {
      if (alive.current && generation === run.current) {
        activeCapture.current = false;
        setShooting(false);
        setCount(null);
        setFlash(false);
      }
    }
  }
  async function uploadPhotos(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    if (files.length !== 4 || files.some((file) => !isSupportedPhotoFile(file))) {
      setError("Choose exactly four JPG, PNG, HEIC, or HEIF photos.");
      return;
    }
    cancel();
    stopCamera();
    setBusy(true);
    setError("");
    try {
      const result: string[] = [];
      for (const file of files) {
        const decoded = await decodePhoto(file);
        try {
          result.push(encodeHalf(decoded));
        } finally {
          if (decoded instanceof ImageBitmap) decoded.close();
        }
      }
      if (alive.current) {
        setShots(result);
        setSelected(0);
        submissionId.current = crypto.randomUUID();
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "A photo could not be opened. Try another set.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function submit() {
    if (busy || !complete) return;
    setBusy(true);
    setError("");
    stopCamera();
    try {
      const result = await roomApi<RoomView>(`/${room.id}`, token, "POST", {
        name: name.trim() || (room.role === "host" ? "Person 1" : "Person 2"),
        photos: shots,
        submissionId: submissionId.current,
      });
      onShared(result);
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Your photos haven’t been sent. Try again.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const captureRef = useRef(capture);
  captureRef.current = capture;
  useEffect(() => {
    const plan = live.state.capture;
    if (plan?.cancelled || (activeCapture.current && !live.connected)) {
      if (activeCapture.current) cancel();
      activeCapture.current = false;
      return;
    }
    if (!plan || plan.id === seenCapture.current) return;
    seenCapture.current = plan.id;
    const now = Date.now() + (live.client?.offset || 0);
    if (plan.startAt < now - 750) {
      if (cameraOn && plan.startAt > now - 18000) {
        setError("We missed the shared countdown. Get ready again to retry together.");
        live.client?.cancel();
      }
      return;
    }
    if (!cameraOn) return;
    void captureRef.current(plan.startAt);
  }, [live.state.capture, live.connected, live.client, cameraOn, cancel]);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const remoteCamera =
    live.connected && live.client?.online && live.client.other?.camera && live.remoteStream;
  useEffect(() => {
    if (remoteVideo.current && live.remoteStream) {
      remoteVideo.current.srcObject = live.remoteStream;
      void remoteVideo.current.play().catch(() => {});
    }
  }, [live.remoteStream, remoteCamera]);
  const ready = Boolean(live.state[room.role]?.ready);
  const bothReady =
    ready &&
    live.connected &&
    Boolean(
      live.state[room.role]?.connected &&
      live.client?.online &&
      live.client.other?.connected &&
      live.client.other.ready &&
      live.client.other.camera,
    );
  const ownHalf = (
    <div className="together-half" key="you">
      {cameraOn ? (
        <video ref={video} autoPlay muted playsInline aria-label="Your mirrored camera preview" />
      ) : shots[selected] ? (
        <img src={shots[selected]} alt={`Your pose ${selected + 1}`} />
      ) : (
        <div className="together-half-empty" aria-hidden="true" />
      )}
      <span className="together-half-label">{name || "you"}</span>
      {count && (
        <span className="together-count" role="status" aria-live="polite">
          {count}
        </span>
      )}
    </div>
  );
  const otherHalf = (
    <div className="together-half" key="them">
      {remoteCamera ? (
        <video
          ref={remoteVideo}
          autoPlay
          muted
          playsInline
          aria-label="Your person’s live camera"
        />
      ) : partnerPhotos[selected] ? (
        <img
          src={partnerPhotos[selected]}
          alt={`${room.host?.name || room.name}'s matching pose ${selected + 1}`}
        />
      ) : (
        <div className="together-half-empty" aria-hidden="true" />
      )}
      <span className="together-half-label">
        {live.client?.other?.name && !/^Person [12]$/.test(live.client.other.name)
          ? live.client.other.name
          : "your person"}
      </span>
    </div>
  );

  const sharedShutter =
    cameraOn && live.connected && Boolean(live.client?.other?.camera) && !complete;
  const shutterLabel = shooting
    ? "Taking photos"
    : complete && !cameraOn
      ? "Save my half →"
      : sharedShutter
        ? "Start together"
        : complete
          ? `Retake photo ${selected + 1}`
          : shots.some(Boolean)
            ? "Continue my photos"
            : "Take my four photos";
  const shutterText = shooting
    ? "here we go"
    : complete && !cameraOn
      ? "save my half →"
      : sharedShutter
        ? "start together"
        : complete
          ? `retake photo ${selected + 1}`
          : "press to start";
  const shutter = () => {
    if (!cameraOn) {
      if (complete) void submit();
    } else if (sharedShutter) void live.client?.capture().catch((e) => setError(e.message));
    else void capture();
  };
  return (
    <>
      <div className="paired-booth-card">
        <LookHere />
        <div className="together-camera paired-camera" aria-label="Together photo booth">
          {room.role === "host" ? [ownHalf, otherHalf] : [otherHalf, ownHalf]}
          <div
            aria-hidden="true"
            className="curtain-panel absolute inset-0 rounded-2xl pointer-events-none"
            data-open="true"
          />
        </div>
        <p
          className="font-hand mt-4 min-h-7 text-center text-2xl tracking-[-1px] text-ink"
          role="status"
        >
          {shooting
            ? count
              ? "smile !"
              : "hold it ..."
            : complete && !cameraOn
              ? "ready when you are"
              : "four poses, one strip"}
        </p>
        <div className="paired-contact-sheet" aria-label="Review your four photos">
          {[0, 1, 2, 3].map((i) => (
            <button
              key={i}
              type="button"
              disabled={shooting || busy || !shots[i]}
              aria-pressed={Boolean(shots[i]) && selected === i}
              aria-label={`Review photo ${i + 1}`}
              onClick={() => setSelected(i)}
            >
              {shots[i] ? <img src={shots[i]} alt={`Your photo ${i + 1}`} /> : <span>{i + 1}</span>}
            </button>
          ))}
        </div>
        {error && (
          <p className="together-error" role="alert">
            {error}
          </p>
        )}
        {live.connected && !shooting && (
          <button
            className="paired-ready"
            aria-pressed={ready}
            disabled={!cameraOn || opening}
            onClick={() => live.client?.setReady(!ready)}
          >
            {ready ? "Ready ✓" : "I'm ready"}
          </button>
        )}
        <div className="paired-shutter-area">
          <button
            className="group paired-shutter"
            aria-label={shutterLabel}
            disabled={
              shooting ||
              busy ||
              opening ||
              (!cameraOn && !complete) ||
              (sharedShutter && !bothReady)
            }
            onClick={shutter}
          >
            <ShutterStar />
            <span className="font-hand text-2xl text-ink">{busy ? "saving…" : shutterText}</span>
          </button>
          <div className="paired-secondary-actions">
            {shooting ? (
              <button
                onClick={() => {
                  live.client?.cancel();
                  cancel();
                }}
              >
                Cancel countdown
              </button>
            ) : (
              <>
                <button
                  disabled={busy || opening}
                  onClick={() => (cameraOn ? stopCamera() : void startCamera())}
                >
                  {opening ? "Opening camera…" : cameraOn ? "Stop camera" : "Open camera"}
                </button>
                {sharedShutter && (
                  <button disabled={busy} onClick={() => void capture()}>
                    Take my four photos
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        <button
          className="paired-flash"
          aria-pressed={flashEnabled}
          disabled={shooting || busy}
          onClick={() => setFlashEnabled((value) => !value)}
        >
          flash {flashEnabled ? "on ✦" : "off"}
        </button>
      </div>
      {flash && (
        <span aria-hidden="true" className="pointer-events-none fixed inset-0 z-[100] bg-white" />
      )}
      <div className="paired-booth-footer">
        <Link to="/">← sneak back out</Link>
        <input
          ref={upload}
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label="Upload four photos"
          onChange={(e) => void uploadPhotos(e)}
        />
        <button disabled={busy || opening || shooting} onClick={() => upload.current?.click()}>
          {busy ? "opening photos…" : "upload photos →"}
        </button>
      </div>
    </>
  );
}
