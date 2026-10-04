import { MathUtils, Vector3 } from "three";

/** Racks run in rows along z; the camera walks the center aisle at x = 0. */
export const RACK = { width: 0.6, height: 2.2, depth: 1.1, pitch: 0.65, zStart: -16, zEnd: 14 } as const;
export const ROW_X = 1.6; // first row centers at ±1.6, so rack fronts face the aisle at x = ±1.05
export const TARGET_Z = RACK.zStart + RACK.pitch * 15; // the rack the camera zooms into
export const RACK_FRONT_X = -ROW_X + RACK.depth / 2; // -1.05
export const BOARD_X = RACK_FRONT_X + 0.004;
export const CHIP_Y = 1.25;
export const DIE_SIZE = 0.034;
export const DIE_X = BOARD_X + 0.0055;

export const BUILDING = { w: 60, h: 14, d: 36 } as const;

interface Key {
  p: number;
  pos: [number, number, number];
  target: [number, number, number];
}

/**
 * Camera keyframes over intro progress. Between keys, the look-at target moves
 * linearly and the camera's distance from it interpolates in log space, so
 * each power-of-ten step takes the same scroll distance.
 */
const KEYS: Key[] = [
  { p: 0.0, pos: [62, 24, 96], target: [0, 6, 0] },
  { p: 0.13, pos: [20, 8, 56], target: [0, 5, 16] },
  { p: 0.23, pos: [0, 3.2, 21], target: [0, 2.8, 8] },
  { p: 0.36, pos: [0, 1.7, 4], target: [0, 1.5, -12] },
  { p: 0.46, pos: [0.35, 1.45, TARGET_Z + 2.6], target: [RACK_FRONT_X, CHIP_Y, TARGET_Z] },
  { p: 0.56, pos: [RACK_FRONT_X + 0.75, CHIP_Y, TARGET_Z + 0.05], target: [RACK_FRONT_X, CHIP_Y, TARGET_Z] },
  { p: 0.64, pos: [BOARD_X + 0.16, CHIP_Y, TARGET_Z], target: [DIE_X, CHIP_Y, TARGET_Z] },
  { p: 0.76, pos: [DIE_X + 0.045, CHIP_Y, TARGET_Z], target: [DIE_X, CHIP_Y, TARGET_Z] },
  { p: 0.84, pos: [DIE_X + 0.012, CHIP_Y + 0.001, TARGET_Z - 0.002], target: [DIE_X, CHIP_Y, TARGET_Z] },
  { p: 1.0, pos: [DIE_X + 0.008, CHIP_Y + 0.001, TARGET_Z - 0.002], target: [DIE_X, CHIP_Y, TARGET_Z] },
];

const _a = new Vector3();
const _b = new Vector3();
const _ta = new Vector3();
const _tb = new Vector3();

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Writes the camera position and look-at target for progress `p`. Returns the camera-target distance. */
export function sampleCamera(p: number, outPos: Vector3, outTarget: Vector3): number {
  const x = MathUtils.clamp(p, 0, 1);
  let i = 0;
  while (i < KEYS.length - 2 && x > KEYS[i + 1].p) i++;
  const k0 = KEYS[i];
  const k1 = KEYS[i + 1];
  const t = easeInOut(MathUtils.clamp((x - k0.p) / (k1.p - k0.p), 0, 1));

  _ta.fromArray(k0.target);
  _tb.fromArray(k1.target);
  outTarget.lerpVectors(_ta, _tb, t);

  _a.fromArray(k0.pos).sub(_ta);
  _b.fromArray(k1.pos).sub(_tb);
  const d0 = _a.length();
  const d1 = _b.length();
  const dist = Math.exp(MathUtils.lerp(Math.log(d0), Math.log(d1), t));
  _a.normalize().lerp(_b.normalize(), t).normalize();
  outPos.copy(outTarget).addScaledVector(_a, dist);
  return dist;
}

/** Smooth 0→1 ramp of `p` between `a` and `b`. */
export const ramp = (p: number, a: number, b: number) => MathUtils.smoothstep(p, a, b);
