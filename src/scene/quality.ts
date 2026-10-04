/**
 * Rendering tiers. `mobile` comes from the Intro's media query; `degraded` is
 * flipped by drei's PerformanceMonitor when frame rate drops, so the scene
 * sheds its most expensive features (reflections, depth of field, shadows)
 * before it drops resolution further.
 */
export interface Quality {
  mobile: boolean;
  /** Planar reflections on the wet asphalt and the hall floor (one extra scene render). */
  reflections: boolean;
  /** Moonlight shadow map for the exterior. */
  shadows: boolean;
  /** Depth of field during the macro beat. */
  dof: boolean;
  /** SMAA (desktop) vs none; mobile relies on MSAA in the composer target. */
  smaa: boolean;
  /** Maximum device pixel ratio. */
  maxDpr: number;
  /** Status LEDs per rack. */
  ledsPerRack: number;
  /** Side length of the die texture. */
  dieRes: number;
  /** Point lights in the hall aisle. */
  aisleLights: number;
  /** Lit light poles outside. */
  poleLights: number;
  /** Dust motes in the rack beat. */
  motes: number;
  /** Beat 5 particle count. */
  particles: number;
}

export function quality(mobile: boolean, degraded: boolean): Quality {
  if (mobile) {
    return {
      mobile,
      reflections: false,
      shadows: false,
      dof: false,
      smaa: false,
      maxDpr: degraded ? 1 : 1.5,
      ledsPerRack: 10,
      dieRes: 1024,
      aisleLights: 3,
      poleLights: 4,
      motes: 150,
      particles: 1800,
    };
  }
  return {
    mobile,
    reflections: !degraded,
    shadows: !degraded,
    dof: !degraded,
    smaa: true,
    maxDpr: degraded ? 1.25 : 1.75,
    ledsPerRack: 22,
    dieRes: 2048,
    aisleLights: 7,
    poleLights: 10,
    motes: 450,
    particles: 3600,
  };
}
