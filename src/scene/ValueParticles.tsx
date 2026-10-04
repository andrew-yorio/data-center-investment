import { PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, MeshBasicMaterial } from "three";
import { particleMaterial } from "./materials";
import { ramp } from "./path";

const SEGMENTS = 8;
const SHARE = 5;

/**
 * Target points in a normalized frame: the building spans x ∈ [-0.5, 0.5],
 * its walls y ∈ [0, 0.24], rooftop units above. One segment is "your share".
 */
function buildTargets(total: number) {
  let seed = 23;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
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
  edge(-0.5, 0, 0.5, 0, budget(0.12));
  edge(-0.5, H, 0.5, H, budget(0.12));
  edge(-0.5, 0, -0.5, H, budget(0.035));
  edge(0.5, 0, 0.5, H, budget(0.035));
  // Rooftop units
  for (let u = 0; u < 6; u++) {
    const x0 = -0.42 + u * 0.15;
    const w = 0.08;
    edge(x0, H, x0, H + 0.045, budget(0.008));
    edge(x0 + w, H, x0 + w, H + 0.045, budget(0.008));
    edge(x0, H + 0.045, x0 + w, H + 0.045, budget(0.014));
  }
  // Segment dividers
  for (let s = 1; s < SEGMENTS; s++) edge(-0.5 + s / SEGMENTS, 0, -0.5 + s / SEGMENTS, H, budget(0.02));
  // Ground line, wider than the building
  edge(-0.62, -0.004, 0.62, -0.004, budget(0.06));
  // Your share: a filled segment
  const sx0 = -0.5 + SHARE / SEGMENTS;
  const remaining = total - share.length;
  for (let i = 0; i < remaining; i++) push(sx0 + 0.006 + rnd() * (1 / SEGMENTS - 0.012), 0.006 + rnd() * (H - 0.012), 1);
  return { pts: new Float32Array(pts), share: new Float32Array(share) };
}

export function ValueParticles({ progress, mobile }: { progress: { p: number }; mobile: boolean }) {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const mat = useMemo(() => particleMaterial(), []);
  const fadeMat = useMemo(() => new MeshBasicMaterial({ color: "#07142b", transparent: true, opacity: 0, depthTest: false, depthWrite: false }), []);
  const geom = useMemo(() => {
    const count = mobile ? 1800 : 3600;
    const { pts, share } = buildTargets(count);
    const n = share.length;
    const start = new Float32Array(n * 3);
    const delay = new Float32Array(n);
    const seed = new Float32Array(n);
    let s = 41;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
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
  }, [mobile]);
  const points = useRef(null);

  // Fit the silhouette to the viewport, leaving room for the headline below it.
  useLayoutEffect(() => {
    const halfH = Math.tan((45 / 2) * (Math.PI / 180)) * 10;
    const halfW = halfH * (size.width / size.height);
    const width = Math.min(8.5, halfW * 2 * 0.84);
    mat.uniforms.uScale.value = width;
    mat.uniforms.uOffset.value = [0, size.width < 768 ? halfH * 0.32 : halfH * 0.12];
    mat.uniforms.uSize.value = (mobile ? 2.4 : 2.8) * dpr;
  }, [size, dpr, mat, mobile]);

  useFrame((state) => {
    const p = progress.p;
    fadeMat.opacity = ramp(p, 0.8, 0.875);
    mat.uniforms.uAlpha.value = ramp(p, 0.81, 0.85);
    mat.uniforms.uProg.value = ramp(p, 0.82, 0.985);
    mat.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 10]} fov={45} near={0.1} far={100} />
      <mesh material={fadeMat} renderOrder={1}>
        <planeGeometry args={[100, 100]} />
      </mesh>
      <points ref={points} geometry={geom} material={mat} renderOrder={2} frustumCulled={false} />
    </>
  );
}
