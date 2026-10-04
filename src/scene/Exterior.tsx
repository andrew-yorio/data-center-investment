import { MeshReflectorMaterial, Stars } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { AdditiveBlending, Color, type DirectionalLight, DoubleSide, type Group, type InstancedMesh, MeshStandardMaterial, Object3D, Path, Shape, ShapeGeometry, type Texture } from "three";
import { DOOR, MODULE, SPINE, ramp } from "./path";
import type { Quality } from "./quality";
import { chainlinkTexture, corrugatedMaps, glowTexture, louvreMaps, type MapSet, officeGlassTexture, paintedMetalMaps, pavementMaps, roofMaps } from "./textures";
import { lightConeMaterial, skyMaterial } from "./materials";

const dummy = new Object3D();

/** Clone a map set with its own tiling. The GPU upload is shared through the texture source. */
function tiled(set: MapSet, rx: number, ry: number): MapSet {
  const clone = (t: Texture) => {
    const c = t.clone();
    c.repeat.set(rx, ry);
    return c;
  };
  return { map: clone(set.map), normalMap: clone(set.normalMap), ormMap: clone(set.ormMap) } as MapSet;
}

function pbr(set: MapSet, extra: Partial<MeshStandardMaterial> = {}): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    roughnessMap: set.ormMap,
    metalnessMap: set.ormMap,
    aoMap: set.ormMap,
    roughness: 1,
    metalness: 1,
  });
  Object.assign(m, extra);
  return m;
}

const { w: MW, h: MH, len: ML, pitch: MP, count: MC, base: MB } = MODULE;
const LAMP = new Color("#dfeaff").multiplyScalar(7); // HDR: blooms
const MOON = "#9fb4e6";
const FAR_ROW_Z = SPINE.z - SPINE.w / 2 - ML / 2 - 0.6; // centre of the second row of modules, beyond the spine
const SPINE_LEN = MP * MC + 2;
const LOT_Z = 20; // front parking lot
const ROAD_Z = 36;

/** Light poles: along the front lot and the access road. */
const POLES: [number, number][] = [];
for (let i = 0; i < 6; i++) POLES.push([-30 + i * 12, LOT_Z + 6]);
for (let i = 0; i < 4; i++) POLES.push([-24 + i * 16, ROAD_Z - 5]);

/** Module centres: the near row faces the lot (doors toward +z); the far row mirrors it beyond the spine. */
const MODULES: { x: number; z: number; far: boolean }[] = [];
for (let i = 0; i < MC; i++) {
  const x = (i - (MC - 1) / 2) * MP;
  MODULES.push({ x, z: 0, far: false });
  MODULES.push({ x, z: FAR_ROW_Z, far: true });
}
const CAMERA_MODULE = MODULES.findIndex((m) => Math.abs(m.x) < 1e-6 && !m.far);
const UNIT_Z = [-4.5, 2.5]; // rooftop cooling units along each module

type Materials = ReturnType<typeof useExteriorMaterials>;

