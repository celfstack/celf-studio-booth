import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  renderStrip,
  stripDateLabel,
} from "../lib/strip/render";
import {
  getSessionPhotos,
  getSessionStrip,
  resetSession,
  setSessionStrip,
} from "../lib/strip/session";

export const Route = createFileRoute("/print")({
  component: Print,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Print() {
  const navigate = useNavigate();
  const [stripUrl, setStripUrl] = useState<string | null>(null);
  const [dropped, setDropped] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const existing = getSessionStrip();
    if (existing) {
      setStripUrl(existing.url);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setDropped(true)),
      );
      return;
    }
    const photos = getSessionPhotos();
    if (photos.length !== 4) {
      void navigate({ to: "/" });
      return;
    }
    const started = Date.now();
    void (async () => {
      try {
        const result = await renderStrip(photos);
        // The machine takes a moment, always.
        await sleep(Math.max(0, 1200 - (Date.now() - started)));
        if (cancelled) {
          URL.revokeObjectURL(result.url);
          return;
        }
        setSessionStrip({ url: result.url, blob: result.blob, border: "classic" });
        setStripUrl(result.url);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setDropped(true)),
        );
      } catch {
        if (!cancelled) {
          setRenderError(
            "The printer jammed. Nothing was lost, take another strip.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const onDownload = useCallback(() => {
    if (!stripUrl) return;
    const a = document.createElement("a");
    a.href = stripUrl;
    a.download = `celf-studio-${stripDateLabel().toLowerCase().replaceAll(" ", "-")}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [stripUrl]);

  const onTakeAnother = useCallback(() => {
    resetSession();
    void navigate({ to: "/booth" });
  }, [navigate]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      {/* delivery sign */}
      <div className="rounded-lg bg-gradient-to-b from-chrome to-chrome-deep px-6 py-3 shadow-[0_8px_20px_-10px_rgba(42,36,30,0.5)]">
        <p className="font-type text-center text-[11px] font-bold tracking-[0.22em] text-ink/85 uppercase">
          Photos delivered here
          <br />
          in 1 second
        </p>
        <p aria-hidden="true" className="text-center text-base leading-none text-ink/85">
          &#8595;
        </p>
      </div>

      {/* the chute */}
      <div className="mt-4 w-full max-w-xs">
        <div className="rounded-[26px] bg-gradient-to-b from-chrome to-chrome-deep p-3 shadow-[0_24px_60px_-24px_rgba(42,36,30,0.65)]">
          <div className="relative overflow-hidden rounded-[18px] bg-[#14100c] px-7 py-5 shadow-[inset_0_6px_18px_rgba(0,0,0,0.8)]">
            <div className="min-h-[26rem]">
              {stripUrl ? (
                <div
                  className="strip-delivery mx-auto w-36 sm:w-40"
                  data-delivered={dropped ? "true" : "false"}
                >
                  <button
                    type="button"
                    onClick={() => setViewerOpen(true)}
                    aria-label="View your photo strip in full size"
                    className="block w-full cursor-zoom-in rounded-[3px] transition-transform duration-200 hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-paper"
                  >
                    <img
                      src={stripUrl}
                      alt="Photo strip of four contrasty sepia frames with a celfstudio footer"
                      className="w-full rounded-[3px] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)]"
                    />
                  </button>
                </div>
              ) : (
                <p
                  className="font-hand flex min-h-[26rem] items-center justify-center text-center text-2xl text-paper/60"
                  aria-live="polite"
                >
                  {renderError ? "" : "developing ..."}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {renderError ? (
        <p role="alert" className="mt-4 text-center text-sm text-rust">
          {renderError}
        </p>
      ) : null}
      {stripUrl ? (
        <p className="font-hand mt-3 text-lg text-ink-soft">
          click the strip to see it up close
        </p>
      ) : null}

      {/* actions */}
      <div className="mt-6 flex flex-col items-center gap-3">
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => void navigate({ to: "/decorate" })}
            disabled={!stripUrl}
            className="min-w-36 rounded-full bg-rust px-7 py-3 text-base font-semibold text-paper shadow-[0_8px_22px_-10px_rgba(160,61,46,0.8)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-rust-deep active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Decorate &#10022;
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={!stripUrl}
            className="min-w-36 rounded-full bg-ink px-7 py-3 text-base font-semibold text-paper transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-10px_rgba(42,36,30,0.7)] active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Download
          </button>
        </div>
        <button
          type="button"
          onClick={onTakeAnother}
          className="font-type text-[11px] text-ink-soft underline decoration-ink/25 underline-offset-4 transition-colors hover:text-rust"
        >
          retake
        </button>
      </div>

      {/* full-size viewer */}
      {viewerOpen && stripUrl ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Your photo strip, full size"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-ink/85 px-4 py-8 backdrop-blur-sm"
          onClick={() => setViewerOpen(false)}
        >
          <img
            src={stripUrl}
            alt="Photo strip of four contrasty sepia frames with a celfstudio footer"
            className="max-h-[76dvh] w-auto rounded-[4px] shadow-[0_40px_90px_-20px_rgba(0,0,0,0.9)]"
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="flex flex-col items-center justify-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => void navigate({ to: "/decorate" })}
                className="rounded-full bg-rust px-7 py-3 text-base font-semibold text-paper transition-transform duration-150 hover:scale-[1.03] active:scale-[0.97]"
              >
                Decorate &#10022;
              </button>
              <button
                type="button"
                onClick={onDownload}
                className="rounded-full bg-paper px-7 py-3 text-base font-semibold text-ink transition-transform duration-150 hover:scale-[1.03] active:scale-[0.97]"
              >
                Download
              </button>
            </div>
            <div className="flex items-center gap-4 font-type text-[11px] text-paper/70">
              <button type="button" onClick={onTakeAnother} className="underline underline-offset-4 transition-colors hover:text-paper">retake</button>
              <span aria-hidden="true">·</span>
              <button type="button" onClick={() => setViewerOpen(false)} className="underline underline-offset-4 transition-colors hover:text-paper">close</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
