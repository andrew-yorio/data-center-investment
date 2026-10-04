import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, type InstancedMesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, type PointLight } from "three";
import { BOARD_CX, CPU2_Z, CPU_Z, DIE_SIZE, DIE_Y, RACK, RACK_FRONT_X, SERVER, TARGET_Z, ramp } from "./path";
import type { Quality } from "./quality";
import { aluminiumMaps, dieMaps, graphiteMaps, type MapSet, pcbMaps, rng, serverStackMaps, substrateMaps } from "./textures";
import { withDieActivation } from "./materials";
import { ChipTraces } from "./ChipTraces";

const dummy = new Object3D();
const U = 0.04445;
const RACK_BASE = 0.1;
const RACK_BLUE = new Color("#5aa8ff");

function pbr(set: MapSet, extra: Partial<MeshStandardMaterial> = {}): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, roughnessMap: set.ormMap, metalnessMap: set.ormMap, aoMap: set.ormMap, roughness: 1, metalness: 1 });
  Object.assign(m, extra);
  return m;
}

/* Server-local frame: origin at the rack front, server floor level, rack centre. +x toward the aisle. */
const SX = RACK_FRONT_X;
const SZ = TARGET_Z;
const CPU_LX = BOARD_CX - SX; // 0.27
const CPU1_LZ = CPU_Z - SZ;
const CPU2_LZ = CPU2_Z - SZ;
const BOARD_TOP = 0.014;

/** DIMM slots: three banks across the width, 16 of 24 populated. */
const DIMMS: { z: number; populated: boolean }[] = (() => {
  const r = rng(301);
  const out: { z: number; populated: boolean }[] = [];
  for (const z0 of [-0.215, -0.035, 0.145]) for (let i = 0; i < 8; i++) out.push({ z: z0 + i * 0.01, populated: r() > 0.33 });
  return out;
})();