/** A prefabricated data-hall module on a plinth: corrugated walls, roof plant, end door with a lamp. */
function Module({ x, z, far, open, tex }: { x: number; z: number; far: boolean; open: boolean; tex: Materials }) {
  const endGeom = useMemo(() => {
    if (!open) return null;
    const shape = new Shape();
    shape.moveTo(-MW / 2, 0);
    shape.lineTo(MW / 2, 0);
    shape.lineTo(MW / 2, MH);
    shape.lineTo(-MW / 2, MH);
    shape.closePath();
    const hole = new Path();
    hole.moveTo(-DOOR.w / 2, 0);
    hole.lineTo(DOOR.w / 2, 0);
    hole.lineTo(DOOR.w / 2, DOOR.h);
    hole.lineTo(-DOOR.w / 2, DOOR.h);
    hole.closePath();
    shape.holes.push(hole);
    return new ShapeGeometry(shape);
  }, [open]);
  return (
    <group position={[x, 0, z]} rotation-y={far ? Math.PI : 0}>
      {/* Plinth */}
      <mesh position={[0, MB / 2, 0]} material={tex.steelDark} castShadow>
        <boxGeometry args={[MW + 0.3, MB, ML + 0.3]} />
      </mesh>
      {/* Walls */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (MW / 2), MB + MH / 2, 0]} rotation-y={(s * Math.PI) / 2} material={tex.cladLong} castShadow receiveShadow>
          <planeGeometry args={[ML, MH]} />
        </mesh>
      ))}
      <mesh position={[0, MB + MH / 2, -ML / 2]} rotation-y={Math.PI} material={tex.cladEnd} castShadow receiveShadow>
        <planeGeometry args={[MW, MH]} />
      </mesh>
      {open && endGeom ? (
        <mesh position={[0, MB, ML / 2]} geometry={endGeom} material={tex.cladEndCut} castShadow receiveShadow />
      ) : (
        <mesh position={[0, MB + MH / 2, ML / 2]} material={tex.cladEnd} castShadow receiveShadow>
          <planeGeometry args={[MW, MH]} />
        </mesh>
      )}
      {/* Door: closed panel, or swung open against the wall */}
      <mesh
        position={open ? [DOOR.w / 2 + 0.03, MB + DOOR.h / 2, ML / 2 + DOOR.w / 2] : [0, MB + DOOR.h / 2, ML / 2 + 0.03]}
        rotation-y={open ? Math.PI / 2 : 0}
        material={tex.door}
      >
        <boxGeometry args={[DOOR.w, DOOR.h, 0.06]} />
      </mesh>
      {/* Steps and door lamp */}
      <mesh position={[0, MB / 2 - 0.09, ML / 2 + 0.55]} material={tex.steel}>
        <boxGeometry args={[DOOR.w + 0.6, MB - 0.18, 0.8]} />
      </mesh>
      <mesh position={[0, MB + DOOR.h + 0.35, ML / 2 + 0.12]} material={tex.lamp}>
        <boxGeometry args={[0.45, 0.14, 0.24]} />
      </mesh>
      {/* Roof with edge trim and two cooling units */}
      <mesh position={[0, MB + MH, 0]} rotation-x={-Math.PI / 2} material={tex.roof} receiveShadow>
        <planeGeometry args={[MW, ML]} />
      </mesh>
      {[[0, ML / 2, MW + 0.1, 0.12], [0, -ML / 2, MW + 0.1, 0.12], [MW / 2, 0, 0.12, ML], [-MW / 2, 0, 0.12, ML]].map(([ex, ez, sx, sz], i) => (
        <mesh key={i} position={[ex, MB + MH + 0.08, ez]} material={tex.steelDark}>
          <boxGeometry args={[sx, 0.18, sz]} />
        </mesh>
      ))}
      {UNIT_Z.map((uz) => (
        <group key={uz} position={[0, MB + MH + 0.75, uz]}>
          <mesh material={tex.steel} castShadow>
            <boxGeometry args={[2.6, 1.3, 2.3]} />
          </mesh>
          <mesh position={[1.31, 0, 0]} rotation-y={Math.PI / 2} material={tex.louvre}>
            <planeGeometry args={[2, 1]} />
          </mesh>
          <mesh position={[-1.31, 0, 0]} rotation-y={-Math.PI / 2} material={tex.louvre}>
            <planeGeometry args={[2, 1]} />
          </mesh>
        </group>
      ))}
      {/* Conduit along one eave */}
      <mesh position={[MW / 2 + 0.12, MB + MH - 0.4, 0]} material={tex.steelDark}>
        <boxGeometry args={[0.18, 0.18, ML]} />
      </mesh>
    </group>
  );
}

