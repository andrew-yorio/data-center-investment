import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Hud, Stars } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef } from "react";
import { BackSide, Color, FogExp2, Group, InstancedBufferAttribute, InstancedMesh, MathUtils, type Material, type Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera as PCam, Vector3 } from "three";
import { introScroll } from "../lib/scroll";
import { BUILDING, CHIP_Y, DIE_SIZE, DIE_X, BOARD_X, RACK, RACK_FRONT_X, ROW_X, TARGET_Z, ramp, sampleCamera } from "./path";
import { boardTexture, dieTexture, floorTexture, rackFrontTexture } from "./textures";
import { ledMaterial, type LedMaterial } from "./materials";
import { ChipTraces } from "./ChipTraces";
import { ValueParticles } from "./ValueParticles";

const NIGHT = new Color("#07142b");
const HAZE = new Color("#0d2042");

/** Shared, smoothed progress so every part of the scene agrees on the same frame. */
const frame = { p: 0 };

function CameraRig() {
  const camera = useThree((s) => s.camera) as PCam;
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const pos = useMemo(() => new Vector3(), []);
  const target = useMemo(() => new Vector3(), []);
  const frameOffset = useMemo(() => new Vector3(), []);

  useLayoutEffect(() => {
    scene.fog = new FogExp2(HAZE, 0.003);
    scene.background = NIGHT;
  }, [scene]);

  useFrame((state, dt) => {
    frame.p = MathUtils.damp(frame.p, introScroll.progress, 7, Math.min(dt, 0.1));
    const dist = sampleCamera(frame.p, pos, target);
    // A slow idle drift on the opening shot so the page feels alive before anyone scrolls.
    const idle = 1 - ramp(frame.p, 0, 0.08);
    pos.x += Math.sin(state.clock.elapsedTime * 0.12) * 4 * idle;
    // Opening shot: keep the building clear of the headline (right on wide screens, above it on tall ones).
    const compose = 1 - ramp(frame.p, 0.02, 0.13);
    if (size.width >= size.height) frameOffset.set(-30, 2, 14);
    else frameOffset.set(0, -16, 0);
    target.addScaledVector(frameOffset, compose);
    camera.position.copy(pos);
    camera.lookAt(target);
    // Scale-aware clipping planes: one scene spans ~100 m down to a ~1 cm die.
    camera.near = Math.max(dist * 0.02, 0.00005);
    camera.far = MathUtils.clamp(dist * 400, 4, 2000);
    camera.updateProjectionMatrix();
    (scene.fog as FogExp2).density = MathUtils.clamp(0.22 / dist, 0.0025, 60);
  });
  return null;
}