/** The one open rack: posts, the equipment stack, and a 2U server pulled out with its lid off. */
export function Server({ q, progress }: { q: Quality; progress: { p: number } }) {
  const dimms = useRef<InstancedMesh>(null);
  const slots = useRef<InstancedMesh>(null);
  const fins = useRef<InstancedMesh>(null);
  const vrmFins = useRef<InstancedMesh>(null);
  const blades = useRef<InstancedMesh>(null);
  const caps = useRef<InstancedMesh>(null);
  const drives = useRef<InstancedMesh>(null);
  const workLight = useRef<PointLight>(null);
  const dieLight = useRef<PointLight>(null);

  const tex = useMemo(() => {
    const stack = serverStackMaps([24, 26]);
    const pcb = pcbMaps(1024);
    const substrate = substrateMaps(512);
    const die = dieMaps(q.dieRes);
    const alu = aluminiumMaps(128);
    const graphite = graphiteMaps("#2a2d32", 256);
    const dieMat = new MeshPhysicalMaterial({
      map: die.map,
      normalMap: die.normalMap,
      roughnessMap: die.ormMap,
      metalnessMap: die.ormMap,
      aoMap: die.ormMap,
      roughness: 1,
      metalness: 1,
      emissive: RACK_BLUE,
      emissiveIntensity: 0,
      envMapIntensity: 1.4,
    });
    if (!q.mobile) {
      dieMat.iridescence = 0.55;
      dieMat.iridescenceIOR = 1.9;
      dieMat.iridescenceThicknessRange = [140, 460];
      dieMat.clearcoat = 0.35;
      dieMat.clearcoatRoughness = 0.08;
    }
    const activation = withDieActivation(dieMat, die.activation);
    return {
      stack: pbr(stack),
      pcb: pbr(pcb),
      substrate: pbr(substrate),
      die: dieMat,
      activation,
      alu: pbr(alu),
      chassis: pbr(graphite),
      silicon: new MeshStandardMaterial({ color: "#101318", roughness: 0.35, metalness: 0.6 }),
      nickel: new MeshStandardMaterial({ color: "#c7cbd1", roughness: 0.25, metalness: 1 }),
      blackPlastic: new MeshStandardMaterial({ color: "#121316", roughness: 0.6, metalness: 0.05 }),
      dimm: new MeshStandardMaterial({ color: "#1b1d22", roughness: 0.5, metalness: 0.6 }),
      cap: new MeshStandardMaterial({ color: "#6b6560", roughness: 0.5, metalness: 0.3 }),
      cable: new MeshStandardMaterial({ color: "#1d4fd7", roughness: 0.7 }),
      harness: new MeshStandardMaterial({ color: "#0b0c0f", roughness: 0.8 }),
      rail: new MeshStandardMaterial({ color: "#9aa0a8", roughness: 0.4, metalness: 0.9 }),
      fanFrame: new MeshStandardMaterial({ color: "#0d0e11", roughness: 0.7 }),
      blade: new MeshStandardMaterial({ color: "#2b2f36", roughness: 0.5, metalness: 0.3 }),
      driveLed: new MeshStandardMaterial({ color: "#0a1a12", emissive: new Color("#58e6a8").multiplyScalar(3), roughness: 0.4 }),
    };
  }, [q.dieRes, q.mobile]);

  useLayoutEffect(() => {
    const place = (mesh: InstancedMesh | null, i: number) => {
      dummy.updateMatrix();
      mesh?.setMatrixAt(i, dummy.matrix);
    };
    let d = 0, s = 0;
    DIMMS.forEach(({ z, populated }) => {
      dummy.rotation.set(0, 0, 0);
      if (populated) {
        dummy.position.set(CPU_LX, BOARD_TOP + 0.0165, z);
        dummy.scale.set(0.133, 0.031, 0.0065);
        place(dimms.current, d++);
      } else {
        dummy.position.set(CPU_LX, BOARD_TOP + 0.004, z);
        dummy.scale.set(0.14, 0.008, 0.007);
        place(slots.current, s++);
      }
    });
    dimms.current!.count = d;
    slots.current!.count = s;
    // Heat-sink fins on the second CPU.
    for (let i = 0; i < 30; i++) {
      dummy.position.set(CPU_LX, BOARD_TOP + 0.012 + 0.027, CPU2_LZ - 0.0435 + i * 0.003);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.09, 0.054, 0.0008);
      place(fins.current, i);
    }
    // VRM sinks behind the sockets.
    let v = 0;
    for (const z of [CPU1_LZ, CPU2_LZ]) for (let i = 0; i < 10; i++) {
      dummy.position.set(CPU_LX - 0.085, BOARD_TOP + 0.012, z - 0.027 + i * 0.006);
      dummy.scale.set(0.018, 0.02, 0.001);
      place(vrmFins.current, v++);
    }
    // Capacitors on the exposed substrate, around the die.
    const r = rng(311);
    let c = 0;
    for (let i = 0; i < 72; i++) {
      const side = i % 4;
      const t = (Math.floor(i / 4) / 18 - 0.5) * 0.06;
      const off = 0.026 + r() * 0.006;
      const x = side === 0 ? t : side === 1 ? -t : side === 2 ? off : -off;
      const z = side === 0 ? off : side === 1 ? -off : t;
      dummy.position.set(CPU_LX + x, BOARD_TOP + 0.0058 + 0.0004, CPU1_LZ + z);
      dummy.rotation.set(0, side < 2 ? 0 : Math.PI / 2, 0);
      dummy.scale.set(0.0016, 0.0007, 0.0008);
      place(caps.current, c++);
    }
    caps.current!.count = c;
    // Front drive carriers on the bezel.
    for (let i = 0; i < 8; i++) {
      dummy.position.set(SERVER.pullOut - 0.012, 0.025 + Math.floor(i / 4) * 0.038, -0.165 + (i % 4) * 0.028 - 0.06);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.02, 0.032, 0.025);
      place(drives.current, i);
    }
    for (const m of [dimms, slots, fins, vrmFins, caps, drives]) m.current!.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((state) => {
    const p = progress.p;
    const t = state.clock.elapsedTime;
    // Fan rotors.
    if (blades.current) {
      let i = 0;
      for (let f = 0; f < 6; f++) for (let b = 0; b < 3; b++) {
        dummy.position.set(0.5, 0.044, -0.18 + f * 0.072);
        dummy.rotation.set(t * 14 + f * 0.9 + (b * Math.PI * 2) / 3, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        blades.current.setMatrixAt(i++, dummy.matrix);
      }
      blades.current.instanceMatrix.needsUpdate = true;
    }
    // Die: activation sweep, then a steady glow; the macro key light comes up with it.
    const act = ramp(p, 0.6, 0.8);
    tex.activation.uProg.value = act;
    tex.activation.uTime.value = t;
    tex.die.emissiveIntensity = 0.4 + act * 2.6;
    if (dieLight.current) dieLight.current.intensity = 0.02 * ramp(p, 0.56, 0.68);
    if (workLight.current) workLight.current.intensity = 5 * ramp(p, 0.36, 0.44);
  });

  return (
    <group position={[SX, SERVER.y, SZ]}>
      {/* Rack frame: front and rear posts, and the equipment stack with its open slot. */}
      {[-0.27, 0.27].map((z) =>
        [0, -RACK.depth + 0.05].map((x) => (
          <mesh key={`${z}${x}`} position={[x - 0.03, RACK.height / 2 - SERVER.y, z]} material={tex.chassis}>
            <boxGeometry args={[0.05, RACK.height - 0.05, 0.05]} />
          </mesh>
        )),
      )}
      <mesh position={[-0.003, RACK_BASE + 21 * U - SERVER.y, 0]} rotation-y={Math.PI / 2} material={tex.stack}>
        <planeGeometry args={[RACK.width - 0.06, 42 * U]} />
      </mesh>

      {/* Chassis: floor, side walls, rear, slide rails. */}
      <group position={[SERVER.pullOut - SERVER.d / 2, 0, 0]}>
        <mesh position={[0, 0.001, 0]} material={tex.chassis}>
          <boxGeometry args={[SERVER.d, 0.002, SERVER.w]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0, SERVER.h / 2, s * (SERVER.w / 2 - 0.001)]} material={tex.chassis}>
            <boxGeometry args={[SERVER.d, SERVER.h, 0.002]} />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0, 0.04, s * (SERVER.w / 2 + 0.006)]} material={tex.rail}>
            <boxGeometry args={[SERVER.d, 0.03, 0.01]} />
          </mesh>
        ))}
        <mesh position={[-SERVER.d / 2 + 0.001, SERVER.h / 2, 0]} material={tex.chassis}>
          <boxGeometry args={[0.002, SERVER.h, SERVER.w]} />
        </mesh>
      </group>
      {/* Bezel with drive carriers and their LEDs. */}
      <mesh position={[SERVER.pullOut - 0.01, SERVER.h / 2, 0]} material={tex.chassis}>
        <boxGeometry args={[0.02, SERVER.h, SERVER.w]} />
      </mesh>
      <instancedMesh ref={drives} args={[undefined, undefined, 8]} material={tex.blackPlastic}>
        <boxGeometry />
      </instancedMesh>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[SERVER.pullOut + 0.001, 0.038 + Math.floor(i / 4) * 0.038, -0.165 + (i % 4) * 0.028 - 0.07]} material={tex.driveLed}>
          <boxGeometry args={[0.001, 0.002, 0.003]} />
        </mesh>
      ))}
      {/* Fan wall: six 60 mm fans. */}
      <mesh position={[0.5, 0.044, 0]} material={tex.fanFrame}>
        <boxGeometry args={[0.04, 0.084, 0.44]} />
      </mesh>
      {Array.from({ length: 6 }, (_, f) => (
        <mesh key={f} position={[0.521, 0.044, -0.18 + f * 0.072]} rotation-z={Math.PI / 2} material={tex.blackPlastic}>
          <ringGeometry args={[0.027, 0.034, 20]} />
        </mesh>
      ))}
      <instancedMesh ref={blades} args={[undefined, undefined, 18]} material={tex.blade}>
        <boxGeometry args={[0.004, 0.056, 0.011]} />
      </instancedMesh>

      {/* Motherboard with standoffs. */}
      <mesh position={[0.18, BOARD_TOP - 0.0008, 0]} rotation-x={-Math.PI / 2} material={tex.pcb}>
        <planeGeometry args={[0.56, 0.42]} />
      </mesh>
      <mesh position={[0.18, (BOARD_TOP - 0.0016) / 2 + 0.002, 0]} material={tex.silicon}>
        <boxGeometry args={[0.56, BOARD_TOP - 0.0016 - 0.002, 0.42]} />
      </mesh>
      <instancedMesh ref={dimms} args={[undefined, undefined, 24]} material={tex.dimm}>
        <boxGeometry />
      </instancedMesh>
      <instancedMesh ref={slots} args={[undefined, undefined, 24]} material={tex.blackPlastic}>
        <boxGeometry />
      </instancedMesh>
      <instancedMesh ref={vrmFins} args={[undefined, undefined, 20]} material={tex.alu}>
        <boxGeometry />
      </instancedMesh>
      {/* Riser card and cabling. */}
      <mesh position={[0.05, BOARD_TOP + 0.04, 0.17]} material={tex.pcb}>
        <boxGeometry args={[0.17, 0.075, 0.0016]} />
      </mesh>
      {[-0.19, -0.16].map((z, i) => (
        <mesh key={i} position={[0.36, BOARD_TOP + 0.004, z]} material={tex.cable}>
          <boxGeometry args={[0.24, 0.0012, 0.008]} />
        </mesh>
      ))}
      <mesh position={[0.44, 0.03, 0.2]} rotation-z={Math.PI / 2} material={tex.harness}>
        <cylinderGeometry args={[0.006, 0.006, 0.12, 8]} />
      </mesh>
      <mesh position={[0.3, 0.012, 0.21]} rotation-x={Math.PI / 2} material={tex.harness}>
        <cylinderGeometry args={[0.006, 0.006, 0.26, 8]} />
      </mesh>

      {/* CPU 2: socket, lid and heat sink. */}
      <group position={[CPU_LX, BOARD_TOP, CPU2_LZ]}>
        <mesh position={[0, 0.0015, 0]} material={tex.blackPlastic}>
          <boxGeometry args={[0.094, 0.003, 0.094]} />
        </mesh>
        <mesh position={[0, 0.0045, 0]} material={tex.nickel}>
          <boxGeometry args={[0.076, 0.003, 0.076]} />
        </mesh>
        <mesh position={[0, 0.009, 0]} material={tex.nickel}>
          <boxGeometry args={[0.09, 0.006, 0.09]} />
        </mesh>
        <instancedMesh ref={fins} args={[undefined, undefined, 30]} material={tex.alu}>
          <boxGeometry />
        </instancedMesh>
      </group>

      {/* CPU 1: heat sink off, lid off. Socket, retention frame, substrate with capacitors, and the die. */}
      <group position={[CPU_LX, BOARD_TOP, CPU1_LZ]}>
        <mesh position={[0, 0.0015, 0]} material={tex.blackPlastic}>
          <boxGeometry args={[0.094, 0.003, 0.094]} />
        </mesh>
        {[[0, 0.044], [0, -0.044], [0.044, 0], [-0.044, 0]].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.005, z]} material={tex.nickel}>
            <boxGeometry args={i < 2 ? [0.092, 0.004, 0.004] : [0.004, 0.004, 0.092]} />
          </mesh>
        ))}
        <mesh position={[0.05, 0.004, 0.03]} rotation-z={0.3} material={tex.nickel}>
          <boxGeometry args={[0.003, 0.003, 0.03]} />
        </mesh>
        <mesh position={[0, 0.0044, 0]} material={tex.substrate}>
          <boxGeometry args={[0.076, 0.0028, 0.076]} />
        </mesh>
        <mesh position={[0, 0.0058 + 0.0004, 0]} material={tex.silicon}>
          <boxGeometry args={[DIE_SIZE - 0.0003, 0.0008, DIE_SIZE - 0.0003]} />
        </mesh>
        <mesh position={[0, DIE_Y - SERVER.y - BOARD_TOP, 0]} rotation-x={-Math.PI / 2} material={tex.die}>
          <planeGeometry args={[DIE_SIZE, DIE_SIZE]} />
        </mesh>
        <group position={[0, DIE_Y - SERVER.y - BOARD_TOP, 0]} rotation-x={-Math.PI / 2}>
          <ChipTraces progress={progress} z={0.00005} />
        </group>
      </group>
      <instancedMesh ref={caps} args={[undefined, undefined, 72]} material={tex.cap}>
        <boxGeometry />
      </instancedMesh>

      {/* Lights: a tech's work light over the open server, and a macro key light for the die's specular. */}
      <pointLight ref={workLight} position={[0.35, 1.2, 0.1]} color="#e3ecff" intensity={0} distance={4} decay={2} />
      <pointLight ref={dieLight} position={[CPU_LX + 0.03, BOARD_TOP + 0.07, CPU1_LZ - 0.025]} color="#ffffff" intensity={0} distance={0.4} decay={2} />
    </group>
  );
}
