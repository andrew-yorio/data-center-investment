import { AdditiveBlending, BackSide, Color, type MeshPhysicalMaterial, type MeshStandardMaterial, NormalBlending, ShaderMaterial, type Texture, UniformsLib, UniformsUtils, type WebGLProgramParametersWithUniforms } from "three";

export type LedMaterial = ShaderMaterial & { uniforms: { uTime: { value: number } } };

/**
 * Rack status LEDs: per-instance tint and blink phase, fog-aware. Output is
 * HDR (well above 1.0) so the bloom pass picks the diodes up as the only
 * bright points in a dark hall.
 */
export function ledMaterial(): LedMaterial {
  return new ShaderMaterial({
    fog: true,
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute float aPhase;
      attribute vec3 aTint;
      varying vec3 vTint;
      varying float vOn;
      varying vec2 vUv;
      uniform float uTime;
      void main() {
        vTint = aTint;
        vUv = uv;
        // Activity LEDs flicker; power LEDs hold steady; a few are dark (failed or unused).
        float rate = 2.0 + aPhase * 9.0;
        float flicker = step(0.45, fract(uTime * rate + aPhase * 17.0));
        float activity = mix(0.1, 1.0, flicker);
        vOn = aPhase > 0.75 ? 1.0 : (aPhase < 0.06 ? 0.0 : activity);
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      varying vec3 vTint;
      varying float vOn;
      varying vec2 vUv;
      void main() {
        // Round diode with a bright core and a dim bezel.
        float d = length(vUv - 0.5) * 2.0;
        float core = smoothstep(1.0, 0.55, d);
        if (d > 1.0) discard;
        vec3 c = vTint * (0.05 + vOn * (1.2 + 4.0 * core));
        gl_FragColor = vec4(c, 1.0);
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
    uAspect: { value: number };
  };
};

/**
 * Beat 5: light flows out from the chip and settles into the building's
 * silhouette. Positions are emitted straight in clip space, so the overlay is
 * independent of the scene camera (which is at macro scale by then) and works
 * under the post-processing composer.
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
      uScale: { value: 1.6 },
      uOffset: { value: [0, 0] },
      uAspect: { value: 1.6 },
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
      uniform float uAspect;
      varying float vShare;
      varying float vSettled;
      float ease(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }
      void main() {
        float t = ease(clamp((uProg - aDelay * 0.45) / 0.55, 0.0, 1.0));
        vec2 start = aStart.xy;
        vec2 target = position.xy;
        vec2 p = mix(start, target, t);
        float flight = t * (1.0 - t) * 4.0;
        p += flight * 0.12 * vec2(sin(aSeed * 40.0 + uTime * 1.3), cos(aSeed * 31.0 + uTime * 1.1));
        p += (1.0 - flight) * 0.0025 * vec2(sin(uTime * 2.0 + aSeed * 90.0), cos(uTime * 1.7 + aSeed * 70.0));
        vec2 ndc = (p * uScale + uOffset) * vec2(1.0 / uAspect, 1.0);
        gl_Position = vec4(ndc, 0.0, 1.0);
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
        // HDR so the settled share blooms.
        gl_FragColor = vec4(c * (1.3 + glow * 1.8), a * uAlpha * (0.55 + 0.45 * vSettled + glow * 0.3));
      }
    `,
  }) as ParticleMaterial;
}

/** Full-screen quad in clip space that fades the 3D scene to the page's night colour under the particles. */
export function fadeMaterial(): ShaderMaterial & { uniforms: { uOpacity: { value: number } } } {
  return new ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { uOpacity: { value: 0 }, uColor: { value: new Color("#07142b") } },
    vertexShader: /* glsl */ `
      void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, uOpacity); }
    `,
  }) as ShaderMaterial & { uniforms: { uOpacity: { value: number } } };
}

/**
 * Night sky dome: a zenith-to-horizon gradient with a band of sodium-free
 * light pollution low on the horizon, and a faint cloud veil.
 */
export function skyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new Color("#02040a") },
      uHorizon: { value: new Color("#141f38") },
      uGlow: { value: new Color("#28395f") },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w; // always at the far plane
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uGlow;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(uHorizon, uZenith, pow(h, 0.45));
        // Light pollution from a town off to the left/behind the building.
        float az = atan(d.x, d.z);
        float town = exp(-pow((az + 2.3) / 0.9, 2.0)) * exp(-h * 9.0);
        c += uGlow * town * 0.9;
        // Thin high cloud veil.
        vec2 uv = d.xz / (d.y + 0.25);
        float cl = noise(uv * 2.0) * 0.6 + noise(uv * 5.0) * 0.4;
        c += vec3(0.05, 0.07, 0.11) * smoothstep(0.5, 0.9, cl) * (1.0 - h) * 0.6;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
}

/** Additive, view-faded cone under a pole lamp: cheap "volumetric" haze in the beam. */
export function lightConeMaterial(color = "#dfeaff"): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: 2,
    uniforms: { uColor: { value: new Color(color) }, uIntensity: { value: 0.22 } },
    vertexShader: /* glsl */ `
      varying float vY;
      varying vec3 vNormalV;
      varying vec3 vViewDir;
      void main() {
        vY = uv.y;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vNormalV = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying float vY;
      varying vec3 vNormalV;
      varying vec3 vViewDir;
      void main() {
        // Brightest near the lamp (top), fading toward the ground, soft at the silhouette edges.
        float rim = pow(abs(dot(normalize(vNormalV), normalize(vViewDir))), 1.4);
        float a = pow(vY, 2.2) * rim * uIntensity;
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
  });
}

export interface DieActivation {
  uProg: { value: number };
  uTime: { value: number };
}

/**
 * Patches a standard/physical material so its emissive term is gated by an
 * activation texture: R is each block's turn-on order, G the emissive mask.
 * The die lights up block by block as `uProg` sweeps 0 to 1 in beat 4.
 */
export function withDieActivation(material: MeshStandardMaterial | MeshPhysicalMaterial, activation: Texture): DieActivation {
  const uniforms: DieActivation = { uProg: { value: 0 }, uTime: { value: 0 } };
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uAct = { value: activation };
    shader.uniforms.uProg = uniforms.uProg;
    shader.uniforms.uTime = uniforms.uTime;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D uAct;\nuniform float uProg;\nuniform float uTime;")
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `
        #include <emissivemap_fragment>
        {
          vec4 act = texture2D(uAct, vMapUv);
          float on = smoothstep(act.r - 0.05, act.r + 0.02, uProg);
          float pulse = 0.8 + 0.2 * sin(uTime * 2.4 + act.r * 50.0);
          totalEmissiveRadiance *= act.g * on * pulse;
        }`,
      );
  };
  material.customProgramCacheKey = () => "die-activation";
  return uniforms;
}
