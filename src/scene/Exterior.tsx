import { MeshReflectorMaterial, Stars } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { AdditiveBlending, Color, type DirectionalLight, DoubleSide, type Group, type InstancedMesh, MeshStandardMaterial, Object3D, type Texture } from "three";
import { ANNEX, BUILDING, ramp } from "./path";
import type { Quality } from "./quality";
import { chainlinkTexture, facadeMaps, glowTexture, louvreMaps, type MapSet, officeGlassTexture, paintedMetalMaps, pavementMaps, roofMaps } from "./textures";
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

const { w: W, h: H, d: D } = BUILDING;
const LAMP = new Color("#dfeaff").multiplyScalar(7); // HDR: blooms
const MOON = "#9fb4e6";

/** Light poles: along the front lot and the access road. */
const POLES: [number, number][] = [];
for (let i = 0; i < 6; i++) POLES.push([-34 + i * 13.6, D / 2 + 14]);
for (let i = 0; i < 4; i++) POLES.push([-26 + i * 17, D / 2 + 31]);

export function Exterior({ q, reflections, progress }: { q: Quality; reflections: boolean; progress: { p: number } }) {
  const group = useRef<Group>(null);
  const moon = useRef<DirectionalLight>(null);
  const fanBlades = useRef<InstancedMesh>(null);
  const stripes = useRef<InstancedMesh>(null);
  const roadDashes = useRef<InstancedMesh>(null);
  const fencePosts = useRef<InstancedMesh>(null);
  const louvres = useRef<InstancedMesh>(null);
  const cones = useRef<InstancedMesh>(null);
  const pools = useRef<InstancedMesh>(null);
  const heads = useRef<InstancedMesh>(null);
  const polesMesh = useRef<InstancedMesh>(null);
  const shrouds = useRef<InstancedMesh>(null);
  const grilles = useRef<InstancedMesh>(null);

  const tex = useMemo(() => {
    const facade = facadeMaps(512);
    const concrete = pavementMaps("concrete", 512);
    const asphalt = pavementMaps("asphalt", 512);
    const louvre = louvreMaps(256);
    const steel = paintedMetalMaps("#7d838b", 256);
    const roof = roofMaps(256);
    return {
      facadeFront: pbr(tiled(facade, W / 6, H / 7)),
      facadeSide: pbr(tiled(facade, D / 6, H / 7)),
      roof: pbr(tiled(roof, W / 2, D / 2)),
      concrete: tiled(concrete, 150 / 14, 110 / 14),
      asphaltFar: pbr(tiled(asphalt, 200, 200), { color: new Color("#3a3d42") }),
      road: pbr(tiled(asphalt, 40, 1), { color: new Color("#4a4d52") }),
      louvre: pbr(tiled(louvre, 1, 1)),
      louvreWide: pbr(tiled(louvre, 2.5, 1)),
      steel: pbr(tiled(steel, 1, 1)),
      steelDark: pbr(tiled(steel, 1, 1), { color: new Color("#4a5059") }),
      office: officeGlassTexture(512),
      chainlink: chainlinkTexture(128),
      glow: glowTexture(256, 1.8),
    };
  }, []);

  // Chillers: 3 rows x 5 units on the roof, each with 4 fans.
  const chillers = useMemo(() => {
    const out: [number, number][] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) out.push([-24 + c * 12, -11 + r * 11]);
    return out;
  }, []);
  const fanSlots = useMemo(() => {
    const out: [number, number][] = [];
    for (const [x, z] of chillers) for (let i = 0; i < 4; i++) out.push([x - 2.7 + i * 1.8, z]);
    return out;
  }, [chillers]);

  useLayoutEffect(() => {
    const set = (mesh: InstancedMesh | null, i: number) => {
      dummy.updateMatrix();
      mesh?.setMatrixAt(i, dummy.matrix);
    };
    // Fan shrouds, grilles, blades.
    fanSlots.forEach(([x, z], i) => {
      dummy.position.set(x, H + 2.4 + 0.18, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      set(shrouds.current, i);
      dummy.position.set(x, H + 2.4 + 0.37, z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      set(grilles.current, i);
    });
    shrouds.current!.instanceMatrix.needsUpdate = true;
    grilles.current!.instanceMatrix.needsUpdate = true;

    // Parking stripes: two rows of bays in the front lot.
    let n = 0;
    for (const z0 of [D / 2 + 8, D / 2 + 19]) {
      for (let x = -33; x <= 33; x += 2.75) {
        dummy.position.set(x, 0.02, z0 + 2.5);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(0.12, 5, 1);
        set(stripes.current, n++);
      }
    }
    stripes.current!.count = n;
    stripes.current!.instanceMatrix.needsUpdate = true;

    // Road center dashes.
    n = 0;
    for (let x = -150; x < 150; x += 6) {
      dummy.position.set(x, 0.02, D / 2 + 27);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(2.2, 0.15, 1);
      set(roadDashes.current, n++);
    }
    roadDashes.current!.count = n;
    roadDashes.current!.instanceMatrix.needsUpdate = true;

    // Perimeter fence posts.
    n = 0;
    const fx = 74, fz0 = -50, fz1 = D / 2 + 36;
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

    // Intake louvres low on the side and back walls.
    n = 0;
    for (const side of [-1, 1]) for (let z = -D / 2 + 4; z < D / 2 - 3; z += 6) {
      dummy.position.set(side * (W / 2 + 0.06), 3, z);
      dummy.rotation.set(0, (side * Math.PI) / 2, 0);
      dummy.scale.set(3.6, 3, 1);
      set(louvres.current, n++);
    }
    for (let x = -W / 2 + 4; x < W / 2 - 3; x += 6) {
      dummy.position.set(x, 3, -D / 2 - 0.06);
      dummy.rotation.set(0, Math.PI, 0);
      dummy.scale.set(3.6, 3, 1);
      set(louvres.current, n++);
    }
    louvres.current!.count = n;
    louvres.current!.instanceMatrix.needsUpdate = true;

    // Poles, heads, cones and ground pools.
    POLES.forEach(([x, z], i) => {
      dummy.position.set(x, 4.5, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      set(polesMesh.current, i);
      dummy.position.set(x, 9.05, z - 0.9);
      set(heads.current, i);
      dummy.position.set(x, 4.6, z - 0.9);
      dummy.scale.set(1, 1, 1);
      set(cones.current, i);
      dummy.position.set(x, 0.03, z - 0.9);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      set(pools.current, i);
    });
    for (const m of [polesMesh, heads, cones, pools]) m.current!.instanceMatrix.needsUpdate = true;
  }, [fanSlots]);

  useFrame((state) => {
    const p = state.clock.elapsedTime;
    const g = group.current;
    if (!g) return;
    // Visible while the camera is outside the building; the moon fades before the hall takes over.
    g.visible = progress.p < 0.235;
    if (!g.visible) return;
    if (moon.current) moon.current.intensity = 0.55 * (1 - ramp(progress.p, 0.17, 0.23));
    // Chiller fans turn slowly; from this distance only the motion reads.
    if (fanBlades.current) {
      fanSlots.forEach(([x, z], i) => {
        dummy.position.set(x, H + 2.4 + 0.28, z);
        dummy.rotation.set(0, p * 2.2 + i * 1.7, 0);
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

  return (
    <group ref={group}>
      <mesh material={sky} frustumCulled={false}>
        <sphereGeometry args={[1400, 32, 16]} />
      </mesh>
      <Stars radius={900} depth={300} count={q.mobile ? 900 : 2200} factor={5} saturation={0.1} fade speed={0.2} />

      {/* Lighting: moonlight from the upper left, sky bounce, and the pole lamps. */}
      <hemisphereLight args={["#1c2c4d", "#07090c", 0.5]} />
      <directionalLight
        ref={moon}
        position={[-120, 95, -30]}
        intensity={0.55}
        color={MOON}
        castShadow={q.shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-95}
        shadow-camera-right={95}
        shadow-camera-top={95}
        shadow-camera-bottom={-95}
        shadow-camera-near={10}
        shadow-camera-far={400}
        shadow-bias={-0.0008}
        shadow-normalBias={0.4}
      />
      {POLES.slice(0, q.poleLights).map(([x, z], i) => (
        <pointLight key={i} position={[x, 8.8, z - 0.9]} color="#dfeaff" intensity={260} distance={46} decay={2} />
      ))}
      {/* Office annex spill and entrance light. */}
      <pointLight position={[ANNEX.x, 4, ANNEX.z + ANNEX.d / 2 + 2]} color="#cfdcf0" intensity={60} distance={24} decay={2} />

      {/* Ground: far ground, the concrete site slab (reflective on desktop), lot stripes and the road. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} material={tex.asphaltFar} receiveShadow>
        <planeGeometry args={[1600, 1600]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 5]} receiveShadow>
        <planeGeometry args={[150, 110]} />
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
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, D / 2 + 27]} material={tex.road} receiveShadow>
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
      {/* Curb between lot and road */}
      <mesh position={[0, 0.08, D / 2 + 22.4]} material={tex.steel} castShadow>
        <boxGeometry args={[150, 0.16, 0.3]} />
      </mesh>

      {/* Main block: precast facade, roof, parapet. */}
      <mesh position={[0, H / 2, D / 2]} material={tex.facadeFront} castShadow receiveShadow>
        <planeGeometry args={[W, H]} />
      </mesh>
      <mesh position={[0, H / 2, -D / 2]} rotation-y={Math.PI} material={tex.facadeFront} castShadow receiveShadow>
        <planeGeometry args={[W, H]} />
      </mesh>
      <mesh position={[W / 2, H / 2, 0]} rotation-y={Math.PI / 2} material={tex.facadeSide} castShadow receiveShadow>
        <planeGeometry args={[D, H]} />
      </mesh>
      <mesh position={[-W / 2, H / 2, 0]} rotation-y={-Math.PI / 2} material={tex.facadeSide} castShadow receiveShadow>
        <planeGeometry args={[D, H]} />
      </mesh>
      <mesh position={[0, H, 0]} rotation-x={-Math.PI / 2} material={tex.roof} receiveShadow>
        <planeGeometry args={[W, D]} />
      </mesh>
      {/* Parapet */}
      {[[0, D / 2, W + 0.6, 0.6], [0, -D / 2, W + 0.6, 0.6], [W / 2, 0, 0.6, D], [-W / 2, 0, 0.6, D]].map(([x, z, sx, sz], i) => (
        <mesh key={i} position={[x, H + 0.45, z]} material={tex.steelDark} castShadow>
          <boxGeometry args={[sx, 0.9, sz]} />
        </mesh>
      ))}
      {/* Horizontal band and canopy over the entrance */}
      <mesh position={[0, 3.6, D / 2 + 1.4]} material={tex.steelDark} castShadow>
        <boxGeometry args={[9, 0.35, 3]} />
      </mesh>
      <mesh position={[0, 1.6, D / 2 + 0.03]}>
        <planeGeometry args={[4.2, 3.1]} />
        <meshStandardMaterial color="#1a2230" emissive={new Color("#cfe0ff")} emissiveIntensity={1.2} roughness={0.1} metalness={0.3} />
      </mesh>
      <instancedMesh ref={louvres} args={[undefined, undefined, 40]} material={tex.louvre}>
        <planeGeometry />
      </instancedMesh>

      {/* Office annex: lit glass volume at the front-right corner. */}
      <group position={[ANNEX.x, 0, ANNEX.z]}>
        <mesh position={[0, ANNEX.h / 2, 0]} castShadow>
          <boxGeometry args={[ANNEX.w, ANNEX.h, ANNEX.d]} />
          <meshStandardMaterial map={tex.office} emissiveMap={tex.office} emissive={new Color("#ffffff")} emissiveIntensity={1.6} color="#0f141c" roughness={0.08} metalness={0.6} />
        </mesh>
        <mesh position={[0, ANNEX.h + 0.2, 0]} material={tex.steelDark} castShadow>
          <boxGeometry args={[ANNEX.w + 0.5, 0.4, ANNEX.d + 0.5]} />
        </mesh>
        {/* Floor slabs read through the glass */}
        <mesh position={[0, ANNEX.h / 2, 0]}>
          <boxGeometry args={[ANNEX.w + 0.02, 0.45, ANNEX.d + 0.02]} />
          <meshStandardMaterial color="#0c1016" roughness={0.9} />
        </mesh>
      </group>

      {/* Rooftop plant: chillers with louvred sides, fan shrouds and spinning blades, and a pipe run. */}
      {chillers.map(([x, z], i) => (
        <group key={i} position={[x, H + 1.2, z]}>
          <mesh material={tex.steel} castShadow>
            <boxGeometry args={[7.4, 2.4, 3.2]} />
          </mesh>
          <mesh position={[0, 0, 1.61]} material={tex.louvreWide}>
            <planeGeometry args={[6.6, 1.8]} />
          </mesh>
          <mesh position={[0, 0, -1.61]} rotation-y={Math.PI} material={tex.louvreWide}>
            <planeGeometry args={[6.6, 1.8]} />
          </mesh>
          <mesh position={[0, -1.1, 0]} material={tex.steelDark}>
            <boxGeometry args={[7.6, 0.3, 3.4]} />
          </mesh>
        </group>
      ))}
      <instancedMesh ref={shrouds} args={[undefined, undefined, fanSlots.length]} material={tex.steelDark} castShadow>
        <cylinderGeometry args={[0.82, 0.82, 0.36, 18, 1, true]} />
      </instancedMesh>
      <instancedMesh ref={grilles} args={[undefined, undefined, fanSlots.length]}>
        <circleGeometry args={[0.8, 18]} />
        <meshStandardMaterial color="#090b0e" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={fanBlades} args={[undefined, undefined, fanSlots.length]}>
        <boxGeometry args={[1.45, 0.03, 0.22]} />
        <meshStandardMaterial color="#5a6068" roughness={0.6} metalness={0.5} />
      </instancedMesh>
      {[-5.5, 5.5].map((z) => (
        <mesh key={z} position={[0, H + 0.7, z]} rotation-z={Math.PI / 2} material={tex.steel}>
          <cylinderGeometry args={[0.3, 0.3, 54, 10]} />
        </mesh>
      ))}

      {/* Generator yard on the west side: enclosures with exhaust stacks, two transformers. */}
      <group position={[-W / 2 - 9, 0, 0]}>
        {Array.from({ length: 6 }, (_, i) => (
          <group key={i} position={[0, 0, -14 + i * 5.6]}>
            <mesh position={[0, 1.4, 0]} material={tex.steel} castShadow>
              <boxGeometry args={[5.2, 2.8, 2.4]} />
            </mesh>
            <mesh position={[2.61, 1.4, 0]} rotation-y={Math.PI / 2} material={tex.louvre}>
              <planeGeometry args={[2.2, 2.2]} />
            </mesh>
            <mesh position={[-1.6, 3.9, 0.6]} material={tex.steelDark} castShadow>
              <cylinderGeometry args={[0.22, 0.22, 2.2, 10]} />
            </mesh>
          </group>
        ))}
        {[-24, 22].map((z) => (
          <mesh key={z} position={[1, 1.3, z]} material={tex.steelDark} castShadow>
            <boxGeometry args={[3, 2.6, 3.4]} />
          </mesh>
        ))}
      </group>

      {/* Perimeter fence: posts and chain-link. */}
      <instancedMesh ref={fencePosts} args={[undefined, undefined, 220]} material={tex.steelDark}>
        <cylinderGeometry args={[0.045, 0.045, 2.4, 6]} />
      </instancedMesh>
      {[
        [0, -50, 148, 0],
        [0, D / 2 + 36, 148, 0],
        [-74, 2, 86, Math.PI / 2],
        [74, 2, 86, Math.PI / 2],
      ].map(([x, z, len, rot], i) => (
        <mesh key={i} position={[x, 1.2, z]} rotation-y={rot}>
          <planeGeometry args={[len, 2.4]} />
          <meshStandardMaterial map={tex.chainlink} transparent alphaTest={0.25} side={DoubleSide} color="#9aa0a6" roughness={0.5} metalness={0.7} />
        </mesh>
      ))}

      {/* Light poles: shaft, arm, luminaire (HDR emissive), haze cone and ground pool. */}
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
