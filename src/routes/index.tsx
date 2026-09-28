import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { roomApi, rememberRoom, recentRoom } from "../lib/together/client";
import { resetSession } from "../lib/strip/session";

export const Route = createFileRoute("/")({
  component: Home,
});

const HOME_STARS = [
  {
    src: "/assets/decorations/stars/silver-glitter.png",
    left: "31%",
    top: "25%",
    width: "5.2%",
    delay: "2.5s",
  },
  {
    src: "/assets/decorations/stars/chrome-puff.png",
    left: "66%",
    top: "28%",
    width: "6.2%",
    delay: "2.58s",
  },
  {
    src: "/assets/decorations/stars/silver-sketch.png",
    left: "24%",
    top: "39%",
    width: "5.5%",
    delay: "2.66s",
  },
  {
    src: "/assets/decorations/stars/silver-faceted.png",
    left: "70%",
    top: "43%",
    width: "5.1%",
    delay: "2.74s",
  },
  {
    src: "/assets/decorations/stars/white-paper.png",
    left: "33%",
    top: "51%",
    width: "4.2%",
    delay: "2.82s",
  },
  {
    src: "/assets/decorations/stars/chrome-sparkle.png",
    left: "67%",
    top: "57%",
    width: "5.8%",
    delay: "2.9s",
  },
  {
    src: "/assets/decorations/stars/silver-glitter.png",
    left: "26%",
    top: "65%",
    width: "4.7%",
    delay: "2.98s",
  },
  {
    src: "/assets/decorations/stars/chrome-puff.png",
    left: "71%",
    top: "70%",
    width: "5.2%",
    delay: "3.06s",
  },
  {
    src: "/assets/decorations/stars/silver-faceted.png",
    left: "35%",
    top: "77%",
    width: "4.8%",
    delay: "3.14s",
  },
  {
    src: "/assets/decorations/stars/silver-sketch.png",
    left: "63%",
    top: "81%",
    width: "5%",
    delay: "3.22s",
  },
  {
    src: "/assets/decorations/stars/chrome-sparkle.png",
    left: "38%",
    top: "35%",
    width: "3.6%",
    delay: "3.3s",
  },
  {
    src: "/assets/decorations/stars/white-paper.png",
    left: "61%",
    top: "67%",
    width: "3.8%",
    delay: "3.38s",
  },
] as const;

function Home() {
  const navigate = useNavigate();

  const [mode, setMode] = useState<"solo" | "together">("solo");
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [returnLink, setReturnLink] = useState<string | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "together") setMode("together");
    setReturnLink(recentRoom());
    setHydrated(true);
  }, []);
  const enterBooth = async () => {
    if (busy) return;
    resetSession();
    if (mode === "solo") {
      void navigate({ to: "/booth" });
      return;
    }
    setBusy(true);
    setError("");
    try {
      const room = await roomApi<{ id: string; token: string }>("", "", "POST", {});
      rememberRoom(room.id, room.token, "host");
      await navigate({
        to: "/together/$roomId",
        params: { roomId: room.id },
        hash: `host=${room.token}`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open your booth. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-6 text-ink sm:py-8">
      <span
        aria-hidden="true"
        className="absolute -left-2 top-[11%] font-hand text-4xl text-ink/20"
      >
        ✦
      </span>
      <span
        aria-hidden="true"
        className="absolute left-[57%] top-7 font-hand text-3xl text-ink/20 sm:top-12"
      >
        ✦
      </span>
      <span
        aria-hidden="true"
        className="absolute right-8 top-[19%] font-hand text-4xl text-ink/20 sm:right-16"
      >
        ✦
      </span>
      <span
        aria-hidden="true"
        className="absolute -right-2 bottom-[9%] font-hand text-3xl text-ink/20"
      >
        ✦
      </span>

      <div className="flex w-full flex-col items-center">
        <header className="text-center">
          <h1 className="font-hand text-5xl leading-none tracking-[-.055em] sm:text-6xl">
            celf studio
          </h1>
          <p className="font-hand mt-3 text-lg text-ink-soft sm:text-xl">
            a little photo booth, just for you
          </p>
          <nav className="booth-mode-picker" aria-label="Choose your booth">
            <button
              type="button"
              disabled={!hydrated || busy}
              aria-pressed={mode === "solo"}
              onClick={() => setMode("solo")}
            >
              Just me
            </button>
            <button
              type="button"
              disabled={!hydrated || busy}
              aria-pressed={mode === "together"}
              onClick={() => setMode("together")}
            >
              Together ♡
            </button>
          </nav>
          <p className="mt-3 text-sm text-ink-soft" aria-live="polite">
            {mode === "together"
              ? "Two places, one photo strip. Live or in your own time."
              : "Four poses. A little moment for you."}
          </p>
          {error && (
            <p role="alert" className="together-error">
              {error}
            </p>
          )}
          {mode === "together" && returnLink && (
            <a className="together-text-link" href={returnLink}>
              Return to our booth →
            </a>
          )}
        </header>

        <button
          type="button"
          onClick={() => void enterBooth()}
          disabled={busy || !hydrated}
          aria-label="Enter Photo Booth"
          className="group mt-8 w-full max-w-[32rem] outline-offset-8 transition-transform duration-300 hover:scale-[1.012] focus-visible:outline-2 focus-visible:outline-rust active:scale-[.995] sm:mt-10"
        >
          <span className="home-print-stage block w-full overflow-hidden" aria-hidden="true">
            <span className="home-delivery-sign">
              <span>photos</span>
              <span>delivered</span>
              <span>here</span>
            </span>
            <span className="home-delivery-body">
              <span className="home-delivery-window" />
              <span className="home-delivery-handle" />
            </span>
            <span className="home-print-slot">
              <span className="home-print-screw home-print-screw-left" />
              <span className="home-print-slit" />
              <span className="home-print-screw home-print-screw-right" />
            </span>
            <span className="home-print-track">
              <img
                src="/assets/home-photo-strip.png"
                alt=""
                width={1200}
                height={3600}
                className="home-print-strip"
              />
            </span>
            <span className="home-print-stars">
              {HOME_STARS.map((star, index) => (
                <img
                  key={`${star.src}-${index}`}
                  src={star.src}
                  alt=""
                  className="home-print-star"
                  style={{
                    left: star.left,
                    top: star.top,
                    width: star.width,
                    animationDelay: star.delay,
                  }}
                />
              ))}
            </span>
          </span>
          <span className="font-hand mt-2 block text-xl text-ink-soft transition-colors group-hover:text-rust sm:text-2xl">
            {busy ? "opening your booth…" : "Enter Photo Booth →"}
          </span>
        </button>
      </div>

      <p className="font-type mt-6 text-center text-[10px] tracking-[.08em] text-ink-soft sm:text-xs">
        made with {"<3"} by{" "}
        <a
          href="https://www.instagram.com/celfstudies/"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-ink-soft/45 underline-offset-4 transition-colors hover:text-rust"
        >
          @celfstudies
        </a>
      </p>
    </main>
  );
}
