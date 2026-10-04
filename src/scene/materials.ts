import { NormalBlending, ShaderMaterial, UniformsLib, UniformsUtils } from "three";

export type LedMaterial = ShaderMaterial & { uniforms: { uTime: { value: number } } };

/** Rack status LEDs: per-instance tint and blink phase, fog-aware. */
export function ledMaterial(): LedMaterial {
  return new ShaderMaterial({
    fog: true,
    toneMapped: false,
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute float aPhase;
      attribute vec3 aTint;
      varying vec3 vTint;
      varying float vOn;
      uniform float uTime;
      void main() {
        vTint = aTint;
        // Most LEDs flicker with activity; a few hold steady.
        float rate = 0.6 + aPhase * 4.0;
        float flicker = step(0.35, fract(uTime * rate + aPhase * 17.0));
        vOn = aPhase > 0.8 ? 1.0 : mix(0.18, 1.0, flicker);
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      varying vec3 vTint;
      varying float vOn;
      void main() {
        gl_FragColor = vec4(vTint * vOn * 1.4, 1.0);
        #include <fog_fragment>
      }
    `,
  }) as LedMaterial;
}

export type ParticleMaterial = ShaderMaterial & {
  uniforms: {
    uProg: { value: number };
    uTime: { value: number };
    uAlpha: { value: number };
    uSize: { value: number };
    uScale: { value: number };
    uOffset: { value: [number, number] };
  };
};

/**
 * Beat 5: light flows out from the chip and settles into the building's
 * silhouette. The share segment turns amber only once it has assembled.
 */
export function particleMaterial(): ParticleMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: NormalBlending,
    uniforms: {
      uProg: { value: 0 },
      uTime: { value: 0 },
      uAlpha: { value: 0 },
      uSize: { value: 3 },
      uScale: { value: 7 },
      uOffset: { value: [0, 0] },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aStart;
      attribute float aDelay;
      attribute float aShare;
      attribute float aSeed;
      uniform float uProg;
      uniform float uTime;
      uniform float uSize;
      uniform float uScale;
      uniform vec2 uOffset;
      varying float vShare;
      varying float vSettled;
      float ease(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }
      void main() {
        float t = ease(clamp((uProg - aDelay * 0.45) / 0.55, 0.0, 1.0));
        vec2 start = aStart.xy;
        vec2 target = position.xy;
        vec2 p = mix(start, target, t);
        // Swirl while in flight, still once settled.
        float flight = t * (1.0 - t) * 4.0;
        p += flight * 0.12 * vec2(sin(aSeed * 40.0 + uTime * 1.3), cos(aSeed * 31.0 + uTime * 1.1));
        // Settled points breathe very slightly.
        p += (1.0 - flight) * 0.0025 * vec2(sin(uTime * 2.0 + aSeed * 90.0), cos(uTime * 1.7 + aSeed * 70.0));
        vec3 world = vec3(p * uScale + uOffset, 0.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
        vShare = aShare;
        vSettled = smoothstep(0.85, 1.0, t);
        gl_PointSize = uSize * (aShare > 0.5 ? 1.25 : 1.0) * (0.7 + 0.6 * flight + 0.3 * vSettled);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uAlpha;
      uniform float uProg;
      varying float vShare;
      varying float vSettled;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        vec3 blue = vec3(0.353, 0.659, 1.0);
        vec3 white = vec3(0.86, 0.93, 1.0);
        vec3 amber = vec3(1.0, 0.71, 0.28);
        vec3 c = mix(blue, white, 0.35 * (1.0 - vSettled));
        float glow = vShare * vSettled * smoothstep(0.75, 0.95, uProg);
        c = mix(c, amber, glow);
        gl_FragColor = vec4(c * (1.0 + glow * 0.4), a * uAlpha * (0.55 + 0.45 * vSettled + glow * 0.3));
      }
    `,
  }) as ParticleMaterial;
}
