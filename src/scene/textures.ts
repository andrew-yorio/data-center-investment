import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, SRGBColorSpace, type Texture } from "three";

/*
 * Every texture in the scene is painted on a canvas at runtime, so nothing is
 * downloaded. Each surface gets a PBR set: albedo (sRGB), a tangent-space
 * normal map derived from a painted height map, and an "ORM" map that packs
 * ambient occlusion (R), roughness (G) and metalness (B) the way three.js reads
 * them, so one texture serves aoMap, roughnessMap and metalnessMap.
 */

export interface MapSet {
  map: CanvasTexture;
  normalMap: CanvasTexture;
  ormMap: CanvasTexture;
}

type Ctx = CanvasRenderingContext2D;

export function rng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function make(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d", { willReadFrequently: false })!];
}

function toTexture(c: HTMLCanvasElement, srgb: boolean, repeat = true): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.anisotropy = 8;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Tileable value noise: a tiny random grid scaled up with bilinear smoothing, repeated. */
function noiseFill(g: Ctx, w: number, h: number, cells: number, alpha: number, seed: number, color: [number, number, number] = [255, 255, 255]) {
  const [tiny, tg] = make(cells, cells);
  const img = tg.createImageData(cells, cells);
  const r = rng(seed);
  for (let i = 0; i < cells * cells; i++) {
    const v = r();
    img.data[i * 4] = color[0] * v;
    img.data[i * 4 + 1] = color[1] * v;
    img.data[i * 4 + 2] = color[2] * v;
    img.data[i * 4 + 3] = 255;
  }
  tg.putImageData(img, 0, 0);
  const pat = g.createPattern(tiny, "repeat")!;
  pat.setTransform(new DOMMatrix().scale(w / cells, h / cells));
  g.save();
  g.globalAlpha = alpha;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.fillStyle = pat;
  g.fillRect(0, 0, w, h);
  g.restore();
}

/** Layered noise ("fbm") in the given blend mode. */
function fbm(g: Ctx, w: number, h: number, seed: number, layers: [cells: number, alpha: number][], mode: GlobalCompositeOperation = "overlay") {
  g.save();
  g.globalCompositeOperation = mode;
  layers.forEach(([cells, alpha], i) => noiseFill(g, w, h, cells, alpha, seed + i * 101));
  g.restore();
}

/** Sobel the luminance of a height canvas into a tangent-space normal map. */
function normalFromHeight(height: HTMLCanvasElement, strength: number): CanvasTexture {
  const w = height.width;
  const h = height.height;
  const src = height.getContext("2d")!.getImageData(0, 0, w, h).data;
  const [out, og] = make(w, h);
  const img = og.createImageData(w, h);
  const at = (x: number, y: number) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br - tl - 2 * l - bl) * strength;
      const dy = (bl + 2 * b + br - tl - 2 * t - tr) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = 128 + (-dx / len) * 127;
      img.data[i + 1] = 128 + (dy / len) * 127;
      img.data[i + 2] = 128 + (1 / len) * 127;
      img.data[i + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return toTexture(out, false);
}

const grey = (v: number) => `rgb(${v},${v},${v})`;

/** An elliptical soft-edged blob: solid to 70% of its radius, then fading out. */
function softBlob(ctx: Ctx, x: number, y: number, rx: number, ry: number, rgb: [number, number, number], alpha: number) {
  const grd = ctx.createRadialGradient(x, y, 0, x, y, rx);
  const c = `${rgb[0]},${rgb[1]},${rgb[2]}`;
  grd.addColorStop(0, `rgba(${c},${alpha})`);
  grd.addColorStop(0.7, `rgba(${c},${alpha})`);
  grd.addColorStop(1, `rgba(${c},0)`);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.translate(-x, -y);
  ctx.fillStyle = grd;
  ctx.fillRect(x - rx, y - rx, rx * 2, rx * 2);
  ctx.restore();
}
/** ORM colour: ao, roughness, metalness in 0..1. */
const orm = (ao: number, rough: number, metal: number) => `rgb(${Math.round(ao * 255)},${Math.round(rough * 255)},${Math.round(metal * 255)})`;

interface SetOptions {
  normalStrength?: number;
  repeat?: boolean;
}

/** Paints albedo, height and ORM with one callback that receives the three contexts. */
function mapSet(w: number, h: number, draw: (albedo: Ctx, height: Ctx, orm: Ctx) => void, opts: SetOptions = {}): MapSet {
  const [a, ag] = make(w, h);
  const [hc, hg] = make(w, h);
  const [o, og] = make(w, h);
  hg.fillStyle = grey(128);
  hg.fillRect(0, 0, w, h);
  og.fillStyle = orm(1, 0.8, 0);
  og.fillRect(0, 0, w, h);
  draw(ag, hg, og);
  return {
    map: toTexture(a, true, opts.repeat ?? true),
    normalMap: normalFromHeight(hc, opts.normalStrength ?? 1.5),
    ormMap: toTexture(o, false, opts.repeat ?? true),
  };
}

/* ------------------------------------------------------------------ */
/* Exterior                                                            */
/* ------------------------------------------------------------------ */

