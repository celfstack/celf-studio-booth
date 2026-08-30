import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { resetSession } from "../lib/strip/session";

export const Route = createFileRoute("/")({
  component: Home,
});

const HOME_STARS = [
  { src: "/assets/decorations/stars/silver-glitter.png", left: "31%", top: "25%", width: "5.2%", delay: "2.5s" },
  { src: "/assets/decorations/stars/chrome-puff.png", left: "66%", top: "28%", width: "6.2%", delay: "2.58s" },
  { src: "/assets/decorations/stars/silver-sketch.png", left: "24%", top: "39%", width: "5.5%", delay: "2.66s" },
  { src: "/assets/decorations/stars/silver-faceted.png", left: "70%", top: "43%", width: "5.1%", delay: "2.74s" },
  { src: "/assets/decorations/stars/white-paper.png", left: "33%", top: "51%", width: "4.2%", delay: "2.82s" },
  { src: "/assets/decorations/stars/chrome-sparkle.png", left: "67%", top: "57%", width: "5.8%", delay: "2.9s" },
  { src: "/assets/decorations/stars/silver-glitter.png", left: "26%", top: "65%", width: "4.7%", delay: "2.98s" },
  { src: "/assets/decorations/stars/chrome-puff.png", left: "71%", top: "70%", width: "5.2%", delay: "3.06s" },
  { src: "/assets/decorations/stars/silver-faceted.png", left: "35%", top: "77%", width: "4.8%", delay: "3.14s" },
  { src: "/assets/decorations/stars/silver-sketch.png", left: "63%", top: "81%", width: "5%", delay: "3.22s" },
  { src: "/assets/decorations/stars/chrome-sparkle.png", left: "38%", top: "35%", width: "3.6%", delay: "3.3s" },
  { src: "/assets/decorations/stars/white-paper.png", left: "61%", top: "67%", width: "3.8%", delay: "3.38s" },
] as const;

function Home() {
  const navigate = useNavigate();

  const enterBooth = () => {
    resetSession();
    void navigate({ to: "/booth" });
  };

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-6 text-ink sm:py-8">
      <span aria-hidden="true" className="absolute -left-2 top-[11%] font-hand text-4xl text-ink/20">✦</span>
      <span aria-hidden="true" className="absolute left-[57%] top-7 font-hand text-3xl text-ink/20 sm:top-12">✦</span>
      <span aria-hidden="true" className="absolute right-8 top-[19%] font-hand text-4xl text-ink/20 sm:right-16">✦</span>
      <span aria-hidden="true" className="absolute -right-2 bottom-[9%] font-hand text-3xl text-ink/20">✦</span>

      <div className="flex w-full flex-col items-center">
        <header className="text-center">
          <h1 className="font-hand text-5xl leading-none tracking-[-.055em] sm:text-6xl">celf studio</h1>
          <p className="font-hand mt-3 text-lg text-ink-soft sm:text-xl">a little photo booth, just for you</p>
        </header>

        <button
          type="button"
          onClick={enterBooth}
          aria-label="Click to step into the Celf Studio photo booth"
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
                  style={{ left: star.left, top: star.top, width: star.width, animationDelay: star.delay }}
                />
              ))}
            </span>
          </span>
          <span className="font-hand mt-2 block text-xl text-ink-soft transition-colors group-hover:text-rust sm:text-2xl">
            click to step in →
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
