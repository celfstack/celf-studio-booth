import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { recentRoom, rememberRoom, roomApi } from "../lib/together/client";

export const Route = createFileRoute("/together/")({ component: Together });
function Together() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [returnLink, setReturnLink] = useState<string | null>(null);
  useEffect(() => {
    setReturnLink(recentRoom());
    setReady(true);
  }, []);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await roomApi<{ id: string; token: string }>("", "", "POST", { name });
      rememberRoom(result.id, result.token, "host");
      await navigate({
        to: "/together/$roomId",
        params: { roomId: result.id },
        hash: `host=${result.token}`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create your booth. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="together-page">
      <header className="together-nav">
        <Link to="/" className="together-wordmark">
          celf studio
        </Link>
        <Link to="/booth">just me instead ↗</Link>
      </header>
      <div className="together-intro">
        <section className="together-intro-copy">
          <p className="together-eyebrow">a photo booth for two</p>
          <h1>
            Different places.
            <br />
            <em>Same little strip.</em>
          </h1>
          <p className="together-lede">
            For your faraway person. Your best friend. Your other half.
            <br className="hidden sm:block" /> A little way to be together, wherever you are.
          </p>
          <ol className="together-steps">
            <li>
              <span>01</span>Take your four photos.
            </li>
            <li>
              <span>02</span>Send a link. They fill in the other side.
            </li>
            <li>
              <span>03</span>Keep a strip of the two of you.
            </li>
          </ol>
          <form onSubmit={create} className="together-create">
            <label htmlFor="together-name">What should your person call you?</label>
            <input
              id="together-name"
              disabled={!ready}
              autoComplete="given-name"
              placeholder="Your first name or nickname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              required
            />
            <button className="together-primary" disabled={!ready || busy || !name.trim()}>
              {busy ? "Opening your booth…" : "Make a booth for two →"}
            </button>
            {error && (
              <p className="together-error" role="alert">
                {error}
              </p>
            )}
          </form>
          <p className="together-fine">
            Take turns, on your own time. No account needed.
            <br />
            Only photos you choose to share are uploaded. Your private link works for 7 days.
          </p>
          {returnLink && (
            <a className="together-text-link" href={returnLink}>
              Return to your last booth ↗
            </a>
          )}
        </section>
        <aside
          className="together-illustration"
          aria-label="An illustrated four-row photo strip with a place for each person"
        >
          <span className="together-postmark">
            sent with love
            <br />
            <span>✦ &nbsp; anywhere &nbsp; ✦</span>
          </span>
          <div className="together-paper-strip">
            {[0, 1, 2, 3].map((i) => (
              <div className="together-demo-pair" key={i}>
                <svg viewBox="0 0 100 140" aria-hidden="true">
                  <path
                    d={
                      i % 2 ? "M10 140Q10 87 50 88Q90 87 90 140" : "M4 140Q8 88 50 90Q82 84 100 140"
                    }
                  />
                  <ellipse cx="50" cy="65" rx="22" ry="27" />
                  <path d="M28 65Q17 24 51 29Q80 25 74 63M40 67h1m17 0h1M45 78q6 5 12-1" />
                  {i === 0 && <path d="M19 115Q-2 18 55 11Q80 4 99 31" />}
                  {i === 1 && <path d="M73 109l23-30m-3-10 2 12 8-4" />}
                  {i === 2 && <path d="M72 110L56 79m-6-3 9 2" />}
                </svg>
                <svg viewBox="0 0 100 140" aria-hidden="true" className="together-person-two">
                  <path d="M0 140Q13 86 50 92Q90 86 99 140" />
                  <ellipse cx="50" cy="66" rx="22" ry="27" />
                  <path d="M26 64Q20 23 56 29Q84 31 73 61M25 55q-8 30-1 48M76 49q12 40 0 55M39 68h1m18 0h1M43 79q7 5 13 0" />
                  {i === 0 && <path d="M80 115Q104 18 47 11Q20 4 1 31" />}
                  {i === 1 && <path d="M25 110L7 81m-8-6 8 6 1-11" />}
                  {i === 3 && <path d="M8 124l20-37m-5-10 5 10 7-7" />}
                </svg>
              </div>
            ))}
            <p>
              you & me
              <br />
              <span>celfstudio</span>
            </p>
          </div>
          <p className="together-hand-note">a little closer, even from here ♡</p>
          <img
            className="together-star"
            src="/assets/decorations/stars/chrome-sparkle.png"
            alt=""
          />
        </aside>
      </div>
      <footer className="together-footer">two places · four poses · one keepsake</footer>
    </main>
  );
}