/** Precast concrete facade: one tile = two 3 m panels wide by 7 m tall, vertical ribbing, reveal joints. */
export function facadeMaps(res = 512): MapSet {
  return mapSet(res, res, (a, h, o) => {
    const s = res / 512;
    a.fillStyle = "#7b7f87";
    a.fillRect(0, 0, res, res);
    fbm(a, res, res, 3, [[8, 0.25], [32, 0.2], [128, 0.15]], "multiply");
    fbm(a, res, res, 9, [[64, 0.1]], "screen");
    // Rib shading: vertical stripes at 15 cm.
    for (let x = 0; x < res; x += 13 * s) {
      a.fillStyle = "rgba(0,0,0,0.09)";
      a.fillRect(x, 0, 5 * s, res);
      a.fillStyle = "rgba(255,255,255,0.05)";
      a.fillRect(x + 5 * s, 0, 2 * s, res);
      h.fillStyle = grey(150);
      h.fillRect(x + 5 * s, 0, 6 * s, res);
    }
    // Weathering streaks from the top.
    const r = rng(17);
    for (let i = 0; i < 22; i++) {
      const x = r() * res;
      const len = (0.2 + r() * 0.5) * res;
      const grd = a.createLinearGradient(0, 0, 0, len);
      grd.addColorStop(0, `rgba(20,24,30,${0.18 + r() * 0.15})`);
      grd.addColorStop(1, "rgba(20,24,30,0)");
      a.fillStyle = grd;
      a.fillRect(x, 0, (2 + r() * 6) * s, len);
    }
    // Reveal joints: two panels wide, one horizontal joint half way.
    const joint = 4 * s;
    a.fillStyle = "#2a2d33";
    h.fillStyle = grey(40);
    o.fillStyle = orm(0.55, 0.95, 0);
    for (const x of [0, res / 2]) {
      a.fillRect(x - joint / 2, 0, joint, res);
      h.fillRect(x - joint / 2, 0, joint, res);
      o.fillRect(x - joint / 2, 0, joint, res);
    }
    a.fillRect(0, res / 2 - joint / 2, res, joint);
    h.fillRect(0, res / 2 - joint / 2, res, joint);
    o.fillRect(0, res / 2 - joint / 2, res, joint);
    fbm(o, res, res, 5, [[64, 0.2]], "overlay");
  }, { normalStrength: 1.2 });
}

/** Asphalt or concrete paving with puddles (low roughness) for the wet-night look. */
export function pavementMaps(kind: "asphalt" | "concrete", res = 512): MapSet {
  return mapSet(res, res, (a, h, o) => {
    const base = kind === "asphalt" ? "#2b2d31" : "#575a60";
    a.fillStyle = base;
    a.fillRect(0, 0, res, res);
    fbm(a, res, res, 21, [[16, 0.35], [64, 0.3], [256, 0.35]], "overlay");
    fbm(a, res, res, 31, [[512, 0.18]], "screen");
    noiseFill(h, res, res, 256, 0.35, 41);
    noiseFill(h, res, res, 64, 0.25, 42);
    o.fillStyle = orm(1, kind === "asphalt" ? 0.78 : 0.7, 0);
    o.fillRect(0, 0, res, res);
    fbm(o, res, res, 51, [[32, 0.3]], "overlay");
    // Puddles: soft blobs with glassy roughness, slightly darker albedo and a flat surface.
    // Puddles: irregular clusters of overlapping soft blobs so the tiling never reads as a dot pattern.
    const r = rng(kind === "asphalt" ? 61 : 71);
    for (let i = 0; i < 4; i++) {
      const cx = r() * res;
      const cy = r() * res;
      const parts = 3 + Math.floor(r() * 4);
      for (let k = 0; k < parts; k++) {
        const x = cx + (r() - 0.5) * res * 0.18;
        const y = cy + (r() - 0.5) * res * 0.1;
        const rx = (0.04 + r() * 0.09) * res;
        const ry = rx * (0.35 + r() * 0.45);
        softBlob(o, x, y, rx, ry, [255, 36, 0], 0.9);
        softBlob(a, x, y, rx, ry, [8, 10, 14], 0.3);
        softBlob(h, x, y, rx, ry, [128, 128, 128], 0.9);
      }
    }
    // Damp sheen everywhere else: a wet night lowers roughness overall.
    o.save();
    o.globalCompositeOperation = "multiply";
    o.fillStyle = "rgb(255,215,255)";
    o.fillRect(0, 0, res, res);
    o.restore();
    if (kind === "concrete") {
      // Expansion joints every quarter tile.
      a.fillStyle = "#2c2e33";
      h.fillStyle = grey(60);
      for (let i = 0; i < 4; i++) {
        const p = (i * res) / 4;
        a.fillRect(p, 0, 3, res);
        a.fillRect(0, p, res, 3);
        h.fillRect(p, 0, 3, res);
        h.fillRect(0, p, res, 3);
      }
    }
  }, { normalStrength: 0.9 });
}

/** Roof membrane with welded seams. */
export function roofMaps(res = 256): MapSet {
  return mapSet(res, res, (a, h, o) => {
    a.fillStyle = "#3b3e44";
    a.fillRect(0, 0, res, res);
    fbm(a, res, res, 81, [[16, 0.3], [128, 0.2]], "overlay");
    o.fillStyle = orm(1, 0.9, 0);
    o.fillRect(0, 0, res, res);
    for (let y = 0; y < res; y += res / 2) {
      a.fillStyle = "rgba(255,255,255,0.08)";
      a.fillRect(0, y, res, 3);
      h.fillStyle = grey(160);
      h.fillRect(0, y, res, 3);
    }
  });
}

/** Horizontal louvre slats (chiller sides, intake walls, generator enclosures). */
export function louvreMaps(res = 256): MapSet {
  return mapSet(res, res, (a, h, o) => {
    const slats = 12;
    const sh = res / slats;
    for (let i = 0; i < slats; i++) {
      const y = i * sh;
      const g1 = a.createLinearGradient(0, y, 0, y + sh);
      g1.addColorStop(0, "#9ea2a8");
      g1.addColorStop(0.55, "#6d7177");
      g1.addColorStop(0.56, "#1a1c20");
      g1.addColorStop(1, "#2a2d32");
      a.fillStyle = g1;
      a.fillRect(0, y, res, sh);
      const g2 = h.createLinearGradient(0, y, 0, y + sh);
      g2.addColorStop(0, grey(200));
      g2.addColorStop(0.55, grey(140));
      g2.addColorStop(0.56, grey(30));
      g2.addColorStop(1, grey(60));
      h.fillStyle = g2;
      h.fillRect(0, y, res, sh);
      o.fillStyle = orm(1, 0.45, 0.6);
      o.fillRect(0, y, res, sh * 0.55);
      o.fillStyle = orm(0.3, 0.9, 0.1);
      o.fillRect(0, y + sh * 0.55, res, sh * 0.45);
    }
    fbm(a, res, res, 91, [[64, 0.12]], "overlay");
  }, { normalStrength: 2 });
}

