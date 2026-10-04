import { MeshReflectorMaterial } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, type Group, InstancedBufferAttribute, type InstancedMesh, MeshStandardMaterial, Object3D, Path, type Points, Shape, ShapeGeometry, type Texture } from "three";
import { DOOR, FLOOR_Y, MODULE, RACK, RACK_FRONT_X, ROW_X, TARGET_Z, ramp } from "./path";
import type { Quality } from "./quality";
import { ceilingMaps, dotTexture, floorTileMaps, graphiteMaps, type MapSet, rackDoorMaps, rng, wallPanelMaps } from "./textures";
import { ledMaterial, type LedMaterial } from "./materials";
import { Server } from "./Server";

const dummy = new Object3D();
const INNER_W = MODULE.w - 0.2;
const INNER_L = MODULE.len - 0.2;
const CEIL = MODULE.ceiling;
const ROW_LEN = RACK.zEnd - RACK.zStart + RACK.pitch;
const ROW_MID = (RACK.zStart + RACK.zEnd) / 2;
const U = 0.04445;
const RACK_BASE = 0.1;
const STRIP = new Color("#dbe6ff").multiplyScalar(3.5); // HDR fixture emissive

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

/** End wall of the module with its doorway cut out. ShapeGeometry UVs are in metres. */
function endWallGeometry() {
  const shape = new Shape();
  shape.moveTo(-INNER_W / 2, 0);
  shape.lineTo(INNER_W / 2, 0);
  shape.lineTo(INNER_W / 2, CEIL);
  shape.lineTo(-INNER_W / 2, CEIL);
  shape.closePath();
  const hole = new Path();
  hole.moveTo(-DOOR.w / 2, 0);
  hole.lineTo(DOOR.w / 2, 0);
  hole.lineTo(DOOR.w / 2, DOOR.h);
  hole.lineTo(-DOOR.w / 2, DOOR.h);
  hole.closePath();
  shape.holes.push(hole);
  return new ShapeGeometry(shape);
}

/**
 * Inside one module: a single cold aisle between two rows of racks, chimney
 * containment up to a low ceiling, ladder trays, strip fixtures, and a door
 * at the far end into the lit spine corridor.
 */
