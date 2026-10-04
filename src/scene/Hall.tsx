import { MeshReflectorMaterial } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, type Group, InstancedBufferAttribute, type InstancedMesh, MeshStandardMaterial, Object3D, type Points, type Texture } from "three";
import { BUILDING, HALL_CEILING, RACK, RACK_FRONT_X, ROW_PITCH, ROW_X, TARGET_Z, ramp } from "./path";
import type { Quality } from "./quality";
import { ceilingMaps, dotTexture, floorTileMaps, graphiteMaps, type MapSet, rackDoorMaps, rng, wallPanelMaps } from "./textures";
import { ledMaterial, type LedMaterial } from "./materials";
import { Server } from "./Server";

const dummy = new Object3D();
const INNER_W = BUILDING.w - 1;
const INNER_D = BUILDING.d - 1;
const ROW_LEN = RACK.zEnd - RACK.zStart + RACK.pitch;
const ROW_MID = (RACK.zStart + RACK.zEnd) / 2;
const U = 0.04445;
const RACK_BASE = 0.1;
const AISLE_W = ROW_PITCH - RACK.depth; // 2.3 m between back-to-back or face-to-face rows
const STRIP = new Color("#dbe6ff").multiplyScalar(6); // HDR fixture emissive

function tiled(set: MapSet, rx: number, ry: number): MapSet {
  const clone = (t: Texture) => {
    const c = t.clone();
    c.repeat.set(rx, ry);
    return c;
  };
  return { map: clone(set.map), normalMap: clone(set.normalMap), ormMap: clone(set.ormMap) } as MapSet;
}

function pbr(set: MapSet, extra: Partial<MeshStandardMaterial> = {}): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, roughnessMap: set.ormMap, metalnessMap: set.ormMap, aoMap: set.ormMap, roughness: 1, metalness: 1 });
  Object.assign(m, extra);
  return m;
}

/** Row centre x and the direction its fronts face, for pair index k on side s. */
function rowOf(s: number, k: number) {
  const cx = s * (ROW_X + k * ROW_PITCH);
  const faceDir = k % 2 === 0 ? -s : s; // even rows face the centre of their cold aisle
  return { cx, faceDir, faceX: cx + faceDir * (RACK.depth / 2), backX: cx - faceDir * (RACK.depth / 2) };
}