/** Painted steel for chillers, generator enclosures and poles: subtle grain, mid roughness. */
export function paintedMetalMaps(color: string, res = 256): MapSet {
  return mapSet(res, res, (a, h, o) => {
    a.fillStyle = color;
    a.fillRect(0, 0, res, res);
    fbm(a, res, res, 101, [[8, 0.18], [64, 0.1]], "overlay");
    noiseFill(h, res, res, 128, 0.12, 102);
    o.fillStyle = orm(1, 0.42, 0.55);
    o.fillRect(0, 0, res, res);
    fbm(o, res, res, 103, [[32, 0.25]], "overlay");
    // Panel seams.
    a.fillStyle = "rgba(0,0,0,0.45)";
    h.fillStyle = grey(70);
    for (const p of [0, res / 2]) {
      a.fillRect(p, 0, 2, res);
      a.fillRect(0, p, res, 2);
      h.fillRect(p, 0, 2, res);
      h.fillRect(0, p, res, 2);
    }
  }, { normalStrength: 0.8 });
}

/** Lit office floors behind a curtain wall: an emissive map with slabs, ceiling fixtures and a few dark bays. */
export function officeGlassTexture(res = 512): CanvasTexture {
  const [c, g] = make(res, res);
  g.fillStyle = "#0a0f17";
  g.fillRect(0, 0, res, res);
  const floors = 2;
  const fh = res / floors;
  const r = rng(7);
  for (let f = 0; f < floors; f++) {
    const y0 = f * fh;
    const slab = fh * 0.16;
    // Interior: brighter near the ceiling, falling off toward the floor.
    const grd = g.createLinearGradient(0, y0 + slab, 0, y0 + fh);
    grd.addColorStop(0, "#c9d6e6");
    grd.addColorStop(0.35, "#8ea0b8");
    grd.addColorStop(1, "#3b4a60");
    for (let bay = 0; bay < 6; bay++) {
      const bx = (bay * res) / 6;
      const lit = r() > 0.22;
      g.fillStyle = lit ? grd : "#111821";
      g.fillRect(bx, y0 + slab, res / 6, fh - slab);
      if (lit) {
        // Ceiling fixtures and desk silhouettes.
        g.fillStyle = "#f4f8ff";
        g.fillRect(bx + res / 36, y0 + slab + 2, res / 12, 3);
        g.fillStyle = "rgba(10,14,22,0.75)";
        g.fillRect(bx + res / 30, y0 + fh * 0.62, res / 10, fh * 0.07);
        g.fillRect(bx + res / 9, y0 + fh * 0.5, res / 40, fh * 0.5);
      }
    }
    // Floor slab, dark.
    g.fillStyle = "#070a10";
    g.fillRect(0, y0, res, slab);
  }
  // Mullions.
  g.fillStyle = "#05070b";
  for (let x = 0; x <= res; x += res / 12) g.fillRect(x - 2, 0, 4, res);
  return toTexture(c, true);
}

/** Chain-link fence mesh with alpha. */
export function chainlinkTexture(res = 128): CanvasTexture {
  const [c, g] = make(res, res);
  g.clearRect(0, 0, res, res);
  g.strokeStyle = "#aeb3b9";
  g.lineWidth = 1.6;
  const n = 4;
  const cell = res / n;
  g.beginPath();
  for (let i = -n; i <= n * 2; i++) {
    g.moveTo(i * cell, 0);
    g.lineTo(i * cell + res, res);
    g.moveTo(i * cell, 0);
    g.lineTo(i * cell - res, res);
  }
  g.stroke();
  const t = toTexture(c, true);
  return t;
}

/** Soft radial falloff used for light pools, cones and glow sprites. */
export function glowTexture(res = 256, power = 1.6): CanvasTexture {
  const [c, g] = make(res, res);
  const img = g.createImageData(res, res);
  for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
    const d = Math.hypot(x - res / 2 + 0.5, y - res / 2 + 0.5) / (res / 2);
    const v = Math.pow(Math.max(0, 1 - d), power);
    const i = (y * res + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = v * 255;
  }
  g.putImageData(img, 0, 0);
  const t = toTexture(c, true, false);
  t.wrapS = t.wrapT = 1001; // ClampToEdgeWrapping
  return t;
}

/* ------------------------------------------------------------------ */
/* Hall                                                                */
/* ------------------------------------------------------------------ */

