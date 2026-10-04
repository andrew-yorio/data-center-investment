import Lenis from "lenis";

/**
 * Intro scroll progress, 0 at the top of the intro track and 1 when it ends.
 * A plain mutable object rather than React state: the 3D scene reads it every
 * frame inside useFrame, and only the beat index is lifted into React.
 */
export const introScroll = { progress: 0 };

let lenis: Lenis | null = null;

export function startLenis(): () => void {
  lenis = new Lenis({ autoRaf: true, lerp: 0.12, anchors: false });
  return () => {
    lenis?.destroy();
    lenis = null;
  };
}

/** Jump to a section. Uses Lenis when it's running, native scrolling otherwise. */
export function scrollToId(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenis) {
    // Duration-capped so the long intro track doesn't turn into a slow ride.
    lenis.scrollTo(el, { duration: 1.1 });
  } else {
    el.scrollIntoView({ block: "start" });
  }
  // Move focus for keyboard and screen-reader users once the scroll settles.
  const heading = el.querySelector<HTMLElement>("h2, h1");
  window.setTimeout(() => heading?.focus({ preventScroll: true }), lenis ? 1150 : 0);
}
