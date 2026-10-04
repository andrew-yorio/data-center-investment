import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { useLayoutEffect, useMemo, useState } from "react";
import { Color, FogExp2, MathUtils, PerspectiveCamera as PCam, Vector3 } from "three";
import { introScroll } from "../lib/scroll";
import { BEATS, beatAt } from "../lib/motion";
import { cameraUp, ramp, sampleCamera } from "./path";
import { quality } from "./quality";
import { makeEnvironments } from "./env";
import { Exterior } from "./Exterior";
import { Hall } from "./Hall";
import { Post } from "./Post";
import { ValueParticles } from "./ValueParticles";

const NIGHT = new Color("#07142b");
const HAZE_OUT = new Color("#0c1a33");
const HAZE_IN = new Color("#0a0f18");

/** Shared, smoothed progress so every part of the scene agrees on the same frame. */
const frame = { p: 0 };

/**
 * Stepped scrubbing: each beat has a hero stop on the camera path. Scrolling
 * within a beat only drifts the camera a little; crossing into the next beat
 * plays an eased move to that beat's stop (the fly-in through the doors, the
 * tilt down onto the board, the dive into the die). Scrolling back reverses it.
 */
const STOPS = [0.02, 0.3, 0.52, 0.79, 1.0];
const anim = { from: 0, to: -1, t0: 0, dur: 1 };
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
let drift = 0;
/** Camera-target distance this frame, for depth of field. */
const camState = { dist: 100 };
const focus = new Vector3();

function CameraRig({ onBeat }: { onBeat: (macro: boolean) => void }) {
  const camera = useThree((s) => s.camera) as PCam;
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const pos = useMemo(() => new Vector3(), []);
  const target = useMemo(() => new Vector3(), []);
  const up = useMemo(() => new Vector3(), []);
  const frameOffset = useMemo(() => new Vector3(), []);
  const haze = useMemo(() => new Color(), []);
  const env = useMemo(() => makeEnvironments(gl), [gl]);
  const macroRef = useMemo(() => ({ v: false }), []);

  useLayoutEffect(() => {
    scene.fog = new FogExp2(HAZE_OUT, 0.003);
    scene.background = NIGHT;
    scene.environment = env.exterior;
    scene.environmentIntensity = 0.6;
    return () => env.dispose();
  }, [scene, env]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const scroll = introScroll.progress;
    const beat = beatAt(scroll);
    const goal = STOPS[beat];
    if (goal !== anim.to) {
      // Retarget from wherever the camera is now, so fast scrolling stays smooth.
      anim.from = anim.to < 0 ? goal : frame.p - drift;
      anim.to = goal;
      anim.t0 = t;
      anim.dur = 0.9 + Math.abs(goal - anim.from) * 4;
    }
    const base = anim.from + (anim.to - anim.from) * easeInOut(MathUtils.clamp((t - anim.t0) / anim.dur, 0, 1));
    // Gentle parallax within the beat, so the scene answers the scroll while it holds.
    const lo = BEATS[beat];
    const hi = BEATS[beat + 1] ?? 1;
    const want = (scroll - (lo + hi) / 2) * 0.1;
    // dt is capped high enough that very slow renderers (software GPUs) still converge within a few frames.
    drift = MathUtils.damp(drift, want, 5, Math.min(dt, 0.5));
    frame.p = MathUtils.clamp(base + drift, 0, 1);
    const p = frame.p;
    const dist = sampleCamera(p, pos, target);
    camState.dist = dist;
    focus.copy(target);
    // A slow idle drift on the opening shot so the page feels alive before anyone scrolls.
    const idle = 1 - ramp(p, 0, 0.08);
    pos.x += Math.sin(state.clock.elapsedTime * 0.12) * 4 * idle;
    pos.y += Math.sin(state.clock.elapsedTime * 0.09) * 0.8 * idle;
    // Opening shot: keep the building clear of the headline (right on wide screens, above it on tall ones).
    const compose = 1 - ramp(p, 0.02, 0.13);
    if (size.width >= size.height) frameOffset.set(-17, 0.5, 6);
    else frameOffset.set(0, -9, 0);
    target.addScaledVector(frameOffset, compose);
    camera.position.copy(pos);
    camera.up.copy(cameraUp(p, up));
    camera.lookAt(target);
    // Scale-aware clipping planes: one scene spans ~100 m down to a ~1 cm die.
    camera.near = Math.max(dist * 0.02, 0.00005);
    camera.far = MathUtils.clamp(dist * 400, 4, 6000);
    camera.updateProjectionMatrix();

    // Haze: thin outside, a touch of cool haze in the hall, none at macro scale.
    const inside = ramp(p, 0.18, 0.24);
    const fog = scene.fog as FogExp2;
    fog.color.copy(haze.copy(HAZE_OUT).lerp(HAZE_IN, inside));
    fog.density = MathUtils.lerp(0.0028, MathUtils.clamp(0.09 / dist, 0.004, 0.05) * (1 - ramp(p, 0.5, 0.62)), inside);

    // Image-based lighting swaps from the night sky to the hall's strip lights as the camera goes in.
    const wantHall = p > 0.21;
    if ((scene.environment === env.hall) !== wantHall) scene.environment = wantHall ? env.hall : env.exterior;
    scene.environmentIntensity = wantHall ? 0.9 : 0.6;

    const macro = p > 0.58 && p < 0.86;
    if (macro !== macroRef.v) {
      macroRef.v = macro;
      onBeat(macro);
    }
  });
  return null;
}

/** `?force3d` is the testing switch for software renderers; it also pins the full tier so shots are comparable. */
const forced = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("force3d");

export default function Scene({ mobile, active }: { mobile: boolean; active: boolean }) {
  const [degraded, setDegraded] = useState(false);
  const [dprFactor, setDprFactor] = useState(1);
  const [macro, setMacro] = useState(false);
  const q = useMemo(() => quality(mobile, degraded), [mobile, degraded]);
  const dpr = Math.round(MathUtils.lerp(1, q.maxDpr, dprFactor) * 4) / 4;

  return (
    <Canvas
      aria-hidden="true"
      className="!absolute inset-0"
      frameloop={active ? "always" : "never"}
      dpr={dpr}
      shadows={q.shadows ? "percentage" : false}
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false, toneMappingExposure: 1.0 }}
      camera={{ fov: mobile ? 55 : 42, position: [36, 11, 54], near: 0.1, far: 2000 }}
    >
      <PerformanceMonitor
        ms={250}
        iterations={6}
        bounds={(refresh) => [Math.min(45, refresh * 0.75), refresh * 0.95]}
        flipflops={3}
        onChange={({ factor }) => setDprFactor(factor)}
        onDecline={() => !forced && setDegraded(true)}
        onFallback={() => !forced && setDegraded(true)}
      />
      <CameraRig onBeat={setMacro} />
      <Exterior q={q} reflections={q.reflections} progress={frame} />
      <Hall q={q} reflections={q.reflections} progress={frame} />
      <ValueParticles progress={frame} count={q.particles} mobile={mobile} />
      <Post q={q} macro={macro} focus={focus} state={camState} />
    </Canvas>
  );
}