/** Raised-floor tiles: a 2x2 patch of 0.6 m HPL tiles, optionally perforated. */
export function floorTileMaps(perforated: boolean, res = 512): MapSet {
  return mapSet(res, res, (a, h, o) => {
    a.fillStyle = perforated ? "#7f858c" : "#989ea5";
    a.fillRect(0, 0, res, res);
    fbm(a, res, res, 111, [[128, 0.22], [512, 0.25]], "overlay");
    o.fillStyle = orm(1, 0.38, 0.05);
    o.fillRect(0, 0, res, res);
    fbm(o, res, res, 112, [[64, 0.18]], "overlay");
    const half = res / 2;
    // Seams, with a bevel in the height map.
    for (const p of [0, half]) {
      a.fillStyle = "#3a3f46";
      a.fillRect(p - 2, 0, 4, res);
      a.fillRect(0, p - 2, res, 4);
      const gv = h.createLinearGradient(p - 6, 0, p + 6, 0);
      gv.addColorStop(0, grey(128));
      gv.addColorStop(0.5, grey(40));
      gv.addColorStop(1, grey(128));
      h.fillStyle = gv;
      h.fillRect(p - 6, 0, 12, res);
      const gh = h.createLinearGradient(0, p - 6, 0, p + 6);
      gh.addColorStop(0, grey(128));
      gh.addColorStop(0.5, grey(40));
      gh.addColorStop(1, grey(128));
      h.fillStyle = gh;
      h.fillRect(0, p - 6, res, 12);
      o.fillStyle = orm(0.6, 0.7, 0);
      o.fillRect(p - 2, 0, 4, res);
      o.fillRect(0, p - 2, res, 4);
    }
    if (perforated) {
      const pitch = res / 32;
      for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
        for (let y = pitch; y < half - pitch / 2; y += pitch) for (let x = pitch; x < half - pitch / 2; x += pitch) {
          const px = tx * half + x;
          const py = ty * half + y;
          a.fillStyle = "#15181c";
          a.beginPath();
          a.arc(px, py, pitch * 0.3, 0, Math.PI * 2);
          a.fill();
          h.fillStyle = grey(30);
          h.beginPath();
          h.arc(px, py, pitch * 0.3, 0, Math.PI * 2);
          h.fill();
          o.fillStyle = orm(0.3, 0.95, 0);
          o.beginPath();
          o.arc(px, py, pitch * 0.3, 0, Math.PI * 2);
          o.fill();
        }
      }
    }
  }, { normalStrength: 1.6 });
}

/** Perforated rack door, 0.6 x 2.0 m: hex-pattern holes, frame, handle and a label plate. */
export function rackDoorMaps(w = 384, h = 1280): MapSet {
  return mapSet(w, h, (a, hg, o) => {
    a.fillStyle = "#22252a";
    a.fillRect(0, 0, w, h);
    fbm(a, w, h, 121, [[32, 0.15]], "overlay");
    hg.fillStyle = grey(140);
    hg.fillRect(0, 0, w, h);
    o.fillStyle = orm(1, 0.5, 0.6);
    o.fillRect(0, 0, w, h);
    const frame = w * 0.06;
    // Perforated field.
    const x0 = frame, x1 = w - frame, y0 = frame * 1.6, y1 = h - frame * 1.4;
    a.fillStyle = "#1c1f24";
    a.fillRect(x0, y0, x1 - x0, y1 - y0);
    const pitch = w / 72;
    const rad = pitch * 0.34;
    let row = 0;
    for (let y = y0 + pitch; y < y1 - pitch / 2; y += pitch * 0.866, row++) {
      const off = row % 2 ? pitch / 2 : 0;
      for (let x = x0 + pitch / 2 + off; x < x1 - pitch / 2; x += pitch) {
        a.fillStyle = "#06080b";
        a.beginPath();
        a.arc(x, y, rad, 0, Math.PI * 2);
        a.fill();
        hg.fillStyle = grey(20);
        hg.beginPath();
        hg.arc(x, y, rad, 0, Math.PI * 2);
        hg.fill();
        o.fillStyle = orm(0.15, 1, 0);
        o.beginPath();
        o.arc(x, y, rad, 0, Math.PI * 2);
        o.fill();
      }
    }
    // Handle on the right, lock below it.
    a.fillStyle = "#8d9299";
    a.fillRect(x1 - frame * 1.6, h * 0.46, frame * 0.7, h * 0.08);
    hg.fillStyle = grey(230);
    hg.fillRect(x1 - frame * 1.6, h * 0.46, frame * 0.7, h * 0.08);
    o.fillStyle = orm(1, 0.3, 0.9);
    o.fillRect(x1 - frame * 1.6, h * 0.46, frame * 0.7, h * 0.08);
    // Label plate at the top.
    a.fillStyle = "#30343a";
    a.fillRect(x0 + frame, frame * 0.5, (x1 - x0) * 0.5, frame * 0.7);
    a.fillStyle = "#5b6169";
    a.fillRect(x0 + frame * 1.3, frame * 0.75, (x1 - x0) * 0.25, frame * 0.2);
    // Frame edges: slight highlight.
    a.strokeStyle = "rgba(255,255,255,0.08)";
    a.lineWidth = 2;
    a.strokeRect(1, 1, w - 2, h - 2);
    hg.strokeStyle = grey(200);
    hg.lineWidth = 3;
    hg.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }, { normalStrength: 1.4, repeat: false });
}

/** Brushed graphite for rack sides and server chassis. */
export function graphiteMaps(color = "#1d2024", res = 256): MapSet {
  return mapSet(res, res, (a, h, o) => {
    a.fillStyle = color;
    a.fillRect(0, 0, res, res);
    fbm(a, res, res, 131, [[16, 0.12], [256, 0.1]], "overlay");
    noiseFill(h, res, res, 256, 0.08, 132);
    o.fillStyle = orm(1, 0.45, 0.7);
    o.fillRect(0, 0, res, res);
    fbm(o, res, res, 133, [[64, 0.2]], "overlay");
  }, { normalStrength: 0.4 });
}

/** Painted wall panels for the hall: light grey insulated metal panels with vertical seams. */
export function wallPanelMaps(res = 512): MapSet {
  return mapSet(res, res, (a, h, o) => {
    a.fillStyle = "#a9aeb5";
    a.fillRect(0, 0, res, res);
    fbm(a, res, res, 141, [[8, 0.12], [128, 0.1]], "overlay");
    o.fillStyle = orm(1, 0.55, 0.1);
    o.fillRect(0, 0, res, res);
    for (let x = 0; x < res; x += res / 2) {
      a.fillStyle = "#4b5057";
      a.fillRect(x - 2, 0, 4, res);
      h.fillStyle = grey(50);
      h.fillRect(x - 2, 0, 4, res);
    }
  });
}

