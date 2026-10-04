import { MathUtils, Vector3 } from "three";

/**
 * A modular campus: prefabricated data-hall modules stand side by side along
 * x, each 18 m long (z), joined at their far end by an enclosed spine
 * corridor. The camera enters the module at x = 0 through its end door and
 * walks its single cold aisle at x = 0.
 */
export const MODULE = { w: 5.0, h: 4.2, len: 18, pitch: 7.2, count: 7, ceiling: 3.2, base: 0.35 } as const;
/** Modules stand on a steel plinth; everything inside the module is in floor-relative coordinates. */
export const FLOOR_Y = MODULE.base;
export const SPINE = { w: 3.2, h: 4.2, z: -MODULE.len / 2 - 1.6 } as const;
export const RACK = { width: 0.6, height: 2.2, depth: 1.1, pitch: 0.6, zStart: -8.1, zEnd: 7.5 } as const;
export const ROW_X = 1.6; // rows at ±1.6, so rack fronts face the aisle at x = ±1.05
export const TARGET_Z = RACK.zStart + RACK.pitch * 4; // the rack the camera zooms into
export const RACK_FRONT_X = -ROW_X + RACK.depth / 2; // -1.05
/** The module's end door the camera comes through, and the far door into the spine. */
export const DOOR = { w: 1.9, h: 2.4 } as const;

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
/** The die in world space (module floor height added), for the camera and depth of field. */
export const DIE_WORLD: [number, number, number] = [BOARD_CX, DIE_Y + FLOOR_Y, CPU_Z];

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
const F = FLOOR_Y;
const KEYS: Key[] = [
  { p: 0.0, pos: [52, 17, 78], target: [0, 3, 0] },
  { p: 0.12, pos: [12, 5, 40], target: [0, 2.5, 9] },
  { p: 0.2, pos: [0, 1.75 + F, MODULE.len / 2 + 1.6], target: [0, 1.6 + F, -6] },
  { p: 0.3, pos: [0, 1.7 + F, 3.5], target: [0, 1.5 + F, -9] },
  { p: 0.42, pos: [0.35, 1.7 + F, TARGET_Z + 3.0], target: [RACK_FRONT_X, 1.3 + F, TARGET_Z] },
  { p: 0.52, pos: [RACK_FRONT_X + 1.0, BOARD_Y + 0.55 + F, TARGET_Z + 0.55], target: [BOARD_CX, BOARD_Y + 0.02 + F, TARGET_Z - 0.03] },
  { p: 0.62, pos: [BOARD_CX + 0.1, DIE_Y + 0.21 + F, CPU_Z + 0.07], target: DIE_WORLD },
  { p: 0.74, pos: [BOARD_CX + 0.012, DIE_Y + 0.055 + F, CPU_Z + 0.008], target: DIE_WORLD },
  { p: 0.84, pos: [BOARD_CX + 0.003, DIE_Y + 0.016 + F, CPU_Z + 0.002], target: DIE_WORLD },
  { p: 1.0, pos: [BOARD_CX + 0.0015, DIE_Y + 0.0105 + F, CPU_Z + 0.001], target: DIE_WORLD },
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
