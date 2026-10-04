import { useSyncExternalStore } from "react";

function subscribeQuery(query: string) {
  return (cb: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  };
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribeQuery(query),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const usePrefersReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)");

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Beats in the intro sequence, as [start, end) ranges of introScroll.progress. */
export const BEATS = [0, 0.16, 0.42, 0.62, 0.82] as const;

export function beatAt(progress: number): number {
  let i = 0;
  for (let b = 0; b < BEATS.length; b++) if (progress >= BEATS[b]) i = b;
  return i;
}