/** Dark ceiling with a panel grid. */
export function ceilingMaps(res = 256): MapSet {
  return mapSet(res, res, (a, h, o) => {
    a.fillStyle = "#23262b";
    a.fillRect(0, 0, res, res);
    fbm(a, res, res, 151, [[16, 0.15]], "overlay");
    o.fillStyle = orm(1, 0.92, 0);
    o.fillRect(0, 0, res, res);
    a.fillStyle = "#111317";
    h.fillStyle = grey(60);
    for (const p of [0, res / 2]) {
      a.fillRect(p - 1, 0, 3, res);
      a.fillRect(0, p - 1, res, 3);
      h.fillRect(p - 1, 0, 3, res);
      h.fillRect(0, p - 1, res, 3);
    }
  });
}

/**
 * The open rack's equipment stack, 0.6 x 1.9 m: storage servers with drive
 * bays, 1U compute nodes, a switch and blanking panels. The pulled-out 2U
 * server is real geometry, so its slot is left dark.
 */
export function serverStackMaps(openSlotU: [number, number], w = 512, h = 2048): MapSet {
  return mapSet(w, h, (a, hg, o) => {
    const units = 42;
    const uh = h / units;
    a.fillStyle = "#0a0c0f";
    a.fillRect(0, 0, w, h);
    hg.fillStyle = grey(100);
    hg.fillRect(0, 0, w, h);
    o.fillStyle = orm(1, 0.5, 0.6);
    o.fillRect(0, 0, w, h);
    const r = rng(161);
    const bezel = (y: number, hh: number, color: string) => {
      a.fillStyle = color;
      a.fillRect(w * 0.03, y + 1.5, w * 0.94, hh - 3);
      hg.fillStyle = grey(190);
      hg.fillRect(w * 0.03, y + 1.5, w * 0.94, hh - 3);
      // Rack ears / mounting flanges.
      a.fillStyle = "#8a8f96";
      a.fillRect(0, y + 2, w * 0.03, hh - 4);
      a.fillRect(w * 0.97, y + 2, w * 0.03, hh - 4);
      o.fillStyle = orm(1, 0.35, 0.9);
      o.fillRect(0, y + 2, w * 0.03, hh - 4);
      o.fillRect(w * 0.97, y + 2, w * 0.03, hh - 4);
    };
    const driveBays = (x0: number, y0: number, cols: number, rows: number, bw: number, bh: number) => {
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
        const x = x0 + j * bw;
        const y = y0 + i * bh;
        a.fillStyle = "#15181d";
        a.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        hg.fillStyle = grey(120);
        hg.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        // Latch and a hint of a status LED dot in the bay (dim; the live LEDs are instanced).
        a.fillStyle = "#4d535b";
        a.fillRect(x + bw * 0.1, y + bh * 0.72, bw * 0.3, bh * 0.1);
        a.fillStyle = r() > 0.15 ? "#2b6a4c" : "#2a3340";
        a.fillRect(x + bw * 0.78, y + bh * 0.75, bw * 0.08, bh * 0.08);
        // Vent grille.
        a.fillStyle = "#07090c";
        for (let v = y + bh * 0.15; v < y + bh * 0.6; v += bh * 0.1) a.fillRect(x + bw * 0.12, v, bw * 0.76, bh * 0.045);
      }
    };
    const vents = (y: number, hh: number, x0: number, x1: number) => {
      a.fillStyle = "#07090c";
      hg.fillStyle = grey(60);
      const step = Math.max(4, uh / 6);
      for (let x = x0; x < x1; x += step) {
        a.fillRect(x, y + hh * 0.2, step * 0.5, hh * 0.6);
        hg.fillRect(x, y + hh * 0.2, step * 0.5, hh * 0.6);
      }
    };
    // Layout from the bottom up (texture y grows downward, so flip).
    let u = 0;
    const place = (height: number, draw: (y: number, hh: number) => void) => {
      const y = h - (u + height) * uh;
      draw(y, height * uh);
      u += height;
    };
    const blank = (hh: number) => (y: number, hhp: number) => {
      bezel(y, hhp, "#1a1d21");
      vents(y, hhp, w * 0.3, w * 0.7);
      void hh;
    };
    const storage = (y: number, hh: number) => {
      bezel(y, hh, "#1e2126");
      driveBays(w * 0.06, y + hh * 0.08, 6, 4, (w * 0.88) / 6, (hh * 0.84) / 4);
    };
    const compute = (y: number, hh: number) => {
      bezel(y, hh, "#202329");
      driveBays(w * 0.06, y + hh * 0.12, 4, 1, (w * 0.5) / 4, hh * 0.76);
      vents(y, hh, w * 0.6, w * 0.86);
      a.fillStyle = "#3a3f46";
      a.fillRect(w * 0.88, y + hh * 0.3, w * 0.06, hh * 0.4);
    };
    const switchUnit = (y: number, hh: number) => {
      bezel(y, hh, "#1c1f24");
      const pw = (w * 0.8) / 24;
      for (let i = 0; i < 24; i++) for (let row = 0; row < 2; row++) {
        const x = w * 0.1 + i * pw;
        const yy = y + hh * (0.15 + row * 0.42);
        a.fillStyle = "#0a0c0f";
        a.fillRect(x + 1, yy, pw - 2, hh * 0.3);
        a.fillStyle = r() > 0.4 ? "#2f5f3f" : "#20262e";
        a.fillRect(x + 2, yy + hh * 0.32, pw * 0.3, hh * 0.06);
      }
    };
    place(1, blank(1));
    place(4, storage);
    place(4, storage);
    place(1, blank(1));
    for (let i = 0; i < 6; i++) place(1, compute);
    place(1, blank(1));
    // The pulled-out server's slot: an empty dark opening with rails.
    while (u < openSlotU[0]) place(1, compute);
    place(openSlotU[1] - openSlotU[0], (y, hh) => {
      a.fillStyle = "#040507";
      a.fillRect(0, y, w, hh);
      hg.fillStyle = grey(10);
      hg.fillRect(0, y, w, hh);
      a.fillStyle = "#5b6069";
      a.fillRect(0, y + hh * 0.08, w * 0.03, hh * 0.1);
      a.fillRect(w * 0.97, y + hh * 0.08, w * 0.03, hh * 0.1);
    });
    for (let i = 0; i < 4; i++) place(1, compute);
    place(1, switchUnit);
    place(2, blank(2));
    while (u < units - 2) place(1, compute);
    place(units - u, blank(2));
  }, { normalStrength: 1.2, repeat: false });
}

