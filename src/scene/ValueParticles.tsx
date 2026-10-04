import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry } from "three";
import { fadeMaterial, particleMaterial } from "./materials";
import { ramp } from "./path";
import { rng } from "./textures";

const SEGMENTS = 8;
const SHARE = 5;

/**
 * Target points in a normalized frame: the building spans x ∈ [-0.5, 0.5],
 * its walls y ∈ [0, 0.24], rooftop units above, the glass annex at the right.
 * One segment is "your share". Matches the static Silhouette.
 */
function buildTargets(total: number) {
  const rnd = rng(23);
  const pts: number[] = [];
  const share: number[] = [];
  const H = 0.24;
  const push = (x: number, y: number, s = 0) => {
    pts.push(x + (rnd() - 0.5) * 0.002, y + (rnd() - 0.5) * 0.002, 0);
    share.push(s);
  };
  const edge = (x0: number, y0: number, x1: number, y1: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const t = rnd();
      push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
  };
  const budget = (f: number) => Math.round(total * f);
  // Main block outline
  edge(-0.5, 0, 0.5, 0, budget(0.11));
  edge(-0.5, H, 0.5, H, budget(0.11));
  edge(-0.5, 0, -0.5, H, budget(0.03));
  edge(0.5, 0, 0.5, H, budget(0.03));
  // Rooftop units
  for (let u = 0; u < 6; u++) {
    const x0 = -0.42 + u * 0.15;
    const w = 0.08;
    edge(x0, H, x0, H + 0.045, budget(0.007));
    edge(x0 + w, H, x0 + w, H + 0.045, budget(0.007));
    edge(x0, H + 0.045, x0 + w, H + 0.045, budget(0.012));
  }
  // Glass annex at the right, in front of the block
  edge(0.26, 0, 0.26, 0.13, budget(0.012));
  edge(0.26, 0.13, 0.52, 0.13, budget(0.02));
  edge(0.52, 0, 0.52, 0.13, budget(0.012));
  // Segment dividers
  for (let s = 1; s < SEGMENTS; s++) edge(-0.5 + s / SEGMENTS, 0, -0.5 + s / SEGMENTS, H, budget(0.018));
  // Ground line, wider than the building
  edge(-0.62, -0.004, 0.62, -0.004, budget(0.06));
  // Your share: a filled segment
  const sx0 = -0.5 + SHARE / SEGMENTS;
  const remaining = total - share.length;
  for (let i = 0; i < remaining; i++) push(sx0 + 0.006 + rnd() * (1 / SEGMENTS - 0.012), 0.006 + rnd() * (H - 0.012), 1);
  return { pts: new Float32Array(pts), share: new Float32Array(share) };
}

/** Beat 5 overlay, drawn in clip space on top of the 3D scene. */
export function ValueParticles({ progress, count, mobile }: { progress: { p: number }; count: number; mobile: boolean }) {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const mat = useMemo(() => particleMaterial(), []);
  const fade = useMemo(() => fadeMaterial(), []);
  const geom = useMemo(() => {
    const { pts, share } = buildTargets(count);
    const n = share.length;
    const start = new Float32Array(n * 3);
    const delay = new Float32Array(n);
    const seed = new Float32Array(n);
    const rnd = rng(41);
    for (let i = 0; i < n; i++) {
      // Start as a tight bloom of light where the chip was, at screen center.
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 0.05;
      start[i * 3] = Math.cos(a) * r;
      start[i * 3 + 1] = 0.1 + Math.sin(a) * r;
      // Points nearer the center leave first, so light visibly flows outward.
      delay[i] = Math.min(1, Math.hypot(pts[i * 3], pts[i * 3 + 1] - 0.12) * 1.3 + rnd() * 0.15);
      seed[i] = rnd();
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pts, 3));
    g.setAttribute("aStart", new BufferAttribute(start, 3));
    g.setAttribute("aShare", new BufferAttribute(share, 1));
    g.setAttribute("aDelay", new BufferAttribute(delay, 1));
    g.setAttribute("aSeed", new BufferAttribute(seed, 1));
    return g;
  }, [count]);

  // Fit the silhouette to the viewport, leaving room for the headline below it.
  useLayoutEffect(() => {
    const aspect = size.width / size.height;
    // Width in NDC units (2 = full width): 84% of the viewport, capped so it never gets huge on wide screens.
    const widthNdc = Math.min(2 * 0.84, 1.95 / aspect);
    mat.uniforms.uScale.value = widthNdc * aspect;
    mat.uniforms.uAspect.value = aspect;
    mat.uniforms.uOffset.value = [0, size.width < 768 ? 0.32 : 0.12];
    mat.uniforms.uSize.value = (mobile ? 2.4 : 2.8) * dpr;
  }, [size, dpr, mat, mobile]);

  useFrame((state) => {
    const p = progress.p;
    fade.uniforms.uOpacity.value = ramp(p, 0.8, 0.875);
    mat.uniforms.uAlpha.value = ramp(p, 0.81, 0.85);
    mat.uniforms.uProg.value = ramp(p, 0.82, 0.985);
    mat.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <>
      <mesh material={fade} renderOrder={10} frustumCulled={false}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <points geometry={geom} material={mat} renderOrder={11} frustumCulled={false} />
    </>
  );
}
