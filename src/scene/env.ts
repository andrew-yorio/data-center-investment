import { BackSide, BoxGeometry, Color, Mesh, MeshBasicMaterial, PlaneGeometry, PMREMGenerator, Scene, SphereGeometry, type Texture, type WebGLRenderer } from "three";
import { skyMaterial } from "./materials";

/**
 * Image-based lighting without downloads: two small scenes of emissive
 * surfaces are pre-filtered into PMREM cubemaps once at start-up. The exterior
 * map is the night sky with a few pole lamps near the horizon; the hall map is
 * a dark room with cool-white strip lights overhead, which is what metal rack
 * doors and the floor reflect.
 */
export interface Environments {
  exterior: Texture;
  hall: Texture;
  dispose: () => void;
}

export function makeEnvironments(gl: WebGLRenderer): Environments {
  const pmrem = new PMREMGenerator(gl);
  pmrem.compileEquirectangularShader();

  // Exterior: sky dome + lamps low on the horizon.
  const ext = new Scene();
  const dome = new Mesh(new SphereGeometry(50, 32, 16), skyMaterial());
  ext.add(dome);
  const lamp = new MeshBasicMaterial({ color: new Color("#dfeaff").multiplyScalar(14) });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const m = new Mesh(new PlaneGeometry(2.4, 0.6), lamp);
    m.position.set(Math.cos(a) * 30, -0.8 + (i % 3) * 0.5, Math.sin(a) * 30);
    m.lookAt(0, 0, 0);
    ext.add(m);
  }
  // Ground: faint, so there is a little upward bounce.
  const extGround = new Mesh(new PlaneGeometry(200, 200), new MeshBasicMaterial({ color: new Color("#0a0d14") }));
  extGround.rotation.x = -Math.PI / 2;
  extGround.position.y = -3;
  ext.add(extGround);
  const exterior = pmrem.fromScene(ext, 0.04).texture;

  // Hall: dark room, light strips along z, lighter floor.
  const hall = new Scene();
  const room = new Mesh(new BoxGeometry(24, 7, 60), new MeshBasicMaterial({ color: new Color("#1a1d23"), side: BackSide }));
  room.position.y = 1.8;
  hall.add(room);
  const floor = new Mesh(new PlaneGeometry(24, 60), new MeshBasicMaterial({ color: new Color("#3b4047") }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.65;
  hall.add(floor);
  const strip = new MeshBasicMaterial({ color: new Color("#cfe0ff").multiplyScalar(9) });
  for (let k = -3; k <= 3; k++) {
    const m = new Mesh(new PlaneGeometry(0.2, 56), strip);
    m.rotation.x = Math.PI / 2;
    m.position.set(k * 3.4, 3.2, 0);
    hall.add(m);
  }
  // A little blue bounce near the floor from the LEDs and signage.
  const blue = new MeshBasicMaterial({ color: new Color("#5aa8ff").multiplyScalar(0.6) });
  for (const x of [-1.1, 1.1]) {
    const m = new Mesh(new PlaneGeometry(0.4, 56), blue);
    m.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    m.position.set(x, -0.8, 0);
    hall.add(m);
  }
  const hallTex = pmrem.fromScene(hall, 0.03).texture;

  pmrem.dispose();
  return {
    exterior,
    hall: hallTex,
    dispose: () => {
      exterior.dispose();
      hallTex.dispose();
    },
  };
}
