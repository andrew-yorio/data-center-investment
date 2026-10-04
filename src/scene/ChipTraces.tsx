import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color } from "three";
import type { Line2 } from "three-stdlib";
import { DIE_SIZE, ramp } from "./path";

type V3 = [number, number, number];

const BASE = new Color("#5aa8ff").multiplyScalar(1.6); // HDR: the lit traces bloom softly
const PULSE = new Color("#eaf4ff").multiplyScalar(3.5);

/** Manhattan-routed interconnect from the die's core to its I/O ring, seeded so every visit looks the same. */
function makeTraces(count: number, z: number): V3[][] {
  let seed = 19;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const half = DIE_SIZE / 2;
  const traces: V3[][] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rnd() * 0.25;
    let x = Math.cos(angle) * 0.1;
    let y = Math.sin(angle) * 0.1;
    const pts: V3[] = [[x * DIE_SIZE, y * DIE_SIZE, z]];
    let horizontal = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle));
    for (let s = 0; s < 9 && Math.abs(x) < 0.45 && Math.abs(y) < 0.45; s++) {
      const step = 0.05 + rnd() * 0.13;
      if (horizontal) x += Math.sign(Math.cos(angle)) * step;
      else y += Math.sign(Math.sin(angle)) * step;
      x = Math.max(-0.45, Math.min(0.45, x));
      y = Math.max(-0.45, Math.min(0.45, y));
      pts.push([x * DIE_SIZE, y * DIE_SIZE, z]);
      horizontal = !horizontal;
    }
    if (pts.length > 1) traces.push(pts.map(([px, py, pz]) => [Math.max(-half, Math.min(half, px)), Math.max(-half, Math.min(half, py)), pz]));
  }
  return traces;
}

/** Beat 4: traces light up in sequence, then data pulses along them as dashes. Lives in the die's local XY plane. */
export function ChipTraces({ progress, z }: { progress: { p: number }; z: number }) {
  const traces = useMemo(() => makeTraces(44, z), [z]);
  const base = useRef<(Line2 | null)[]>([]);
  const pulse = useRef<(Line2 | null)[]>([]);

  useFrame((_, dt) => {
    const p = progress.p;
    const visible = p > 0.5;
    traces.forEach((_, i) => {
      const b = base.current[i];
      const u = pulse.current[i];
      if (!b || !u) return;
      b.visible = u.visible = visible;
      if (!visible) return;
      const start = 0.62 + (i / traces.length) * 0.13;
      const on = ramp(p, start, start + 0.03);
      b.material.opacity = 0.05 + on * 0.8;
      u.material.opacity = on;
      u.material.dashOffset -= dt * 0.03;
    });
  });

  return (
    <group>
      {traces.map((pts, i) => (
        <group key={i}>
          <Line ref={(el) => { base.current[i] = el as Line2 | null; }} points={pts} color={BASE} lineWidth={1.1} transparent opacity={0.05} depthWrite={false} />
          <Line
            ref={(el) => { pulse.current[i] = el as Line2 | null; }}
            points={pts.map(([x, y, zz]) => [x, y, zz + 0.00002] as V3)}
            color={PULSE}
            lineWidth={2}
            dashed
            dashSize={0.0014}
            gapSize={0.008}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </group>
      ))}
    </group>
  );
}