function useExteriorMaterials() {
  return useMemo(() => {
    const clad = corrugatedMaps("#c4c8cd", 512);
    const concrete = pavementMaps("concrete", 512);
    const asphalt = pavementMaps("asphalt", 512);
    const louvre = louvreMaps(256);
    const steel = paintedMetalMaps("#7d838b", 256);
    const roof = roofMaps(256);
    return {
      cladLong: pbr(tiled(clad, ML / 3, MH / 3)),
      cladEnd: pbr(tiled(clad, MW / 3, MH / 3)),
      // The open end wall is a shape with the door cut out; ShapeGeometry UVs are in metres.
      cladEndCut: pbr(tiled(clad, 1 / 3, 1 / 3)),
      cladSpine: pbr(tiled(clad, SPINE_LEN / 3, SPINE.h / 3)),
      cladDark: pbr(tiled(corrugatedMaps("#4b5058", 256), 12 / 3, 1)),
      roof: pbr(tiled(roof, MW / 2, ML / 2)),
      concrete: tiled(concrete, 130 / 14, 100 / 14),
      asphaltFar: pbr(tiled(asphalt, 200, 200), { color: new Color("#3a3d42") }),
      road: pbr(tiled(asphalt, 40, 1), { color: new Color("#4a4d52") }),
      louvre: pbr(tiled(louvre, 1, 1)),
      steel: pbr(tiled(steel, 1, 1)),
      steelDark: pbr(tiled(steel, 1, 1), { color: new Color("#4a5059") }),
      door: new MeshStandardMaterial({ color: "#2b3038", roughness: 0.5, metalness: 0.6 }),
      lamp: new MeshStandardMaterial({ color: "#20242a", emissive: LAMP, emissiveIntensity: 1, roughness: 0.5, metalness: 0.4 }),
      office: officeGlassTexture(512),
      chainlink: chainlinkTexture(128),
      glow: glowTexture(256, 1.8),
    };
  }, []);
}

