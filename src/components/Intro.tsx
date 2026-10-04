import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { beatAt, usePrefersReducedMotion, useMediaQuery, webglAvailable } from "../lib/motion";
import { introScroll, scrollToId } from "../lib/scroll";
import { Silhouette } from "./Silhouette";

const Scene = lazy(() => import("../scene/Scene"));

const BEAT_COPY = [
  { label: "Exterior", line: "Infrastructure, owned by more people." },
  { label: "Server hall", line: "Inside: aisle after aisle of compute." },
  { label: "Rack", line: "Every rack is real, physical work." },
  { label: "Chip", line: "Down to the silicon doing it." },
  { label: "Your share", line: "A share sized to what you'd put in." },
] as const;

function Ctas() {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
      <a
        href="#signup"
        onClick={(e) => { e.preventDefault(); scrollToId("signup"); }}
        className="rounded-control bg-white px-6 py-3.5 font-semibold text-ink transition-[background-color] duration-150 ease-crisp hover:bg-paper"
      >
        Join the list
      </a>
      <a
        href="#how-it-works"
        onClick={(e) => { e.preventDefault(); scrollToId("how-it-works"); }}
        className="font-semibold text-white underline decoration-white/40 underline-offset-[6px] transition-colors hover:decoration-white"
      >
        How it works
      </a>
    </div>
  );
}

const INTRO_LEDE =
  "We're planning a data center that everyday people could help fund. Under the planned structure, investors would share in its profits in proportion to what each put in. Right now we're only gauging interest.";

/** Reduced-motion intro: no WebGL, no scrubbing. A static silhouette and the five beats in order. */
function StaticIntro() {
  return (
    <section id="intro" aria-labelledby="intro-title" className="on-dark relative overflow-hidden bg-night-950 text-white">
      <div className="gutter mx-auto max-w-[96rem] pt-32 pb-20 md:pt-40">
        <h1 id="intro-title" className="font-condensed max-w-[12ch] text-display">
          {BEAT_COPY[0].line}
        </h1>
        <p className="measure mt-8 text-body-lg text-white/85">{INTRO_LEDE}</p>
        <Ctas />
        <div className="mt-20 grid gap-12 md:grid-cols-12 md:items-end">
          <Silhouette className="md:col-span-7" />
          <ol className="space-y-5 md:col-span-5" aria-label="From the building to your share">
            {BEAT_COPY.slice(1).map((b) => (
              <li key={b.label} className="border-t border-white/20 pt-4">
                <span className="font-mono text-sm text-white/65">{b.label}</span>
                <p className="font-heading mt-1 text-h3">{b.line}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export function Intro() {
  const reduced = usePrefersReducedMotion();
  const mobile = useMediaQuery("(max-width: 767px)");
  const [canRender3d] = useState(() => typeof window !== "undefined" && webglAvailable());
  const [loadScene, setLoadScene] = useState(false);
  const [beat, setBeat] = useState(0);
  const [inView, setInView] = useState(true);
  const trackRef = useRef<HTMLElement>(null);

  // Text and CTA paint first; the 3D chunk is requested once the browser is idle.
  useEffect(() => {
    if (reduced || !canRender3d) return;
    const start = () => setLoadScene(true);
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(start, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(start, 300);
    return () => clearTimeout(id);
  }, [reduced, canRender3d]);

  // Map page scroll to intro progress and lift only the beat index into React.
  useEffect(() => {
    if (reduced || !canRender3d) return;
    const el = trackRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const p = travel > 0 ? Math.min(1, Math.max(0, -rect.top / travel)) : 0;
      introScroll.progress = p;
      setBeat(beatAt(p));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting));
    io.observe(el);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced, canRender3d]);

  if (reduced || !canRender3d) return <StaticIntro />;

  return (
    <section
      id="intro"
      ref={trackRef}
      aria-labelledby="intro-title"
      className="on-dark relative bg-night-950 text-white"
      style={{ height: mobile ? "460svh" : "560vh" }}
    >
      <div className="sticky top-0 h-svh overflow-hidden">
        {/* Night gradient paints instantly and stays as the fallback if WebGL is unavailable. */}
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(120%_80%_at_70%_30%,var(--color-night-800)_0%,var(--color-night-950)_60%)]" />
        {loadScene && (
          <Suspense fallback={null}>
            <Scene mobile={mobile} active={inView} />
          </Suspense>
        )}

        {/* Legibility scrim behind the overlaid headline. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-linear-to-t from-night-950/80 via-night-950/10 to-transparent" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-linear-to-b from-night-950/75 to-transparent" />

        <div className="gutter relative mx-auto flex h-full max-w-[96rem] flex-col justify-end pb-[max(3rem,8svh)]">
          <div className="grid">
            {BEAT_COPY.map((b, i) => {
              const active = beat === i;
              const Tag = i === 0 ? "h1" : "p";
              return (
                <div key={b.label} className="col-start-1 row-start-1 self-end">
                  <Tag
                    id={i === 0 ? "intro-title" : undefined}
                    data-active={active}
                    className="beat-line font-condensed max-w-[13ch] text-display"
                  >
                    {b.line}
                  </Tag>
                  {i === 0 && (
                    <div inert={!active} className={`transition-opacity duration-300 ${active ? "opacity-100" : "pointer-events-none opacity-0"}`}>
                      <p className="measure mt-6 text-body-lg text-white/85">{INTRO_LEDE}</p>
                      <Ctas />
                    </div>
                  )}
                  {i === 4 && (
                    <p data-active={active} className="beat-line measure mt-6 text-body-lg font-semibold text-white">
                      That's the plan if the project goes ahead. It isn't an offer: profits aren't guaranteed and you could lose money.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <ol className="mt-10 hidden gap-3 sm:flex" aria-label="Sequence">
            {BEAT_COPY.map((b, i) => (
              <li key={b.label} className="flex min-w-0 flex-1 flex-col gap-2" aria-current={beat === i ? "step" : undefined}>
                <span className={`h-0.5 transition-colors duration-300 ${i <= beat ? "bg-white" : "bg-white/25"}`} />
                <span className={`truncate font-mono text-sm ${beat === i ? "text-white" : "text-white/55"}`}>{b.label}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
