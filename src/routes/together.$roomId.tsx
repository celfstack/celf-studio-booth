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
import type { RoomPhotos, RoomView } from "../lib/together/types";
import { decodePhoto, isSupportedPhotoFile } from "../lib/strip/render";
import { resetSession, setSessionPhotos, setTogetherLink } from "../lib/strip/session";

export const Route = createFileRoute("/together/$roomId")({
  head: () => ({
    meta: [
      { title: "Our little booth · celf studio" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: SharedBooth,
});
const POSES = [
  "Make half a heart",
  "Point to your person",
  "Blow them a kiss",
  "One just for the two of you",
];
const EMPTY_PHOTOS: RoomPhotos = { host: [], guest: [] };

function SharedBooth() {
  const { roomId } = Route.useParams();
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [room, setRoom] = useState<RoomView | null>(null);
  const [photos, setPhotos] = useState<RoomPhotos>(EMPTY_PHOTOS);
  const [error, setError] = useState("");
  const [terminal, setTerminal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [localPreview, setLocalPreview] = useState(false);
  const [retry, setRetry] = useState(0);
  const photosVersion = useRef("");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalPreview(["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname));
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

  async function copy(value: string, kind: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(""), 3000);
    } catch {
      setError("Copy is unavailable in this browser. Select the link above and copy it manually.");
    }
  }
  async function openStrip() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const paired = await combinePhotos(photos);
      resetSession();
      setSessionPhotos(paired);
      setTogetherLink(roomLink(roomId, room!.role, token));
      await navigate({ to: "/print" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't develop your strip. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await roomApi(`/${roomId}`, token, "DELETE");
      resetSession();
      setPhotos(EMPTY_PHOTOS);
      setRoom(null);
      setTerminal(true);
      setError(
        "Your booth and its shared photos have been deleted. Downloaded copies stay with whoever saved them.",
      );
      try {
        localStorage.removeItem("celf-together-recent");
      } catch {
        /* optional storage */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the booth. Please try again.");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }
  const complete = Boolean(room?.host && room.guest);
  const submitted = room ? Boolean(room[room.role]) : false;
  const canCapture = room && !submitted && (room.role === "host" || Boolean(room.host));
  const invite = room?.inviteToken ? roomLink(roomId, "guest", room.inviteToken) : "";
  const ownLink = room ? roomLink(roomId, room.role, token) : "";

  return (
    <main className="together-page">
      <header className="together-nav">
        <Link className="together-wordmark" to="/">
          celf studio
        </Link>
        <span className="text-sm text-ink-soft">a little closer ♡</span>
      </header>
      <section className="together-room">
        <nav aria-label="Booth progress" className="together-progress">
          <span aria-current={!submitted ? "step" : undefined}>01 · your photos</span>
          <span aria-current={submitted && !complete ? "step" : undefined}>02 · their turn</span>
          <span aria-current={complete ? "step" : undefined}>03 · our strip</span>
        </nav>
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
        {canCapture && (
          <Capture
            key={room.role}
            room={room}
            token={token}
            partnerPhotos={photos.host}
            onShared={(next) => {
              setRoom(next);
              setRetry((v) => v + 1);
            }}
          />
        )}
        {room && !canCapture && !complete && (
          <>
            <p className="together-eyebrow">a little note from far away</p>
            <h1>
              {room.role === "host"
                ? "Your half is here. Their turn next."
                : `${room.name} is getting ready.`}
            </h1>
            <p className="together-room-lede">
              {room.role === "host"
                ? "Send them this invitation. They’ll see your poses and make the other half, whenever they’re ready."
                : "Their photos will appear here when they’re ready to share. You can leave this page and return with the same link."}
            </p>
            <MiniStrip photos={photos} />
            {invite && (
              <div className="together-share-card">
                <label htmlFor="invite-link">A little invitation for your person</label>
                <div className="together-link-field">
                  <input
                    id="invite-link"
                    value={invite}
                    readOnly
                    onFocus={(e) => e.target.select()}
                  />
                  <button className="together-primary" onClick={() => void copy(invite, "invite")}>
                    {copied === "invite" ? "Copied ✓" : "Copy invite"}
                  </button>
                </div>
                <p className="together-fine">
                  Anyone with this invitation can see your shared photos and fill the other side.
                  Send it to your person.
                </p>
                {localPreview && (
                  <p className="together-fine">
                    Local preview: this link only works on this computer. Online invitations will
                    work after publishing.
                  </p>
                )}
              </div>
            )}
            <p className="together-status">
              {room.role === "host" ? "Waiting for your person" : "Waiting for their photos"}
            </p>
            <p className="together-fine center">
              You don’t need to keep this page open. Come back with your saved link to find your
              finished strip.
            </p>
          </>
        )}
        {room && complete && (
          <>
            <p className="together-eyebrow">two places. one keepsake.</p>
            <h1>
              {room.host!.name} & {room.guest!.name},<br />
              together on paper.
            </h1>
            <p className="together-room-lede">
              Your four little moments, side by side. Add the finishing touches or keep it just like
              this.
            </p>
            <MiniStrip photos={photos} />
            <div className="together-actions">
              <button
                className="together-primary"
                onClick={() => void openStrip()}
                disabled={busy || photos.guest.length !== 4}
              >
                {busy ? "Developing your strip…" : "Develop our strip →"}
              </button>
            </div>
            <p className="together-fine center">
              Then decorate with all your usual filters, backgrounds, stars & gems.
              <br />
              You each get your own version to decorate and download.
            </p>
          </>
        )}
        {room && (
          <details>
            <summary>Your return link & privacy</summary>
            <div className="together-share-card">
              <label htmlFor="return-link">
                Your return link{" "}
                {room.role === "host" ? "— keep this one for yourself" : "— save it for later"}
              </label>
              <div className="together-link-field">
                <input
                  id="return-link"
                  value={ownLink}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
                <button className="together-secondary" onClick={() => void copy(ownLink, "return")}>
                  {copied === "return" ? "Copied ✓" : "Copy"}
                </button>
              </div>
              <p className="together-fine">
                Saved in this browser when storage is available. This room and its photos expire on{" "}
                {new Date(room.expiresAt).toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                })}
                . Download your keepsakes before then. Either person can delete the shared booth.
              </p>
              {!confirmDelete ? (
                <button className="together-danger" onClick={() => setConfirmDelete(true)}>
                  Delete this shared booth
                </button>
              ) : (
                <div role="alertdialog" aria-label="Delete the shared booth" className="mt-4">
                  <p>Delete the booth and both people’s shared photos? This can’t be undone.</p>
                  <div className="together-actions">
                    <button
                      className="together-primary"
                      disabled={busy}
                      onClick={() => void remove()}
                    >
                      Yes, delete booth
                    </button>
                    <button
                      className="together-secondary"
                      disabled={busy}
                      onClick={() => setConfirmDelete(false)}
                    >
                      Keep it
                    </button>
                  </div>
                </div>
              )}
            </div>
          </details>
        )}
      </section>
    </main>
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
  onShared,
}: {
  room: RoomView;
  token: string;
  partnerPhotos: string[];
  onShared: (room: RoomView) => void;
}) {
  const [name, setName] = useState(room.role === "host" ? room.name : "");
  const [shots, setShots] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [cameraOn, setCameraOn] = useState(false);
  const [opening, setOpening] = useState(false);
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
    setCameraOn(false);
    setOpening(false);
  }, []);
  const cancel = useCallback(() => {
    run.current++;
    setShooting(false);
    setCount(null);
  }, []);
  useEffect(() => {
    alive.current = true;
    const visibility = () => {
      if (document.hidden) {
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
      media.getVideoTracks()[0].onended = () => {
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
  async function capture() {
    if (shooting || !video.current || !cameraOn) return;
    const generation = ++run.current;
    const indices = complete ? [selected] : [0, 1, 2, 3].filter((i) => !shots[i]);
    setShooting(true);
    setError("");
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    try {
      for (const index of indices) {
        setSelected(index);
        for (let number = 3; number > 0; number--) {
          if (!alive.current || generation !== run.current) return;
          setCount(number);
          await sleep(1000);
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
        await sleep(700);
      }
      if (generation === run.current) stopCamera();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That shot didn’t work. Please try again.");
    } finally {
      if (alive.current && generation === run.current) {
        setShooting(false);
        setCount(null);
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
        name,
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
  const ownHalf = (
    <div className="together-half" key="you">
      {cameraOn ? (
        <video ref={video} autoPlay muted playsInline aria-label="Your mirrored camera preview" />
      ) : shots[selected] ? (
        <img src={shots[selected]} alt={`Your pose ${selected + 1}`} />
      ) : (
        <div className="together-half-empty">
          <span>♡</span>Your place in the picture
        </div>
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
      {room.role === "guest" && partnerPhotos[selected] ? (
        <img
          src={partnerPhotos[selected]}
          alt={`${room.host?.name || room.name}'s matching pose ${selected + 1}`}
        />
      ) : (
        <div className="together-half-empty">
          <span>♡</span>Saving a spot
          <br />
          for your person
        </div>
      )}
      <span className="together-half-label">
        {room.role === "guest" ? room.host?.name || room.name : "your person"}
      </span>
    </div>
  );

  return (
    <>
      <p className="together-eyebrow">
        {room.role === "guest"
          ? `a little invitation from ${room.host?.name || room.name}`
          : "you go first"}
      </p>
      <h1>
        {complete && !cameraOn
          ? "Four little moments. All you."
          : room.role === "host"
            ? "Leave a little room for them."
            : "They saved a place for you."}
      </h1>
      <p className="together-room-lede">
        {complete && !cameraOn
          ? "Choose a photo to check it or retake it. Nothing is shared until you’re happy with all four."
          : room.role === "host"
            ? "You’re on the left. They’ll be on the right. Strike four poses they can join from wherever they are."
            : "You’re on the right. Their saved poses are beside you—match a heart, share a kiss, or just be yourselves."}
      </p>
      {room.role === "guest" && (
        <div className="mx-auto max-w-xs text-left">
          <label className="mb-2 block text-sm" htmlFor="guest-name">
            Your first name or nickname
          </label>
          <input
            className="together-name-input"
            id="guest-name"
            autoComplete="given-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            placeholder="Your name"
          />
        </div>
      )}
      <div className="together-camera">
        {room.role === "host" ? [ownHalf, otherHalf] : [otherHalf, ownHalf]}
      </div>
      <p className="together-pose">
        {selected + 1} / 4 &nbsp; · &nbsp; {POSES[selected]}{" "}
        <span className="opacity-60">(or do your own thing)</span>
      </p>
      {shots.some(Boolean) && (
        <div className="together-contact-sheet" aria-label="Review your four photos">
          {[0, 1, 2, 3].map((i) => (
            <button
              key={i}
              type="button"
              disabled={shooting || busy || !shots[i]}
              aria-pressed={selected === i}
              aria-label={`Review photo ${i + 1}`}
              onClick={() => setSelected(i)}
            >
              {shots[i] ? (
                <img src={shots[i]} alt={`Your photo ${i + 1}`} />
              ) : (
                <div className="aspect-[2/3] bg-ink/5" />
              )}
              <span>{i + 1}</span>
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="together-error" role="alert">
          {error}
        </p>
      )}
      <div className="together-actions">
        {shooting ? (
          <button className="together-secondary" onClick={cancel}>
            Cancel countdown
          </button>
        ) : cameraOn ? (
          <>
            <button className="together-primary" disabled={busy} onClick={() => void capture()}>
              {complete
                ? `Retake photo ${selected + 1}`
                : shots.some(Boolean)
                  ? "Continue my photos"
                  : "Take my four photos"}
            </button>
            <button className="together-secondary" onClick={stopCamera}>
              Stop camera
            </button>
          </>
        ) : (
          <button
            className={complete ? "together-secondary" : "together-primary"}
            disabled={busy || opening}
            onClick={() => void startCamera()}
          >
            {opening
              ? "Opening camera…"
              : complete
                ? `Retake photo ${selected + 1}`
                : "Start my camera"}
          </button>
        )}
        {complete && !cameraOn && (
          <button
            className="together-primary"
            disabled={busy || !name.trim()}
            onClick={() => void submit()}
          >
            {busy
              ? "Sharing your photos…"
              : room.role === "host"
                ? "Happy with these · make my invite →"
                : "Happy with these · join our strip →"}
          </button>
        )}
      </div>
      {!shooting && (
        <>
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
          <button
            className="together-text-link"
            disabled={busy || opening}
            onClick={() => upload.current?.click()}
          >
            {busy ? "Working…" : "or upload four photos"}
          </button>
        </>
      )}
      <p className="together-fine center">
        {complete
          ? "Sharing saves these four photos to your private booth for 7 days. Your person can see and download them. Once shared, this side is final."
          : "Your camera stays on your device. Review your photos before choosing to share them. You can retake any shot."}
      </p>
    </>
  );
}
