import { Bloom, DepthOfField, EffectComposer, Noise, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { useFrame } from "@react-three/fiber";
import { BlendFunction, type DepthOfFieldEffect, ToneMappingMode } from "postprocessing";
import { useRef } from "react";
import { HalfFloatType, type Vector3 } from "three";
import type { Quality } from "./quality";

/**
 * Post stack. The scene renders in HDR (half float); only values above 1.0
 * bloom, which keeps bloom to LEDs, luminaires, lit windows, traces and
 * specular highlights. AgX tone mapping gives the filmic highlight roll-off.
 * Depth of field is mounted only during the macro beat, on desktop.
 */
export function Post({ q, macro, focus, state }: { q: Quality; macro: boolean; focus: Vector3; state: { dist: number } }) {
  const dof = useRef<DepthOfFieldEffect>(null);
  useFrame(() => {
    const e = dof.current;
    if (!e) return;
    // Keep the die sharp and let the board fall off; range scales with the macro distance.
    e.cocMaterial.focusRange = Math.max(0.004, state.dist * 0.6);
    e.bokehScale = 2.6;
  });
  return (
    <EffectComposer multisampling={q.mobile ? 4 : 0} frameBufferType={HalfFloatType} enableNormalPass={false}>
      <Bloom mipmapBlur intensity={q.mobile ? 0.7 : 0.85} luminanceThreshold={1} luminanceSmoothing={0.25} levels={q.mobile ? 5 : 7} resolutionScale={q.mobile ? 0.5 : 1} />
      {q.dof && macro ? <DepthOfField ref={dof} target={focus} focusRange={0.01} bokehScale={2.6} resolutionScale={0.5} /> : <></>}
      <ToneMapping mode={ToneMappingMode.AGX} />
      <Vignette offset={0.32} darkness={0.55} eskil={false} />
      {q.mobile ? <></> : <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.35} />}
      {q.smaa ? <SMAA /> : <></>}
    </EffectComposer>
  );
}
