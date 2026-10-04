import { MathUtils, Vector3 } from "three";

/** Racks run in rows along z; the camera walks the center cold aisle at x = 0. */
export const RACK = { width: 0.6, height: 2.2, depth: 1.1, pitch: 0.6, zStart: -16, zEnd: 14 } as const;
export const ROW_X = 1.6; // first row centers at ±1.6, so rack fronts face the aisle at x = ±1.05
export const ROW_PITCH = 3.4;
export const TARGET_Z = RACK.zStart + RACK.pitch * 15; // the rack the camera zooms into
export const RACK_FRONT_X = -ROW_X + RACK.depth / 2; // -1.05

/**
 * The open rack holds a 2U server pulled out on its rails with the lid off.
 * One CPU has its heat sink removed, exposing the package and the die the
 * camera dives into. The board lies flat, so the final approach looks down.
 */
export const SERVER = { w: 0.445, h: 0.0875, d: 0.75, pullOut: 0.62, y: 1.17 } as const;
export const BOARD_Y = SERVER.y + 0.014;
/** Kept for the camera target height in the hall beats. */
export const CHIP_Y = BOARD_Y;
export const BOARD_CX = RACK_FRONT_X + 0.27; // CPU socket, in the pulled-out section
export const CPU_Z = TARGET_Z - 0.095; // first socket; the second (with heat sink) sits at +0.105
export const CPU2_Z = TARGET_Z + 0.105;
export const DIE_SIZE = 0.034;
export const DIE_Y = BOARD_Y + 0.0066;
export const DIE: [number, number, number] = [BOARD_CX, DIE_Y, CPU_Z];

export const BUILDING = { w: 60, h: 14, d: 36 } as const;
/** Glass office annex at the building's front-right corner. */
export const ANNEX = { w: 18, h: 7.2, d: 10, x: BUILDING.w / 2 - 9, z: BUILDING.d / 2 + 5 } as const;
export const HALL_CEILING = 5.0;

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
  { p: 0.12, pos: [26, 8, 64], target: [0, 5, 18] },
  { p: 0.2, pos: [0, 2.7, 19.5], target: [0, 2.2, -2] },
  { p: 0.3, pos: [0, 1.9, 9], target: [0, 1.6, -14] },
  { p: 0.42, pos: [0.35, 1.7, TARGET_Z + 3.0], target: [RACK_FRONT_X, 1.3, TARGET_Z] },
  { p: 0.52, pos: [RACK_FRONT_X + 1.0, BOARD_Y + 0.55, TARGET_Z + 0.55], target: [BOARD_CX, BOARD_Y + 0.02, TARGET_Z - 0.03] },
  { p: 0.62, pos: [BOARD_CX + 0.1, DIE_Y + 0.21, CPU_Z + 0.07], target: DIE },
  { p: 0.74, pos: [BOARD_CX + 0.012, DIE_Y + 0.055, CPU_Z + 0.008], target: DIE },
  { p: 0.84, pos: [BOARD_CX + 0.003, DIE_Y + 0.016, CPU_Z + 0.002], target: DIE },
  { p: 1.0, pos: [BOARD_CX + 0.0015, DIE_Y + 0.0105, CPU_Z + 0.001], target: DIE },
];

const _a = new Vector3();
const _b = new Vector3();
const _ta = new Vector3();
const _tb = new Vector3();
const UP_Y = new Vector3(0, 1, 0);
const UP_DOWN = new Vector3(0, 0, -1);

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

/** The camera's up vector: world up in the halls, rolling to "far end of the hall is up" as it tilts down onto the board. */
export function cameraUp(p: number, out: Vector3): Vector3 {
  const t = ramp(p, 0.5, 0.64);
  return out.copy(UP_Y).lerp(UP_DOWN, t).normalize();
}

/** Smooth 0→1 ramp of `p` between `a` and `b`. */
export const ramp = (p: number, a: number, b: number) => MathUtils.smoothstep(p, a, b);