export function Exterior({ q, reflections, progress }: { q: Quality; reflections: boolean; progress: { p: number } }) {
  const group = useRef<Group>(null);
  const moon = useRef<DirectionalLight>(null);
  const fanBlades = useRef<InstancedMesh>(null);
  const shrouds = useRef<InstancedMesh>(null);
  const grilles = useRef<InstancedMesh>(null);
  const stripes = useRef<InstancedMesh>(null);
  const roadDashes = useRef<InstancedMesh>(null);
  const fencePosts = useRef<InstancedMesh>(null);
  const cones = useRef<InstancedMesh>(null);
  const pools = useRef<InstancedMesh>(null);
  const heads = useRef<InstancedMesh>(null);
  const polesMesh = useRef<InstancedMesh>(null);
  const tex = useExteriorMaterials();

  // Two fans on each rooftop cooling unit, two units per module.
  const fanSlots = useMemo(() => {
    const out: [number, number][] = [];
    for (const m of MODULES) for (const uz of UNIT_Z) for (const fx of [-0.65, 0.65]) out.push([m.x + fx, m.z + (m.far ? -uz : uz)]);
    return out;
  }, []);
  const FAN_Y = MB + MH + 1.4;

  useLayoutEffect(() => {
    const set = (mesh: InstancedMesh | null, i: number) => {
      dummy.updateMatrix();
      mesh?.setMatrixAt(i, dummy.matrix);
    };
    fanSlots.forEach(([x, z], i) => {
      dummy.position.set(x, FAN_Y + 0.12, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      set(shrouds.current, i);
      dummy.position.set(x, FAN_Y + 0.25, z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      set(grilles.current, i);
    });
    shrouds.current!.instanceMatrix.needsUpdate = true;
    grilles.current!.instanceMatrix.needsUpdate = true;

    let n = 0;
    for (const z0 of [LOT_Z, LOT_Z + 11]) {
      for (let x = -30; x <= 30; x += 2.75) {
        dummy.position.set(x, 0.02, z0 + 2.5);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(0.12, 5, 1);
        set(stripes.current, n++);
      }
    }
    stripes.current!.count = n;
    stripes.current!.instanceMatrix.needsUpdate = true;

    n = 0;
    for (let x = -150; x < 150; x += 6) {
      dummy.position.set(x, 0.02, ROAD_Z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(2.2, 0.15, 1);
      set(roadDashes.current, n++);
    }
    roadDashes.current!.count = n;
    roadDashes.current!.instanceMatrix.needsUpdate = true;

    n = 0;
    const fx = 60, fz0 = -44, fz1 = ROAD_Z - 4;
    const post = (x: number, z: number) => {
      dummy.position.set(x, 1.2, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      set(fencePosts.current, n++);
    };
    for (let x = -fx; x <= fx; x += 3) { post(x, fz0); post(x, fz1); }
    for (let z = fz0; z <= fz1; z += 3) { post(-fx, z); post(fx, z); }
    fencePosts.current!.count = n;
    fencePosts.current!.instanceMatrix.needsUpdate = true;

    POLES.forEach(([x, z], i) => {
      dummy.position.set(x, 4.5, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      set(polesMesh.current, i);
      dummy.position.set(x, 9.05, z - 0.9);
      set(heads.current, i);
      dummy.position.set(x, 4.6, z - 0.9);
      set(cones.current, i);
      dummy.position.set(x, 0.03, z - 0.9);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      set(pools.current, i);
    });
    for (const m of [polesMesh, heads, cones, pools]) m.current!.instanceMatrix.needsUpdate = true;
  }, [fanSlots, FAN_Y]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const g = group.current;
    if (!g) return;
    // Visible while the camera is outside the module; the moon fades before the interior takes over.
    g.visible = progress.p < 0.245;
    if (!g.visible) return;
    if (moon.current) moon.current.intensity = 0.55 * (1 - ramp(progress.p, 0.17, 0.24));
    if (fanBlades.current) {
      fanSlots.forEach(([x, z], i) => {
        dummy.position.set(x, FAN_Y + 0.18, z);
        dummy.rotation.set(0, t * 2.6 + i * 1.7, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        fanBlades.current!.setMatrixAt(i, dummy.matrix);
      });
      fanBlades.current.instanceMatrix.needsUpdate = true;
    }
  });

  const coneMat = useMemo(() => lightConeMaterial(), []);
  const sky = useMemo(() => skyMaterial(), []);
  const headMat = useMemo(() => new MeshStandardMaterial({ color: "#20242a", emissive: LAMP, emissiveIntensity: 1, roughness: 0.5, metalness: 0.4 }), []);
  const cam = MODULES[CAMERA_MODULE];
  const walkLights = q.mobile ? 3 : 6;

  return (
    <group ref={group}>
      <mesh material={sky} frustumCulled={false}>
        <sphereGeometry args={[1400, 32, 16]} />
      </mesh>
      <Stars radius={900} depth={300} count={q.mobile ? 900 : 2200} factor={5} saturation={0.1} fade speed={0.2} />

      {/* Lighting: moonlight from the upper left, sky bounce, pole lamps, walkway lights, the open module's door lamp. */}
      <hemisphereLight args={["#1c2c4d", "#07090c", 0.5]} />
      <directionalLight
        ref={moon}
        position={[-120, 95, -30]}
        intensity={0.55}
        color={MOON}
        castShadow={q.shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        shadow-camera-near={10}
        shadow-camera-far={400}
        shadow-bias={-0.0008}
        shadow-normalBias={0.4}
      />
      {POLES.slice(0, q.poleLights).map(([x, z], i) => (
        <pointLight key={i} position={[x, 8.8, z - 0.9]} color="#dfeaff" intensity={260} distance={46} decay={2} />
      ))}
      <pointLight position={[cam.x, MB + DOOR.h + 0.2, cam.z + ML / 2 + 0.6]} color="#dfeaff" intensity={14} distance={12} decay={2} />
      {Array.from({ length: walkLights }, (_, i) => (
        <pointLight key={`walk${i}`} position={[(i - (walkLights - 1) / 2) * MP + MP / 2, 3.2, 0]} color="#c9d8f2" intensity={22} distance={16} decay={2} />
      ))}
      <pointLight position={[26, 3.5, 20.5]} color="#cfdcf0" intensity={40} distance={20} decay={2} />

      {/* Ground: far ground, the concrete pad (reflective on desktop), lot stripes and the road. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} material={tex.asphaltFar} receiveShadow>
        <planeGeometry args={[1600, 1600]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -4]} receiveShadow>
        <planeGeometry args={[130, 100]} />
        {reflections ? (
          <MeshReflectorMaterial
            map={tex.concrete.map}
            normalMap={tex.concrete.normalMap}
            roughnessMap={tex.concrete.ormMap}
            metalnessMap={tex.concrete.ormMap}
            roughness={1}
            metalness={1}
            resolution={1024}
            blur={[500, 120]}
            mixBlur={1}
            mixStrength={3.5}
            mixContrast={1}
            depthScale={0.6}
            minDepthThreshold={0.6}
            maxDepthThreshold={1.6}
            mirror={0.35}
            reflectorOffset={0.02}
          />
        ) : (
          <meshStandardMaterial map={tex.concrete.map} normalMap={tex.concrete.normalMap} roughnessMap={tex.concrete.ormMap} metalnessMap={tex.concrete.ormMap} roughness={1} metalness={1} />
        )}
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, ROAD_Z]} material={tex.road} receiveShadow>
        <planeGeometry args={[320, 9]} />
      </mesh>
      <instancedMesh ref={stripes} args={[undefined, undefined, 60]}>
        <planeGeometry />
        <meshStandardMaterial color="#c9ccd0" roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={roadDashes} args={[undefined, undefined, 60]}>
        <planeGeometry />
        <meshStandardMaterial color="#d8d9d4" roughness={0.6} />
      </instancedMesh>
      <mesh position={[0, 0.08, ROAD_Z - 4.6]} material={tex.steel} castShadow>
        <boxGeometry args={[130, 0.16, 0.3]} />
      </mesh>

      {/* The modules, and the spine corridor joining their far ends. */}
      {MODULES.map((m, i) => (
        <Module key={i} x={m.x} z={m.z} far={m.far} open={i === CAMERA_MODULE} tex={tex} />
      ))}
      <mesh position={[0, MB / 2, SPINE.z]} material={tex.steelDark} castShadow>
        <boxGeometry args={[SPINE_LEN + 0.3, MB, SPINE.w + 0.3]} />
      </mesh>
      <mesh position={[0, MB + SPINE.h / 2, SPINE.z]} material={tex.cladSpine} castShadow receiveShadow>
        <boxGeometry args={[SPINE_LEN, SPINE.h, SPINE.w]} />
      </mesh>
      <mesh position={[0, MB + SPINE.h + 0.06, SPINE.z]} material={tex.steelDark}>
        <boxGeometry args={[SPINE_LEN + 0.1, 0.12, SPINE.w + 0.1]} />
      </mesh>
      {/* Vestibules between each module and the spine */}
      {MODULES.map((m, i) => (
        <mesh key={i} position={[m.x, MB + 1.4, m.far ? SPINE.z - SPINE.w / 2 - 0.3 : SPINE.z + SPINE.w / 2 + 0.3]} material={tex.steel} castShadow>
          <boxGeometry args={[2.2, 2.8, 0.7]} />
        </mesh>
      ))}

      {/* Rooftop fans: shrouds, grilles, spinning blades. */}
      <instancedMesh ref={shrouds} args={[undefined, undefined, fanSlots.length]} material={tex.steelDark} castShadow>
        <cylinderGeometry args={[0.52, 0.52, 0.26, 16, 1, true]} />
      </instancedMesh>
      <instancedMesh ref={grilles} args={[undefined, undefined, fanSlots.length]}>
        <circleGeometry args={[0.5, 16]} />
        <meshStandardMaterial color="#090b0e" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={fanBlades} args={[undefined, undefined, fanSlots.length]}>
        <boxGeometry args={[0.9, 0.025, 0.16]} />
        <meshStandardMaterial color="#5a6068" roughness={0.6} metalness={0.5} />
      </instancedMesh>

      {/* Power yard on the west side: two generator containers with exhaust stacks, transformers, switchgear. */}
      <group position={[-(MC / 2) * MP - 9, 0, -8]}>
        {[-3.5, 3.5].map((z) => (
          <group key={z} position={[0, 0, z]}>
            <mesh position={[0, 1.6, 0]} material={tex.cladDark} castShadow>
              <boxGeometry args={[12.2, 2.9, 2.5]} />
            </mesh>
            <mesh position={[-5, 3.9, 0.6]} material={tex.steelDark} castShadow>
              <cylinderGeometry args={[0.24, 0.24, 2, 10]} />
            </mesh>
            <mesh position={[6.11, 1.6, 0]} rotation-y={Math.PI / 2} material={tex.louvre}>
              <planeGeometry args={[2.2, 2.2]} />
            </mesh>
          </group>
        ))}
        {[-14, -19].map((z) => (
          <mesh key={z} position={[2, 1.3, z]} material={tex.steelDark} castShadow>
            <boxGeometry args={[3, 2.6, 3.4]} />
          </mesh>
        ))}
        <mesh position={[-4, 1.4, -16]} material={tex.steel} castShadow>
          <boxGeometry args={[6, 2.8, 2.4]} />
        </mesh>
      </group>

      {/* NOC / office module near the entrance, with a lit window band. */}
      <group position={[26, 0, 15]}>
        <mesh position={[0, MB / 2, 0]} material={tex.steelDark}>
          <boxGeometry args={[12.4, MB, 4.4]} />
        </mesh>
        <mesh position={[0, MB + 1.7, 0]} material={tex.cladLong} castShadow>
          <boxGeometry args={[12.2, 3.4, 4.2]} />
        </mesh>
        <mesh position={[0, MB + 2.1, 2.12]}>
          <planeGeometry args={[10.5, 1.5]} />
          <meshStandardMaterial map={tex.office} emissiveMap={tex.office} emissive={new Color("#ffffff")} emissiveIntensity={1.5} color="#0f141c" roughness={0.08} metalness={0.6} />
        </mesh>
        <mesh position={[0, MB + 3.5, 0]} material={tex.steelDark}>
          <boxGeometry args={[12.4, 0.2, 4.4]} />
        </mesh>
      </group>

      {/* Perimeter fence: posts and chain-link. */}
      <instancedMesh ref={fencePosts} args={[undefined, undefined, 220]} material={tex.steelDark}>
        <cylinderGeometry args={[0.045, 0.045, 2.4, 6]} />
      </instancedMesh>
      {[
        [0, -44, 120, 0],
        [0, ROAD_Z - 4, 120, 0],
        [-60, -6, 76, Math.PI / 2],
        [60, -6, 76, Math.PI / 2],
      ].map(([x, z, len, rot], i) => (
        <mesh key={i} position={[x, 1.2, z]} rotation-y={rot}>
          <planeGeometry args={[len, 2.4]} />
          <meshStandardMaterial map={tex.chainlink} transparent alphaTest={0.25} side={DoubleSide} color="#9aa0a6" roughness={0.5} metalness={0.7} />
        </mesh>
      ))}

      {/* Light poles: shaft, luminaire (HDR emissive), haze cone and ground pool. */}
      <instancedMesh ref={polesMesh} args={[undefined, undefined, POLES.length]} material={tex.steelDark} castShadow>
        <cylinderGeometry args={[0.1, 0.16, 9, 8]} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, POLES.length]} material={headMat}>
        <boxGeometry args={[0.9, 0.22, 0.5]} />
      </instancedMesh>
      <instancedMesh ref={cones} args={[undefined, undefined, POLES.length]} material={coneMat}>
        <coneGeometry args={[5.5, 9, 24, 1, true]} />
      </instancedMesh>
      <instancedMesh ref={pools} args={[undefined, undefined, POLES.length]}>
        <planeGeometry args={[16, 16]} />
        <meshBasicMaterial map={tex.glow} color="#5f6f8f" transparent opacity={0.55} blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}