/* ------------------------------------------------------------------ */
/* Server and silicon                                                  */
/* ------------------------------------------------------------------ */

/** Server motherboard, ~0.43 x 0.5 m: dark green soldermask, trace bundles, vias, pads, silkscreen. */
export function pcbMaps(res = 1024): MapSet {
  return mapSet(res, res, (a, h, o) => {
    a.fillStyle = "#0f3b2d";
    a.fillRect(0, 0, res, res);
    fbm(a, res, res, 171, [[64, 0.08]], "overlay");
    o.fillStyle = orm(1, 0.55, 0);
    o.fillRect(0, 0, res, res);
    const r = rng(173);
    // Trace bundles: parallel Manhattan routes.
    a.lineCap = "butt";
    for (let b = 0; b < 70; b++) {
      const n = 2 + Math.floor(r() * 7);
      let x = r() * res;
      let y = r() * res;
      const pts: [number, number][] = [[x, y]];
      let horiz = r() > 0.5;
      for (let s = 0; s < 5; s++) {
        if (horiz) x += (r() - 0.5) * res * 0.5;
        else y += (r() - 0.5) * res * 0.5;
        pts.push([x, y]);
        horiz = !horiz;
      }
      for (let k = 0; k < n; k++) {
        const off = (k - n / 2) * 3.2;
        a.strokeStyle = `rgba(${40 + r() * 20},${120 + r() * 30},${90 + r() * 20},0.9)`;
        a.lineWidth = 1.6;
        a.beginPath();
        pts.forEach(([px, py], i) => (i ? a.lineTo(px + off, py + off) : a.moveTo(px + off, py + off)));
        a.stroke();
        h.strokeStyle = grey(150);
        h.lineWidth = 1.6;
        h.beginPath();
        pts.forEach(([px, py], i) => (i ? h.lineTo(px + off, py + off) : h.moveTo(px + off, py + off)));
        h.stroke();
      }
    }
    // Vias.
    for (let i = 0; i < 1800; i++) {
      const x = r() * res;
      const y = r() * res;
      a.fillStyle = "#6f8a7a";
      a.beginPath();
      a.arc(x, y, 1.6, 0, Math.PI * 2);
      a.fill();
    }
    // SMD footprints: pad pairs with a dark body.
    for (let i = 0; i < 420; i++) {
      const x = r() * res;
      const y = r() * res;
      const horiz = r() > 0.5;
      const L = 6 + r() * 10;
      const W = 3 + r() * 3;
      const bw = horiz ? L : W;
      const bh = horiz ? W : L;
      a.fillStyle = "#b9bec6";
      a.fillRect(x - bw / 2 - 2, y - bh / 2, 3, bh);
      a.fillRect(x + bw / 2 - 1, y - bh / 2, 3, bh);
      o.fillStyle = orm(1, 0.25, 1);
      o.fillRect(x - bw / 2 - 2, y - bh / 2, 3, bh);
      o.fillRect(x + bw / 2 - 1, y - bh / 2, 3, bh);
      a.fillStyle = r() > 0.5 ? "#2a2522" : "#3b3f45";
      a.fillRect(x - bw / 2 + 1, y - bh / 2, bw - 2, bh);
      h.fillStyle = grey(200);
      h.fillRect(x - bw / 2 - 2, y - bh / 2, bw + 4, bh);
    }
    // Silkscreen: labels and outlines.
    a.fillStyle = "rgba(235,240,245,0.7)";
    for (let i = 0; i < 260; i++) {
      const x = r() * res;
      const y = r() * res;
      a.fillRect(x, y, 4 + r() * 14, 1.5);
    }
    a.strokeStyle = "rgba(235,240,245,0.5)";
    a.lineWidth = 1;
    for (let i = 0; i < 40; i++) a.strokeRect(r() * res, r() * res, 12 + r() * 40, 12 + r() * 40);
    // Mounting holes.
    for (const [fx, fy] of [[0.04, 0.04], [0.96, 0.04], [0.04, 0.96], [0.96, 0.96], [0.5, 0.04], [0.5, 0.96]]) {
      a.fillStyle = "#c2c7ce";
      a.beginPath();
      a.arc(fx * res, fy * res, 7, 0, Math.PI * 2);
      a.fill();
      a.fillStyle = "#06070a";
      a.beginPath();
      a.arc(fx * res, fy * res, 4, 0, Math.PI * 2);
      a.fill();
      o.fillStyle = orm(1, 0.3, 1);
      o.beginPath();
      o.arc(fx * res, fy * res, 7, 0, Math.PI * 2);
      o.fill();
    }
  }, { normalStrength: 1.1, repeat: false });
}

