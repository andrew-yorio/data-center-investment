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

/**
 * True when a hardware-accelerated WebGL context is available. Software
 * renderers (SwiftShader, llvmpipe) draw the scene on the CPU and make the page
 * janky, so those visitors get the static fallback. `?force3d` overrides this
 * for testing.
 */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return false;
    if (new URLSearchParams(window.location.search).has("force3d")) return true;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
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