export function Hall({ q, reflections, progress }: { q: Quality; reflections: boolean; progress: { p: number } }) {
  const group = useRef<Group>(null);
  const bodies = useRef<InstancedMesh>(null);
  const fronts = useRef<InstancedMesh>(null);
  const leds = useRef<InstancedMesh>(null);
  const fixtures = useRef<InstancedMesh>(null);
  const housings = useRef<InstancedMesh>(null);
  const rungs = useRef<InstancedMesh>(null);
  const rails = useRef<InstancedMesh>(null);
  const bundles = useRef<InstancedMesh>(null);
  const motes = useRef<Points>(null);
  const ledMat = useMemo<LedMaterial>(() => ledMaterial(), []);

  const perRow = Math.floor((RACK.zEnd - RACK.zStart) / RACK.pitch) + 1;
  const rackCount = 2 * perRow;
  const ledsPerRack = q.ledsPerRack;

  const tex = useMemo(() => {
    const floor = floorTileMaps(false, 512);
    const perf = floorTileMaps(true, 512);
    const door = rackDoorMaps();
    const graphite = graphiteMaps("#1d2024", 256);
    const wall = wallPanelMaps(512);
    const ceiling = ceilingMaps(256);
    return {
      floor: tiled(floor, INNER_W / 1.2, INNER_L / 1.2),
      perf: pbr(tiled(perf, 0.5, ROW_LEN / 1.2)),
      door: pbr(door),
      graphite: pbr(graphite),
      wallLong: pbr(tiled(wall, INNER_L / 2, CEIL / 2)),
      wallEnd: pbr(tiled(wall, 1 / 2, 1 / 2)),
      panel: pbr(tiled(wall, ROW_LEN / 2, 0.5), { color: new Color("#d8dce2") }),
      ceiling: pbr(tiled(ceiling, INNER_W / 2.4, INNER_L / 2.4)),
      spine: new MeshStandardMaterial({ color: "#a7acb3", roughness: 0.7, side: BackSide }),
      steel: new MeshStandardMaterial({ color: "#8b9098", roughness: 0.45, metalness: 0.8 }),
      darkSteel: new MeshStandardMaterial({ color: "#3a3e45", roughness: 0.5, metalness: 0.7 }),
      cable: new MeshStandardMaterial({ color: "#14213a", roughness: 0.7, metalness: 0.1 }),
      fixture: new MeshStandardMaterial({ color: "#e8eef8", emissive: STRIP, emissiveIntensity: 1, roughness: 0.4 }),
      dot: dotTexture(64),
    };
  }, []);
  const endGeom = useMemo(() => endWallGeometry(), []);

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

    for (const s of [-1, 1]) {
      const cx = s * ROW_X;
      const faceDir = -s; // fronts face the centre aisle
      const faceX = cx + faceDir * (RACK.depth / 2);
      const yaw = faceDir > 0 ? Math.PI / 2 : -Math.PI / 2;
      for (let j = 0; j < perRow; j++) {
        const z = RACK.zStart + j * RACK.pitch;
        const isTarget = s === -1 && Math.abs(z - TARGET_Z) < 1e-6;
        dummy.position.set(cx, RACK.height / 2, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(RACK.depth, RACK.height, RACK.width - 0.01);
        place(bodies.current, n);
        dummy.position.set(faceX + faceDir * 0.004, RACK.height / 2 + 0.04, z);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(isTarget ? 0.0001 : RACK.width - 0.04, RACK.height - 0.14, 1);
        place(fronts.current, n);
        n++;
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
    for (const m of [bodies, fronts, leds]) m.current!.instanceMatrix.needsUpdate = true;
    bodies.current!.count = fronts.current!.count = n;
    leds.current!.count = l;
    const g = leds.current!.geometry;
    g.setAttribute("aPhase", new InstancedBufferAttribute(phase, 1));
    g.setAttribute("aTint", new InstancedBufferAttribute(tint, 3));

    // Fixtures down the centre of the aisle.
    let f = 0;
    for (let z = RACK.zStart - 0.3; z <= RACK.zEnd + 0.6; z += 2.4) {
      dummy.position.set(0, CEIL - 0.1, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.1, 0.03, 1.5);
      place(fixtures.current, f);
      dummy.position.set(0, CEIL - 0.07, z);
      dummy.scale.set(0.18, 0.08, 1.6);
      place(housings.current, f);
      f++;
    }
    fixtures.current!.count = housings.current!.count = f;
    fixtures.current!.instanceMatrix.needsUpdate = true;
    housings.current!.instanceMatrix.needsUpdate = true;

    // Ladder trays above each rack front, with cable bundles.
    let rg = 0, rl = 0, bd = 0;
    for (const s of [-1, 1]) {
      const cx = s * 0.85;
      for (const dx of [-0.2, 0.2]) {
        dummy.position.set(cx + dx, 2.85, ROW_MID);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.04, 0.1, ROW_LEN);
        place(rails.current, rl++);
      }
      for (let z = RACK.zStart; z <= RACK.zEnd; z += 0.3) {
        dummy.position.set(cx, 2.81, z);
        dummy.scale.set(0.4, 0.03, 0.03);
        place(rungs.current, rg++);
      }
      for (let b = 0; b < 3; b++) {
        dummy.position.set(cx - 0.12 + b * 0.12, 2.87, ROW_MID);
        dummy.rotation.set(Math.PI / 2, 0, 0);
        dummy.scale.set(1, ROW_LEN, 1);
        place(bundles.current, bd++);
      }
    }
    rails.current!.count = rl;
    rungs.current!.count = rg;
    bundles.current!.count = bd;
    for (const m of [rails, rungs, bundles]) m.current!.instanceMatrix.needsUpdate = true;
  }, [rackCount, ledsPerRack, perRow]);

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
        (m.material as { opacity: number }).opacity = 0.25 * ramp(p, 0.3, 0.38) * (1 - ramp(p, 0.6, 0.68));
      }
    }
  });

  const SPINE_Z = -INNER_L / 2 - 1.6;

  return (
    <group ref={group} visible={false} position={[0, FLOOR_Y, 0]}>
      {/* Floor: semi-gloss tiles (reflective on desktop) with perforated tiles in front of the racks. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <planeGeometry args={[INNER_W, INNER_L]} />
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

      {/* Walls, ceiling and the two end walls with doorways. */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (INNER_W / 2), CEIL / 2, 0]} rotation-y={(-s * Math.PI) / 2} material={tex.wallLong}>
          <planeGeometry args={[INNER_L, CEIL]} />
        </mesh>
      ))}
      <mesh position={[0, CEIL, 0]} rotation-x={Math.PI / 2} material={tex.ceiling}>
        <planeGeometry args={[INNER_W, INNER_L]} />
      </mesh>
      <mesh position={[0, 0, -INNER_L / 2]} geometry={endGeom} material={tex.wallEnd} />
      <mesh position={[0, 0, INNER_L / 2]} rotation-y={Math.PI} geometry={endGeom} material={tex.wallEnd} />
      {[-INNER_L / 2, INNER_L / 2].map((z) =>
        [[-DOOR.w / 2 - 0.04, DOOR.h / 2, 0.08, DOOR.h], [DOOR.w / 2 + 0.04, DOOR.h / 2, 0.08, DOOR.h], [0, DOOR.h + 0.04, DOOR.w + 0.16, 0.08]].map(([x, y, sx, sy], i) => (
          <mesh key={`${z}${i}`} position={[x, y, z]} material={tex.steel}>
            <boxGeometry args={[sx, sy, 0.2]} />
          </mesh>
        )),
      )}
      {/* Spine corridor beyond the far door: a lit stub so the doorway glows. */}
      <mesh position={[0, 1.4, SPINE_Z]} material={tex.spine}>
        <boxGeometry args={[3.0, 2.8, 3.1]} />
      </mesh>
      <mesh position={[0, 2.76, SPINE_Z]} material={tex.fixture}>
        <boxGeometry args={[0.1, 0.03, 2.4]} />
      </mesh>
      <pointLight position={[0, 2.4, SPINE_Z]} color="#e6edf8" intensity={6} distance={7} decay={2} />

      {/* Racks and chimney containment from rack top to ceiling. */}
      <instancedMesh ref={bodies} args={[undefined, undefined, rackCount]} material={tex.graphite}>
        <boxGeometry />
      </instancedMesh>
      <instancedMesh ref={fronts} args={[undefined, undefined, rackCount]} material={tex.door}>
        <planeGeometry />
      </instancedMesh>
      <instancedMesh ref={leds} args={[undefined, undefined, rackCount * ledsPerRack]} material={ledMat}>
        <planeGeometry />
      </instancedMesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * -RACK_FRONT_X, (RACK.height + CEIL) / 2, ROW_MID]} rotation-y={(s * Math.PI) / 2} material={tex.panel}>
          <planeGeometry args={[ROW_LEN + 0.6, CEIL - RACK.height]} />
        </mesh>
      ))}

      {/* Overhead: ladder trays with cable bundles, light fixtures, a sprinkler main. */}
      <instancedMesh ref={rails} args={[undefined, undefined, 4]} material={tex.steel}>
        <boxGeometry />
      </instancedMesh>
      <instancedMesh ref={rungs} args={[undefined, undefined, 120]} material={tex.steel}>
        <boxGeometry />
      </instancedMesh>
      <instancedMesh ref={bundles} args={[undefined, undefined, 6]} material={tex.cable}>
        <cylinderGeometry args={[0.035, 0.035, 1, 6]} />
      </instancedMesh>
      <instancedMesh ref={housings} args={[undefined, undefined, 12]} material={tex.darkSteel}>
        <boxGeometry />
      </instancedMesh>
      <instancedMesh ref={fixtures} args={[undefined, undefined, 12]} material={tex.fixture}>
        <boxGeometry />
      </instancedMesh>
      <mesh position={[0.45, CEIL - 0.18, 0]} rotation-x={Math.PI / 2} material={tex.steel}>
        <cylinderGeometry args={[0.03, 0.03, INNER_L - 0.4, 8]} />
      </mesh>

      {/* Lighting: cool-white downlights along the aisle, a little ambient from the walls. */}
      <hemisphereLight args={["#2a3550", "#0a0c10", 0.35]} />
      {Array.from({ length: q.aisleLights }, (_, i) => {
        const z = RACK.zStart - 0.5 + ((RACK.zEnd - RACK.zStart + 1) * i) / Math.max(1, q.aisleLights - 1);
        return <pointLight key={i} position={[0, CEIL - 0.35, z]} color="#d6e4ff" intensity={14} distance={12} decay={2} />;
      })}

      <points ref={motes} geometry={moteGeom} frustumCulled={false}>
        <pointsMaterial map={tex.dot} color="#9fc4ff" size={0.0025} sizeAttenuation transparent opacity={0} depthWrite={false} blending={AdditiveBlending} />
      </points>

      <Server q={q} progress={progress} />
    </group>
  );
}