function Exterior({ mobile }: { mobile: boolean }) {
  const group = useRef<Group>(null);
  const fans = useRef<InstancedMesh>(null);
  const windows = useRef<InstancedMesh>(null);
  const fins = useRef<InstancedMesh>(null);
  const { w, h, d } = BUILDING;

  const fanSlots = useMemo(() => {
    const out: [number, number][] = [];
    for (let ix = 0; ix < 6; ix++) for (let iz = 0; iz < 3; iz++) {
      const x = -22.5 + ix * 9;
      const z = -10 + iz * 10;
      out.push([x - 1.4, z], [x + 1.4, z]);
    }
    return out;
  }, []);

  useLayoutEffect(() => {
    const o = new Object3D();
    // Ribbon windows on the front and both sides, some dark.
    let n = 0;
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const win = windows.current!;
    for (const row of [4.2, 10.4]) {
      for (let x = -w / 2 + 2; x < w / 2 - 1.5; x += 2.2) {
        if (rnd() < 0.18) continue;
        o.position.set(x, row, d / 2 + 0.05);
        o.rotation.set(0, 0, 0);
        o.scale.set(1.5, row > 8 ? 0.7 : 0.45, 1);
        o.updateMatrix();
        win.setMatrixAt(n++, o.matrix);
      }
      for (const side of [-1, 1]) {
        for (let z = -d / 2 + 2; z < d / 2 - 1.5; z += 2.2) {
          if (rnd() < 0.25) continue;
          o.position.set(side * (w / 2 + 0.05), row, z);
          o.rotation.set(0, (side * Math.PI) / 2, 0);
          o.scale.set(1.5, row > 8 ? 0.7 : 0.45, 1);
          o.updateMatrix();
          win.setMatrixAt(n++, o.matrix);
        }
      }
    }
    win.count = n;
    win.instanceMatrix.needsUpdate = true;

    // Vertical facade fins.
    const f = fins.current!;
    let m = 0;
    for (let x = -w / 2; x <= w / 2; x += 3.3) {
      o.position.set(x, h / 2, d / 2 + 0.35);
      o.rotation.set(0, 0, 0);
      o.scale.set(0.22, h, 0.7);
      o.updateMatrix();
      f.setMatrixAt(m++, o.matrix);
    }
    f.count = m;
    f.instanceMatrix.needsUpdate = true;
  }, [w, h, d]);

  const fanObj = useMemo(() => new Object3D(), []);
  const materials = useRef<Material[]>([]);
  useLayoutEffect(() => {
    const set = new Set<Material>();
    group.current?.traverse((o) => {
      const m = (o as Mesh).material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => set.add(x));
    });
    materials.current = [...set];
  }, []);
  useFrame((state) => {
    const fade = 1 - ramp(frame.p, 0.175, 0.205);
    if (group.current) group.current.visible = fade > 0.001;
    for (const m of materials.current) {
      m.opacity = fade;
      m.transparent = fade < 1;
      m.depthWrite = fade > 0.5;
    }
    if (!group.current?.visible || !fans.current) return;
    const t = state.clock.elapsedTime;
    fanSlots.forEach(([x, z], i) => {
      fanObj.position.set(x, h + 2.05, z);
      fanObj.rotation.set(0, t * 3 + i, 0);
      fanObj.updateMatrix();
      fans.current!.setMatrixAt(i, fanObj.matrix);
    });
    fans.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#243a63" emissive="#0a1a36" roughness={0.7} metalness={0.25} />
      </mesh>
      <instancedMesh ref={fins} args={[undefined, undefined, 24]}>
        <boxGeometry />
        <meshStandardMaterial color="#30497a" roughness={0.55} metalness={0.3} />
      </instancedMesh>
      <instancedMesh ref={windows} args={[undefined, undefined, 160]}>
        <planeGeometry />
        <meshBasicMaterial color="#a9d2ff" toneMapped={false} />
      </instancedMesh>
      {/* Entrance */}
      <mesh position={[0, 1.6, d / 2 + 0.06]}>
        <planeGeometry args={[4.2, 3.2]} />
        <meshBasicMaterial color="#d6ebff" toneMapped={false} />
      </mesh>
      {/* Rooftop cooling units */}
      {Array.from({ length: 18 }, (_, i) => (
        <mesh key={i} position={[-22.5 + Math.floor(i / 3) * 9, h + 1, -10 + (i % 3) * 10]}>
          <boxGeometry args={[6.4, 2, 4.2]} />
          <meshStandardMaterial color="#2a3d61" roughness={0.5} metalness={0.4} />
        </mesh>
      ))}
      <instancedMesh ref={fans} args={[undefined, undefined, fanSlots.length]}>
        <cylinderGeometry args={[1.1, 1.1, 0.12, mobile ? 6 : 10]} />
        <meshStandardMaterial color="#5aa8ff" emissive="#1d4f8f" emissiveIntensity={0.9} roughness={0.4} />
      </instancedMesh>
      {/* Site lighting along the perimeter */}
      {Array.from({ length: mobile ? 8 : 14 }, (_, i) => {
        const x = -w / 2 - 6 + (i / ((mobile ? 8 : 14) - 1)) * (w + 12);
        return (
          <mesh key={i} position={[x, 5, d / 2 + 14]}>
            <boxGeometry args={[0.4, 0.25, 0.4]} />
            <meshBasicMaterial color="#e6f1ff" toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function Grounds() {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]}>
      <planeGeometry args={[1600, 1600]} />
      <meshStandardMaterial color="#060f20" roughness={1} />
    </mesh>
  );
}

function Hall({ mobile }: { mobile: boolean }) {
  const group = useRef<Group>(null);
  const racks = useRef<InstancedMesh>(null);
  const fronts = useRef<InstancedMesh>(null);
  const leds = useRef<InstancedMesh>(null);
  const strips = useRef<InstancedMesh>(null);
  const ledMat = useMemo<LedMaterial>(() => ledMaterial(), []);
  const textures = useMemo(() => ({ front: rackFrontTexture(), floor: floorTexture() }), []);

  const rowPairs = mobile ? 3 : 6;
  const perRow = Math.floor((RACK.zEnd - RACK.zStart) / RACK.pitch) + 1;
  const rackCount = rowPairs * 2 * perRow;
  const ledsPerRack = mobile ? 6 : 14;

  useLayoutEffect(() => {
    const o = new Object3D();
    let r = 0;
    let l = 0;
    let s = 0;
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const phase = new Float32Array(rackCount * ledsPerRack);
    const tint = new Float32Array(rackCount * ledsPerRack * 3);
    const palette = [new Color("#5aa8ff"), new Color("#5aa8ff"), new Color("#e8f3ff"), new Color("#58e6a8")];

    for (let k = 0; k < rowPairs; k++) {
      for (const side of [-1, 1]) {
        const cx = side * (ROW_X + k * 3.4);
        const faceX = cx - side * (RACK.depth / 2) - side * 0.002; // front faces toward x = 0 for the first pair
        const yaw = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        for (let j = 0; j < perRow; j++) {
          const z = RACK.zStart + j * RACK.pitch;
          o.position.set(cx, RACK.height / 2, z);
          o.rotation.set(0, 0, 0);
          o.scale.set(RACK.depth, RACK.height, RACK.width - 0.04);
          o.updateMatrix();
          racks.current!.setMatrixAt(r, o.matrix);

          const isTarget = k === 0 && side === -1 && Math.abs(z - TARGET_Z) < 1e-6;
          o.position.set(faceX, RACK.height / 2, z);
          o.rotation.set(0, yaw, 0);
          o.scale.set(isTarget ? 0.0001 : RACK.width - 0.06, RACK.height - 0.08, 1);
          o.updateMatrix();
          fronts.current!.setMatrixAt(r, o.matrix);
          r++;

          for (let q = 0; q < ledsPerRack; q++) {
            const y = 0.18 + (q / ledsPerRack) * (RACK.height - 0.3) + rnd() * 0.04;
            const dz = (rnd() < 0.5 ? -1 : 1) * (0.1 + rnd() * 0.14);
            o.position.set(faceX - side * 0.003, y, z + dz);
            o.rotation.set(0, yaw, 0);
            o.scale.setScalar(0.022);
            o.updateMatrix();
            leds.current!.setMatrixAt(l, o.matrix);
            phase[l] = rnd();
            palette[Math.floor(rnd() * palette.length)].toArray(tint, l * 3);
            l++;
          }
        }
      }
    }
    // Ceiling light strips over each aisle.
    for (let k = -rowPairs; k <= rowPairs; k++) {
      o.position.set(k * 3.4, 5.4, (RACK.zStart + RACK.zEnd) / 2);
      o.rotation.set(0, 0, 0);
      o.scale.set(0.18, 0.05, RACK.zEnd - RACK.zStart + 2);
      o.updateMatrix();
      strips.current!.setMatrixAt(s++, o.matrix);
    }
    for (const m of [racks, fronts, leds, strips]) m.current!.instanceMatrix.needsUpdate = true;
    racks.current!.count = r;
    fronts.current!.count = r;
    leds.current!.count = l;
    strips.current!.count = s;
    const g = leds.current!.geometry;
    g.setAttribute("aPhase", new InstancedBufferAttribute(phase, 1));
    g.setAttribute("aTint", new InstancedBufferAttribute(tint, 3));
  }, [rackCount, ledsPerRack, perRow, rowPairs]);

  useFrame((state) => {
    const show = frame.p > 0.12 && frame.p < 0.9;
    if (group.current) group.current.visible = show;
    ledMat.uniforms.uTime.value = state.clock.elapsedTime;
  });

  const innerW = BUILDING.w - 1;
  const innerD = BUILDING.d - 1;
  return (
    <group ref={group} visible={false}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, 0]}>
        <planeGeometry args={[innerW, innerD]} />
        <meshStandardMaterial map={textures.floor} roughness={0.55} metalness={0.3} />
      </mesh>
      {/* Inner walls and ceiling, seen from inside */}
      <mesh position={[0, BUILDING.h / 2 - 0.5, 0]}>
        <boxGeometry args={[innerW, BUILDING.h - 1, innerD]} />
        <meshStandardMaterial color="#0c1a33" side={BackSide} roughness={0.9} />
      </mesh>
      <mesh position={[0, 5.9, 0]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[innerW, innerD]} />
        <meshStandardMaterial color="#0a1529" roughness={1} />
      </mesh>
      <instancedMesh ref={racks} args={[undefined, undefined, rackCount]}>
        <boxGeometry />
        <meshStandardMaterial color="#111b2e" roughness={0.45} metalness={0.6} />
      </instancedMesh>
      <instancedMesh ref={fronts} args={[undefined, undefined, rackCount]}>
        <planeGeometry />
        <meshStandardMaterial map={textures.front} roughness={0.5} metalness={0.4} emissive="#0b1a33" emissiveIntensity={0.6} />
      </instancedMesh>
      <instancedMesh ref={leds} args={[undefined, undefined, rackCount * ledsPerRack]} material={ledMat}>
        <planeGeometry />
      </instancedMesh>
      <instancedMesh ref={strips} args={[undefined, undefined, rowPairs * 2 + 1]}>
        <boxGeometry />
        <meshBasicMaterial color="#cfe6ff" toneMapped={false} />
      </instancedMesh>
      <pointLight position={[0, 4.5, 8]} color="#6fb4ff" intensity={18} distance={22} decay={1.6} />
      <pointLight position={[0, 4.5, -8]} color="#6fb4ff" intensity={18} distance={22} decay={1.6} />
      {!mobile && <pointLight position={[-6.8, 4.5, 0]} color="#4a7fd6" intensity={10} distance={18} decay={1.6} />}
      <pointLight position={[RACK_FRONT_X + 0.5, CHIP_Y + 0.2, TARGET_Z]} color="#8cc4ff" intensity={0.6} distance={1.6} decay={2} />
      <TargetBoard />
    </group>
  );
}

/** The one open rack: a board with the processor the camera dives into. */
function TargetBoard() {
  const tex = useMemo(() => ({ board: boardTexture(), die: dieTexture() }), []);
  const dieMat = useRef<MeshStandardMaterial>(null);
  useFrame(() => {
    if (dieMat.current) dieMat.current.emissiveIntensity = 0.25 + ramp(frame.p, 0.62, 0.8) * 0.9;
  });
  return (
    <group position={[BOARD_X, CHIP_Y, TARGET_Z]} rotation-y={Math.PI / 2}>
      <mesh>
        <planeGeometry args={[0.5, 0.36]} />
        <meshStandardMaterial map={tex.board} roughness={0.7} metalness={0.2} emissive="#0a2a33" emissiveIntensity={0.4} />
      </mesh>
      {/* Package */}
      <mesh position={[0, 0, 0.0025]}>
        <boxGeometry args={[0.062, 0.062, 0.005]} />
        <meshStandardMaterial color="#1a2436" roughness={0.35} metalness={0.7} />
      </mesh>
      {/* Die */}
      <mesh position={[0, 0, DIE_X - BOARD_X - 0.0001]}>
        <planeGeometry args={[DIE_SIZE, DIE_SIZE]} />
        <meshStandardMaterial ref={dieMat} map={tex.die} emissiveMap={tex.die} emissive="#ffffff" roughness={0.3} metalness={0.8} />
      </mesh>
      <ChipTraces progress={frame} z={DIE_X - BOARD_X} />
    </group>
  );
}

export default function Scene({ mobile, active }: { mobile: boolean; active: boolean }) {
  return (
    <Canvas
      aria-hidden="true"
      className="!absolute inset-0"
      frameloop={active ? "always" : "never"}
      dpr={mobile ? [1, 1.25] : [1, 1.75]}
      gl={{ antialias: !mobile, powerPreference: "high-performance" }}
      camera={{ fov: mobile ? 55 : 42, position: [62, 24, 96], near: 0.1, far: 2000 }}
    >
      <CameraRig />
      <hemisphereLight args={["#3d5f9e", "#04080f", 0.7]} />
      <directionalLight position={[70, 60, 90]} intensity={1.1} color="#a9c1ff" />
      <directionalLight position={[-80, 30, -40]} intensity={0.35} color="#5aa8ff" />
      <Stars radius={600} depth={200} count={mobile ? 700 : 1600} factor={6} fade speed={0.3} />
      <Grounds />
      <Exterior mobile={mobile} />
      <Hall mobile={mobile} />
      <Hud renderPriority={1}>
        <ValueParticles progress={frame} mobile={mobile} />
      </Hud>
    </Canvas>
  );
}