/** CPU package substrate: dark green laminate with a dense grid of tiny pads near the edge. */
export function substrateMaps(res = 512): MapSet {
  return mapSet(res, res, (a, h, o) => {
    a.fillStyle = "#143a2f";
    a.fillRect(0, 0, res, res);
    fbm(a, res, res, 181, [[64, 0.08]], "overlay");
    o.fillStyle = orm(1, 0.45, 0);
    o.fillRect(0, 0, res, res);
    const pitch = res / 64;
    for (let y = pitch; y < res - pitch / 2; y += pitch) for (let x = pitch; x < res - pitch / 2; x += pitch) {
      const inner = Math.abs(x - res / 2) < res * 0.26 && Math.abs(y - res / 2) < res * 0.26;
      if (inner) continue;
      a.fillStyle = "#9ea4ad";
      a.fillRect(x - 1.5, y - 1.5, 3, 3);
      o.fillStyle = orm(1, 0.3, 1);
      o.fillRect(x - 1.5, y - 1.5, 3, 3);
      h.fillStyle = grey(170);
      h.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Fine traces fanning from the die area.
    a.strokeStyle = "rgba(170,180,190,0.35)";
    a.lineWidth = 1;
    const r = rng(183);
    for (let i = 0; i < 200; i++) {
      const ang = r() * Math.PI * 2;
      const r0 = res * 0.27;
      const r1 = res * (0.3 + r() * 0.18);
      a.beginPath();
      a.moveTo(res / 2 + Math.cos(ang) * r0, res / 2 + Math.sin(ang) * r0);
      a.lineTo(res / 2 + Math.cos(ang) * r1, res / 2 + Math.sin(ang) * r1);
      a.stroke();
    }
  }, { normalStrength: 1.2, repeat: false });
}

export interface DieMaps extends MapSet {
  /** R: activation order 0..1 per block; G: emissive mask; B: unused. */
  activation: CanvasTexture;
}

/**
 * Silicon die floorplan at die-shot scale: an I/O ring with PHY blocks and a
 * bump grid, eight cores with SRAM arrays and logic, a central cache spine, and
 * metal fill between blocks. Also paints the activation map used by beat 4.
 */
export function dieMaps(res = 2048): DieMaps {
  const [act, ag] = make(res, res);
  ag.fillStyle = "rgb(255,20,0)";
  ag.fillRect(0, 0, res, res);
  const r = rng(191);
  const cx = res / 2;
  const cy = res / 2;
  const order = (x: number, y: number, w: number, hh: number) => Math.min(1, Math.hypot(x + w / 2 - cx, y + hh / 2 - cy) / (res * 0.62) * 0.85 + r() * 0.12);
  const set = mapSet(res, res, (a, h, o) => {
    const s = res / 2048;
    // Base: dark metal stack, faint metal fill grid.
    a.fillStyle = "#2a3140";
    a.fillRect(0, 0, res, res);
    fbm(a, res, res, 201, [[64, 0.08], [1024, 0.12]], "overlay");
    o.fillStyle = orm(1, 0.28, 0.9);
    o.fillRect(0, 0, res, res);
    h.fillStyle = grey(110);
    h.fillRect(0, 0, res, res);
    // Metal fill dots.
    a.fillStyle = "rgba(120,135,160,0.25)";
    const fp = 10 * s;
    for (let y = 0; y < res; y += fp) for (let x = 0; x < res; x += fp) a.fillRect(x, y, 4 * s, 4 * s);

    const block = (x: number, y: number, w: number, hh: number, fill: string, rough: number, emis: number, kind: "sram" | "logic" | "phy" | "cache") => {
      a.fillStyle = fill;
      a.fillRect(x, y, w, hh);
      h.fillStyle = grey(165);
      h.fillRect(x, y, w, hh);
      o.fillStyle = orm(1, rough, 0.92);
      o.fillRect(x, y, w, hh);
      ag.fillStyle = `rgb(${Math.round(order(x, y, w, hh) * 255)},${Math.round(emis * 255)},0)`;
      ag.fillRect(x, y, w, hh);
      if (kind === "sram") {
        // Regular bit-cell array: fine vertical stripes with word-line breaks.
        a.fillStyle = "rgba(0,0,0,0.35)";
        for (let xx = x + 2 * s; xx < x + w - 2 * s; xx += 4 * s) a.fillRect(xx, y + 3 * s, 1.5 * s, hh - 6 * s);
        a.fillStyle = "rgba(200,230,255,0.18)";
        for (let yy = y + 6 * s; yy < y + hh - 4 * s; yy += 24 * s) a.fillRect(x + 2 * s, yy, w - 4 * s, 1.5 * s);
        // Sub-array seams.
        a.fillStyle = "rgba(0,0,0,0.5)";
        for (let xx = x; xx < x + w; xx += w / 4) a.fillRect(xx, y, 2 * s, hh);
        for (let yy = y; yy < y + hh; yy += hh / 2) a.fillRect(x, yy, w, 2 * s);
      } else if (kind === "logic") {
        // Standard-cell rows: dense speckle in horizontal rows.
        fbmRect(a, x, y, w, hh, 0.35);
        a.fillStyle = "rgba(0,0,0,0.22)";
        for (let yy = y; yy < y + hh; yy += 7 * s) a.fillRect(x, yy, w, 1.2 * s);
      } else if (kind === "phy") {
        a.fillStyle = "rgba(0,0,0,0.3)";
        for (let yy = y + 3 * s; yy < y + hh - 3 * s; yy += 6 * s) a.fillRect(x + 3 * s, yy, w - 6 * s, 2 * s);
        a.fillStyle = "rgba(220,235,255,0.2)";
        a.fillRect(x + w * 0.1, y + hh * 0.42, w * 0.8, hh * 0.16);
      } else {
        a.fillStyle = "rgba(0,0,0,0.32)";
        for (let yy = y + 2 * s; yy < y + hh; yy += 5 * s) a.fillRect(x, yy, w, 2 * s);
        a.fillStyle = "rgba(0,0,0,0.5)";
        for (let xx = x; xx < x + w; xx += w / 8) a.fillRect(xx, y, 2 * s, hh);
      }
      // Block outline (power ring).
      a.strokeStyle = "rgba(190,205,225,0.45)";
      a.lineWidth = 2 * s;
      a.strokeRect(x + s, y + s, w - 2 * s, hh - 2 * s);
      h.strokeStyle = grey(60);
      h.lineWidth = 3 * s;
      h.strokeRect(x, y, w, hh);
      o.fillStyle = orm(0.6, 0.5, 0.9);
      o.fillRect(x - 3 * s, y - 3 * s, w + 6 * s, 3 * s);
      o.fillRect(x - 3 * s, y + hh, w + 6 * s, 3 * s);
      o.fillRect(x - 3 * s, y, 3 * s, hh);
      o.fillRect(x + w, y, 3 * s, hh);
    };
    const fbmRect = (ctx: Ctx, x: number, y: number, w: number, hh: number, alpha: number) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, hh);
      ctx.clip();
      ctx.translate(x, y);
      ctx.globalCompositeOperation = "overlay";
      noiseFill(ctx, w, hh, Math.max(8, Math.round(w / (3 * s))), alpha, 211 + Math.round(x + y));
      ctx.restore();
    };

    // Seal ring and I/O ring.
    const margin = res * 0.02;
    a.strokeStyle = "#8d98ad";
    a.lineWidth = 6 * s;
    a.strokeRect(margin, margin, res - 2 * margin, res - 2 * margin);
    h.strokeStyle = grey(220);
    h.lineWidth = 6 * s;
    h.strokeRect(margin, margin, res - 2 * margin, res - 2 * margin);
    const ring = res * 0.075;
    const inner = margin + ring;
    // PHY blocks around the ring.
    const phyN = 14;
    const phyLen = (res - 2 * inner) / phyN;
    for (let i = 0; i < phyN; i++) {
      const p = inner + i * phyLen;
      const tone = i % 3 === 0 ? "#4b5a78" : "#3d4a63";
      block(p + 2 * s, margin + 6 * s, phyLen - 4 * s, ring - 8 * s, tone, 0.3, 0.7, "phy");
      block(p + 2 * s, res - margin - ring + 2 * s, phyLen - 4 * s, ring - 8 * s, tone, 0.3, 0.7, "phy");
      block(margin + 6 * s, p + 2 * s, ring - 8 * s, phyLen - 4 * s, tone, 0.3, 0.7, "phy");
      block(res - margin - ring + 2 * s, p + 2 * s, ring - 8 * s, phyLen - 4 * s, tone, 0.3, 0.7, "phy");
    }
    // Bump pads in the ring (regular grid of dull metal dots).
    a.fillStyle = "rgba(205,212,222,0.55)";
    const bp = 12 * s;
    for (let y = margin + bp; y < res - margin; y += bp) for (let x = margin + bp; x < res - margin; x += bp) {
      const inRing = x < inner || x > res - inner || y < inner || y > res - inner;
      if (!inRing) continue;
      a.beginPath();
      a.arc(x, y, 2.2 * s, 0, Math.PI * 2);
      a.fill();
    }
    // Core grid: 2 columns x 4 rows, with a cache spine in the middle.
    const coreArea = res - 2 * inner - 20 * s;
    const spine = coreArea * 0.14;
    const coreW = (coreArea - spine) / 2 - 12 * s;
    const coreH = coreArea / 4 - 12 * s;
    const x0 = inner + 10 * s;
    const y0 = inner + 10 * s;
    for (let row = 0; row < 4; row++) for (let col = 0; col < 2; col++) {
      const x = x0 + col * (coreW + spine + 24 * s);
      const y = y0 + row * (coreH + 12 * s);
      // L2 SRAM block on the spine side, logic on the outer side, L1 arrays as small blocks.
      const l2w = coreW * 0.34;
      const logicW = coreW - l2w - 8 * s;
      const l2x = col === 0 ? x + coreW - l2w : x;
      const lx = col === 0 ? x : x + l2w + 8 * s;
      block(l2x, y, l2w, coreH, "#3f5e6c", 0.14, 0.95, "sram");
      block(lx, y, logicW, coreH * 0.62, "#4a4a66", 0.32, 0.5, "logic");
      block(lx, y + coreH * 0.66, logicW * 0.48, coreH * 0.34, "#3d5c6a", 0.16, 0.9, "sram");
      block(lx + logicW * 0.52, y + coreH * 0.66, logicW * 0.48, coreH * 0.34, "#4b4f6a", 0.3, 0.55, "logic");
    }
    // Cache spine: L3 slices and the ring bus.
    const sx = x0 + coreW + 12 * s;
    for (let row = 0; row < 8; row++) {
      const y = y0 + (row * coreArea) / 8;
      block(sx, y + 4 * s, spine, coreArea / 8 - 8 * s, "#50606f", 0.18, 0.8, "cache");
    }
    a.fillStyle = "rgba(220,230,245,0.35)";
    for (let k = 0; k < 6; k++) a.fillRect(sx + spine * 0.2 + k * spine * 0.1, y0, 1.5 * s, coreArea);
    // Corner marks and die ID area.
    a.fillStyle = "#b8c2d4";
    a.fillRect(margin + 10 * s, margin + 10 * s, 20 * s, 4 * s);
    a.fillRect(margin + 10 * s, margin + 10 * s, 4 * s, 20 * s);
  }, { normalStrength: 1, repeat: false });
  const activation = toTexture(act, false, false);
  activation.minFilter = LinearFilter;
  activation.generateMipmaps = false;
  return { ...set, activation };
}

/** Finned aluminium (heat sink faces, VRM sinks). */
export function aluminiumMaps(res = 128): MapSet {
  return mapSet(res, res, (a, h, o) => {
    a.fillStyle = "#b4b8be";
    a.fillRect(0, 0, res, res);
    fbm(a, res, res, 221, [[64, 0.1]], "overlay");
    noiseFill(h, res, res, 128, 0.1, 222);
    o.fillStyle = orm(1, 0.38, 0.95);
    o.fillRect(0, 0, res, res);
    fbm(o, res, res, 223, [[32, 0.15]], "overlay");
  }, { normalStrength: 0.4 });
}

/** A soft dot for point sprites. */
export function dotTexture(res = 64): Texture {
  return glowTexture(res, 2.2);
}
