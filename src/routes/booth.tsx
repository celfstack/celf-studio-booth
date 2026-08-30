import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { makeThumbnail } from "../lib/strip/render";
import { setSessionPhotos } from "../lib/strip/session";

export const Route = createFileRoute("/booth")({
  component: Booth,
});

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Phase = "entering" | "ready" | "shooting" | "leaving";

function Booth() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shotsRef = useRef<ImageBitmap[]>([]);
  const [phase, setPhase] = useState<Phase>("entering");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [thumbs, setThumbs] = useState<string[]>([]);

  // Start the camera and open the curtain on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      } catch {
        if (!cancelled) {
          setCameraError(
            "We could not open the camera. Check the browser permission and step back in.",
          );
        }
      }
    })();
    const t = setTimeout(
      () => setPhase((p) => (p === "entering" ? "ready" : p)),
      prefersReducedMotion() ? 150 : 2200,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const capture = useCallback(async (): Promise<ImageBitmap | null> => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const cctx = c.getContext("2d")!;
    // Mirror the capture so it matches the on-screen preview.
    cctx.translate(c.width, 0);
    cctx.scale(-1, 1);
    cctx.drawImage(video, 0, 0);
    try {
      return await createImageBitmap(c);
    } catch {
      return null;
    }
  }, []);

  const startSequence = useCallback(async () => {
    if (phase !== "ready") return;
    setPhase("shooting");
    const reduced = prefersReducedMotion();
    for (let shot = 0; shot < 4; shot++) {
      for (let n = 3; n >= 1; n--) {
        setCount(n);
        await sleep(reduced ? 400 : 750);
      }
      setCount(null);
      setFlash(true);
      const bmp = await capture();
      await sleep(170);
      setFlash(false);
      if (bmp) {
        shotsRef.current.push(bmp);
        setThumbs((prev) => [...prev, makeThumbnail(bmp)]);
      } else {
        setCameraError(
          "The camera feed dropped mid-shoot. Step back in and try again.",
        );
        setPhase("ready");
        return;
      }
      if (shot < 3) await sleep(reduced ? 250 : 650);
    }
    setPhase("leaving");
    setSessionPhotos(shotsRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    await sleep(500);
    void navigate({ to: "/print" });
  }, [capture, navigate, phase]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#211b15] px-4 py-10">
      {/* booth faceplate */}
      <div className="w-full max-w-lg rounded-[28px] bg-paper p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] sm:p-7">
        {/* look-here sign */}
        <div className="mx-auto flex w-fit items-center gap-3 rounded-full border border-ink/20 px-5 py-2">
          <span className="font-type text-[11px] font-bold tracking-[0.22em] text-ink uppercase">
            Look here
          </span>
          <span
            aria-hidden="true"
            className="h-4 w-4 rounded-full bg-ink shadow-[inset_0_2px_3px_rgba(255,255,255,0.35),0_0_0_3px_rgba(42,36,30,0.15)]"
          />
          <span className="font-type text-[11px] font-bold tracking-[0.22em] text-ink uppercase">
            Smile
          </span>
        </div>

        {/* the square + curtain */}
        <div className="relative mx-auto mt-5 aspect-square w-full overflow-hidden rounded-2xl bg-ink">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="h-full w-full -scale-x-100 object-cover"
          />
          {count !== null ? (
            <span
              aria-live="assertive"
              className="font-display absolute inset-0 flex items-center justify-center text-[7rem] text-paper [text-shadow:0_3px_22px_rgba(0,0,0,0.6)]"
            >
              {count}
            </span>
          ) : null}
          {flash ? (
            <span aria-hidden="true" className="absolute inset-0 bg-white/95" />
          ) : null}
          {cameraError ? (
            <span className="absolute inset-0 flex items-center justify-center bg-ink/90 px-6 text-center text-sm text-paper">
              {cameraError}
            </span>
          ) : null}
          {/* curtain */}
          <div
            aria-hidden="true"
            className="curtain-panel absolute inset-0 rounded-2xl"
            data-open="true"
          />
        </div>

        {/* status line */}
        <p
          className="font-hand mt-4 min-h-7 text-center text-2xl tracking-[-1px] text-ink"
          aria-live="polite"
        >
          {phase === "shooting"
            ? count !== null
              ? "smile !"
              : "hold it ..."
            : phase === "leaving"
              ? "lovely. printing your strip"
              : thumbs.length === 0
                ? "four poses, one strip"
                : "ready when you are"}
        </p>

        {/* progress frames */}
        <div className="mt-3 flex items-center justify-center gap-2.5">
          {[0, 1, 2, 3].map((i) =>
            thumbs[i] ? (
              <img
                key={i}
                src={thumbs[i]}
                alt={`Pose ${i + 1} taken`}
                className="h-12 w-16 rounded-md border border-ink/20 object-cover"
              />
            ) : (
              <span
                key={i}
                className="flex h-12 w-16 items-center justify-center rounded-md border border-dashed border-ink/30"
              >
                <span className="font-type text-xs text-ink-soft">{i + 1}</span>
              </span>
            ),
          )}
        </div>

        {/* the star button */}
        <div className="mt-6 flex flex-col items-center pb-1">
          <button
            type="button"
            onClick={() => void startSequence()}
            disabled={phase !== "ready" || !!cameraError}
            aria-label="Press to start the four-photo countdown"
            className="group flex flex-col items-center gap-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
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
            <span className="font-hand text-2xl text-ink">
              {phase === "shooting" || phase === "leaving"
                ? "here we go"
                : "press to start"}
            </span>
          </button>
        </div>
      </div>

      <Link
        to="/"
        className="font-hand mt-6 text-lg text-paper/60 transition-colors duration-200 hover:text-paper"
      >
        &#8592; sneak back out
      </Link>
    </main>
  );
}