export function Hall({ q, reflections, progress }: { q: Quality; reflections: boolean; progress: { p: number } }) {
  const group = useRef<Group>(null);
  const bodies = useRef<InstancedMesh>(null);
  const fronts = useRef<InstancedMesh>(null);
  const rears = useRef<InstancedMesh>(null);
  const tops = useRef<InstancedMesh>(null);
  const risers = useRef<InstancedMesh>(null);
  const leds = useRef<InstancedMesh>(null);
  const fixtures = useRef<InstancedMesh>(null);
  const housings = useRef<InstancedMesh>(null);
  const rungs = useRef<InstancedMesh>(null);
  const rails = useRef<InstancedMesh>(null);
  const bundles = useRef<InstancedMesh>(null);
  const taps = useRef<InstancedMesh>(null);
  const beams = useRef<InstancedMesh>(null);
  const doorFrames = useRef<InstancedMesh>(null);
  const motes = useRef<Points>(null);
  const ledMat = useMemo<LedMaterial>(() => ledMaterial(), []);

  const rowPairs = q.rowPairs;
  const perRow = Math.floor((RACK.zEnd - RACK.zStart) / RACK.pitch) + 1;
  const rackCount = rowPairs * 2 * perRow;
  const ledsPerRack = q.ledsPerRack;

  const tex = useMemo(() => {
    const floor = floorTileMaps(false, 512);
    const perf = floorTileMaps(true, 512);
    const door = rackDoorMaps();
    const graphite = graphiteMaps("#1d2024", 256);
    const wall = wallPanelMaps(512);
    const ceiling = ceilingMaps(256);
    return {
      floor: tiled(floor, INNER_W / 1.2, INNER_D / 1.2),
      perf: pbr(tiled(perf, 0.5, ROW_LEN / 1.2)),
      door: pbr(door),
      rearDoor: pbr(door, { color: new Color("#8a8f96") }),
      graphite: pbr(graphite),
      wallLong: pbr(tiled(wall, INNER_W / 2, HALL_CEILING / 2)),
      wallShort: pbr(tiled(wall, INNER_D / 2, HALL_CEILING / 2)),
      ceiling: pbr(tiled(ceiling, INNER_W / 2.4, INNER_D / 2.4)),
      steel: new MeshStandardMaterial({ color: "#8b9098", roughness: 0.45, metalness: 0.8 }),
      darkSteel: new MeshStandardMaterial({ color: "#3a3e45", roughness: 0.5, metalness: 0.7 }),
      cable: new MeshStandardMaterial({ color: "#14213a", roughness: 0.7, metalness: 0.1 }),
      poly: new MeshStandardMaterial({ color: "#2a3340", roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.45, depthWrite: false }),
      fixture: new MeshStandardMaterial({ color: "#e8eef8", emissive: STRIP, emissiveIntensity: 1, roughness: 0.4 }),
      dot: dotTexture(64),
    };
  }, []);

  useLayoutEffect(() => {
    const r = rng(5);
    let n = 0;
    let l = 0;
    const phase = new Float32Array(rackCount * ledsPerRack);
    const tint = new Float32Array(rackCount * ledsPerRack * 3);
    const palette = [new Color("#8fc3ff"), new Color("#8fc3ff"), new Color("#58e6a8"), new Color("#58e6a8"), new Color("#eaf3ff")];
    const place = (mesh: InstancedMesh | null, i: number) => {
      dummy.updateMatrix();
      mesh?.setMatrixAt(i, dummy.matrix);
    };

    for (let k = 0; k < rowPairs; k++) {
      for (const s of [-1, 1]) {
        const { cx, faceDir, faceX, backX } = rowOf(s, k);
        const yaw = faceDir > 0 ? Math.PI / 2 : -Math.PI / 2;
        for (let j = 0; j < perRow; j++) {
          const z = RACK.zStart + j * RACK.pitch;
          const isTarget = k === 0 && s === -1 && Math.abs(z - TARGET_Z) < 1e-6;
          dummy.position.set(cx, RACK.height / 2, z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(RACK.depth, RACK.height, RACK.width - 0.01);
          place(bodies.current, n);
          // Doors: the target rack's front door is off.
          dummy.position.set(faceX + faceDir * 0.004, RACK.height / 2 + 0.04, z);
          dummy.rotation.set(0, yaw, 0);
          dummy.scale.set(isTarget ? 0.0001 : RACK.width - 0.04, RACK.height - 0.14, 1);
          place(fronts.current, n);
          dummy.position.set(backX - faceDir * 0.004, RACK.height / 2 + 0.04, z);
          dummy.rotation.set(0, yaw + Math.PI, 0);
          dummy.scale.set(RACK.width - 0.04, RACK.height - 0.14, 1);
          place(rears.current, n);
          // Top cable manager and a riser bundle up to the tray.
          dummy.position.set(cx, RACK.height + 0.08, z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(0.3, 0.16, 0.25);
          place(tops.current, n);
          dummy.position.set(cx + (r() - 0.5) * 0.2, RACK.height + 0.6, z + (r() - 0.5) * 0.1);
          dummy.rotation.set((r() - 0.5) * 0.1, 0, (r() - 0.5) * 0.1);
          dummy.scale.set(1, 1, 1);
          place(risers.current, n);
          n++;

          // Status LEDs on the equipment behind the front door, aligned to rack units.
          for (let i = 0; i < ledsPerRack; i++) {
            const u = 1 + Math.floor((i / ledsPerRack) * 40) + (r() < 0.3 ? 1 : 0);
            const col = i % 2 ? -0.2 + r() * 0.05 : -0.16 + r() * 0.04;
            const y = RACK_BASE + u * U + 0.012 + r() * 0.01;
            dummy.position.set(faceX + faceDir * 0.009, y, z + col * faceDir * -1);
            dummy.rotation.set(0, yaw, 0);
            dummy.scale.set(0.0065, 0.0045, 1);
            place(leds.current, l);
            phase[l] = r();
            palette[Math.floor(r() * palette.length)].toArray(tint, l * 3);
            l++;
          }
        }
      }
    }
    for (const m of [bodies, fronts, rears, tops, risers, leds]) m.current!.instanceMatrix.needsUpdate = true;
    bodies.current!.count = fronts.current!.count = rears.current!.count = tops.current!.count = risers.current!.count = n;
    leds.current!.count = l;
    const g = leds.current!.geometry;
    g.setAttribute("aPhase", new InstancedBufferAttribute(phase, 1));
    g.setAttribute("aTint", new InstancedBufferAttribute(tint, 3));

    // Overhead: fixtures over every aisle, trays over every row, beams across the hall.
    let f = 0;
    const aisleXs: number[] = [0];
    for (let k = 1; k < rowPairs; k++) for (const s of [-1, 1]) aisleXs.push(s * (ROW_X + (k - 0.5) * ROW_PITCH));
    for (const x of aisleXs) {
      for (let z = RACK.zStart - 1; z <= RACK.zEnd + 1; z += 3) {
        dummy.position.set(x, HALL_CEILING - 0.12, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.1, 0.03, 1.5);
        place(fixtures.current, f);
        dummy.position.set(x, HALL_CEILING - 0.09, z);
        dummy.scale.set(0.18, 0.08, 1.6);
        place(housings.current, f);
        f++;
      }
    }
    fixtures.current!.count = housings.current!.count = f;
    fixtures.current!.instanceMatrix.needsUpdate = true;
    housings.current!.instanceMatrix.needsUpdate = true;

    let rg = 0, rl = 0, bd = 0, tp = 0;
    for (let k = 0; k < rowPairs; k++) for (const s of [-1, 1]) {
      const { cx } = rowOf(s, k);
      for (const dx of [-0.2, 0.2]) {
        dummy.position.set(cx + dx, 3.1, ROW_MID);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.04, 0.1, ROW_LEN);
        place(rails.current, rl++);
      }
      for (let z = RACK.zStart; z <= RACK.zEnd; z += 0.3) {
        dummy.position.set(cx, 3.06, z);
        dummy.scale.set(0.4, 0.03, 0.03);
        place(rungs.current, rg++);
      }
      for (let b = 0; b < 3; b++) {
        dummy.position.set(cx - 0.12 + b * 0.12, 3.12, ROW_MID);
        dummy.rotation.set(Math.PI / 2, 0, 0);
        dummy.scale.set(1, ROW_LEN, 1);
        place(bundles.current, bd++);
      }
      // Busway tap-off boxes every four racks.
      for (let z = RACK.zStart + 1; z <= RACK.zEnd; z += 2.4) {
        dummy.position.set(cx, 3.5, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.22, 0.18, 0.3);
        place(taps.current, tp++);
      }
    }
    rails.current!.count = rl;
    rungs.current!.count = rg;
    bundles.current!.count = bd;
    taps.current!.count = tp;
    for (const m of [rails, rungs, bundles, taps]) m.current!.instanceMatrix.needsUpdate = true;

    let bm = 0;
    for (let z = -INNER_D / 2 + 3; z < INNER_D / 2; z += 6) {
      dummy.position.set(0, HALL_CEILING - 0.25, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(INNER_W, 0.5, 0.3);
      place(beams.current, bm++);
    }
    beams.current!.count = bm;
    beams.current!.instanceMatrix.needsUpdate = true;

    // Containment door frames at the ends of each hot aisle.
    let df = 0;
    for (let k = 0; k + 1 < rowPairs; k += 2) for (const s of [-1, 1]) {
      const x = s * (ROW_X + (k + 0.5) * ROW_PITCH);
      for (const z of [RACK.zStart - 0.45, RACK.zEnd + 0.45]) {
        for (const dx of [-AISLE_W / 2, 0, AISLE_W / 2]) {
          dummy.position.set(x + dx, RACK.height / 2, z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(0.06, RACK.height, 0.06);
          place(doorFrames.current, df++);
        }
        dummy.position.set(x, RACK.height, z);
        dummy.scale.set(AISLE_W, 0.06, 0.06);
        place(doorFrames.current, df++);
      }
    }
    doorFrames.current!.count = df;
    doorFrames.current!.instanceMatrix.needsUpdate = true;
  }, [rackCount, ledsPerRack, perRow, rowPairs]);

  // Dust motes drifting in the aisle light near the open rack.
  const moteGeom = useMemo(() => {
    const n = q.motes;
    const pos = new Float32Array(n * 3);
    const r = rng(77);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = -1.1 + r() * 2.2;
      pos[i * 3 + 1] = 0.3 + r() * 2.2;
      pos[i * 3 + 2] = TARGET_Z - 2 + r() * 5;
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    return g;
  }, [q.motes]);

  useFrame((state, dt) => {
    const p = progress.p;
    const show = p > 0.1 && p < 0.9;
    if (group.current) group.current.visible = show;
    if (!show) return;
    ledMat.uniforms.uTime.value = state.clock.elapsedTime;
    const m = motes.current;
    if (m) {
      m.visible = p > 0.3 && p < 0.7;
      if (m.visible) {
        const a = m.geometry.attributes.position as BufferAttribute;
        const arr = a.array as Float32Array;
        const t = state.clock.elapsedTime;
        for (let i = 0; i < arr.length; i += 3) {
          arr[i] += Math.sin(t * 0.7 + i) * 0.012 * dt;
          arr[i + 1] += (Math.cos(t * 0.5 + i * 0.3) * 0.01 - 0.004) * dt;
          arr[i + 2] += Math.sin(t * 0.6 + i * 0.7) * 0.01 * dt;
        }
        a.needsUpdate = true;
        (m.material as { opacity: number }).opacity = 0.5 * ramp(p, 0.3, 0.38) * (1 - ramp(p, 0.6, 0.68));
      }
    }
  });

  const hotAisles: number[] = [];
  for (let k = 0; k + 1 < rowPairs; k += 2) for (const s of [-1, 1]) hotAisles.push(s * (ROW_X + (k + 0.5) * ROW_PITCH));

  return (
    <group ref={group} visible={false}>
      {/* Floor: semi-gloss tiles (reflective on desktop) with perforated tiles in front of the racks. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <planeGeometry args={[INNER_W, INNER_D]} />
        {reflections ? (
          <MeshReflectorMaterial
            map={tex.floor.map}
            normalMap={tex.floor.normalMap}
            roughnessMap={tex.floor.ormMap}
            metalnessMap={tex.floor.ormMap}
            roughness={1}
            metalness={1}
            resolution={1024}
            blur={[300, 80]}
            mixBlur={0.9}
            mixStrength={2.2}
            mixContrast={1}
            depthScale={0.8}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            mirror={0.25}
            reflectorOffset={0.01}
          />
        ) : (
          <meshStandardMaterial map={tex.floor.map} normalMap={tex.floor.normalMap} roughnessMap={tex.floor.ormMap} metalnessMap={tex.floor.ormMap} roughness={1} metalness={1} />
        )}
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} rotation-x={-Math.PI / 2} position={[s * (RACK_FRONT_X * -1 - 0.3), 0.002, ROW_MID]} material={tex.perf}>
          <planeGeometry args={[0.6, ROW_LEN]} />
        </mesh>
      ))}

      {/* Walls and ceiling, seen from inside. */}
      <mesh position={[0, HALL_CEILING / 2, -INNER_D / 2]} material={tex.wallLong}>
        <planeGeometry args={[INNER_W, HALL_CEILING]} />
      </mesh>
      <mesh position={[0, HALL_CEILING / 2, INNER_D / 2]} rotation-y={Math.PI} material={tex.wallLong}>
        <planeGeometry args={[INNER_W, HALL_CEILING]} />
      </mesh>
      <mesh position={[-INNER_W / 2, HALL_CEILING / 2, 0]} rotation-y={Math.PI / 2} material={tex.wallShort}>
        <planeGeometry args={[INNER_D, HALL_CEILING]} />
      </mesh>
      <mesh position={[INNER_W / 2, HALL_CEILING / 2, 0]} rotation-y={-Math.PI / 2} material={tex.wallShort}>
        <planeGeometry args={[INNER_D, HALL_CEILING]} />
      </mesh>
      <mesh position={[0, HALL_CEILING, 0]} rotation-x={Math.PI / 2} material={tex.ceiling}>
        <planeGeometry args={[INNER_W, INNER_D]} />
      </mesh>
      <instancedMesh ref={beams} args={[undefined, undefined, 8]} material={tex.darkSteel}>
        <boxGeometry />
      </instancedMesh>

      {/* Racks */}
      <instancedMesh ref={bodies} args={[undefined, undefined, rackCount]} material={tex.graphite}>
        <boxGeometry />
      </instancedMesh>
      <instancedMesh ref={fronts} args={[undefined, undefined, rackCount]} material={tex.door}>
        <planeGeometry />
      </instancedMesh>
      <instancedMesh ref={rears} args={[undefined, undefined, rackCount]} material={tex.rearDoor}>
        <planeGeometry />
      </instancedMesh>
      <instancedMesh ref={tops} args={[undefined, undefined, rackCount]} material={tex.darkSteel}>
        <boxGeometry />
      </instancedMesh>
      <instancedMesh ref={risers} args={[undefined, undefined, rackCount]} material={tex.cable}>
        <cylinderGeometry args={[0.028, 0.028, 0.95, 6]} />
      </instancedMesh>
      <instancedMesh ref={leds} args={[undefined, undefined, rackCount * ledsPerRack]} material={ledMat}>
        <planeGeometry />
      </instancedMesh>

      {/* Hot-aisle containment: polycarbonate roofs and end doors with aluminium frames. */}
      {hotAisles.map((x) => (
        <group key={x}>
          <mesh position={[x, RACK.height + 0.03, ROW_MID]} rotation-x={-Math.PI / 2} material={tex.poly}>
            <planeGeometry args={[AISLE_W, ROW_LEN + 0.9]} />
          </mesh>
          {[RACK.zStart - 0.45, RACK.zEnd + 0.45].map((z) => (
            <mesh key={z} position={[x, RACK.height / 2, z]} material={tex.poly}>
              <planeGeometry args={[AISLE_W, RACK.height]} />
            </mesh>
          ))}
        </group>
      ))}
      <instancedMesh ref={doorFrames} args={[undefined, undefined, 64]} material={tex.steel}>
        <boxGeometry />
      </instancedMesh>

      {/* Overhead infrastructure: ladder trays with cable bundles, busway tap boxes, light fixtures. */}
      <instancedMesh ref={rails} args={[undefined, undefined, rowPairs * 4]} material={tex.steel}>
        <boxGeometry />
      </instancedMesh>
      <instancedMesh ref={rungs} args={[undefined, undefined, rowPairs * 2 * 110]} material={tex.steel}>
        <boxGeometry />
      </instancedMesh>
      <instancedMesh ref={bundles} args={[undefined, undefined, rowPairs * 6]} material={tex.cable}>
        <cylinderGeometry args={[0.035, 0.035, 1, 6]} />
      </instancedMesh>
      <instancedMesh ref={taps} args={[undefined, undefined, rowPairs * 2 * 14]} material={tex.darkSteel}>
        <boxGeometry />
      </instancedMesh>
      <instancedMesh ref={housings} args={[undefined, undefined, rowPairs * 2 * 12]} material={tex.darkSteel}>
        <boxGeometry />
      </instancedMesh>
      <instancedMesh ref={fixtures} args={[undefined, undefined, rowPairs * 2 * 12]} material={tex.fixture}>
        <boxGeometry />
      </instancedMesh>

      {/* Lighting: cool-white downlights along the centre aisle, a little ambient from the walls. */}
      <hemisphereLight args={["#2a3550", "#0a0c10", 0.35]} />
      {Array.from({ length: q.aisleLights }, (_, i) => {
        const z = RACK.zStart - 1 + ((RACK.zEnd - RACK.zStart + 2) * i) / Math.max(1, q.aisleLights - 1);
        return <pointLight key={i} position={[0, HALL_CEILING - 0.4, z]} color="#d6e4ff" intensity={28} distance={16} decay={2} />;
      })}
      {!q.mobile && <pointLight position={[-(ROW_X + 1.5 * ROW_PITCH), HALL_CEILING - 0.4, 0]} color="#d6e4ff" intensity={20} distance={14} decay={2} />}
      {!q.mobile && <pointLight position={[ROW_X + 1.5 * ROW_PITCH, HALL_CEILING - 0.4, 0]} color="#d6e4ff" intensity={20} distance={14} decay={2} />}

      <points ref={motes} geometry={moteGeom} frustumCulled={false}>
        <pointsMaterial map={tex.dot} color={new Color("#9fc4ff").multiplyScalar(1.4)} size={0.006} sizeAttenuation transparent opacity={0} depthWrite={false} blending={AdditiveBlending} />
      </points>

      <Server q={q} progress={progress} />
    </group>
  );
}
