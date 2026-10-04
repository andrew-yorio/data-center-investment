import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Rack front: stacked server units with perforated vents. */
export function rackFrontTexture(): CanvasTexture {
  return canvas(128, 512, (g) => {
    g.fillStyle = "#0b1322";
    g.fillRect(0, 0, 128, 512);
    const units = 20;
    const uh = 512 / units;
    for (let u = 0; u < units; u++) {
      const y = u * uh;
      g.fillStyle = u % 5 === 4 ? "#0e1a2e" : "#121f36";
      g.fillRect(6, y + 2, 116, uh - 4);
      g.fillStyle = "#070d18";
      for (let x = 14; x < 100; x += 6) for (let yy = y + 7; yy < y + uh - 6; yy += 5) g.fillRect(x, yy, 3, 2);
      g.fillStyle = "#24365a";
      g.fillRect(104, y + 6, 12, uh - 12);
    }
  });
}

/** Raised-floor tiles. */
export function floorTexture(): CanvasTexture {
  const tex = canvas(256, 256, (g) => {
    g.fillStyle = "#0b1528";
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "#16284a";
    g.lineWidth = 3;
    for (let i = 0; i <= 256; i += 128) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 256);
      g.moveTo(0, i);
      g.lineTo(256, i);
      g.stroke();
    }
    g.fillStyle = "#0f1d36";
    for (let x = 16; x < 128; x += 12) for (let y = 16; y < 128; y += 12) g.fillRect(x + 128, y + 128, 4, 4);
  });
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(30, 18);
  return tex;
}

/** Circuit board around the processor package. */
export function boardTexture(): CanvasTexture {
  return canvas(512, 512, (g) => {
    g.fillStyle = "#08202a";
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = "#0f3a46";
    g.lineWidth = 2;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 140; i++) {
      let x = 256 + (rnd() - 0.5) * 120;
      let y = 256 + (rnd() - 0.5) * 120;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        if (s % 2) x += (rnd() - 0.5) * 220;
        else y += (rnd() - 0.5) * 220;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = "#1b4a52";
    for (let i = 0; i < 60; i++) g.fillRect(rnd() * 512, rnd() * 512, 10, 6);
  });
}

/** Silicon die: a grid of functional blocks. */
export function dieTexture(): CanvasTexture {
  return canvas(512, 512, (g) => {
    g.fillStyle = "#0a1220";
    g.fillRect(0, 0, 512, 512);
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) {
      const w = 20 + rnd() * 90;
      const h = 20 + rnd() * 90;
      g.fillStyle = `rgba(${40 + rnd() * 30}, ${60 + rnd() * 40}, ${100 + rnd() * 60}, ${0.18 + rnd() * 0.2})`;
      g.fillRect(16 + rnd() * (480 - w), 16 + rnd() * (480 - h), w, h);
    }
    g.strokeStyle = "rgba(90,168,255,0.12)";
    for (let i = 16; i < 500; i += 8) {
      g.beginPath();
      g.moveTo(i, 16);
      g.lineTo(i, 496);
      g.stroke();
    }
    g.strokeStyle = "#1e3358";
    g.lineWidth = 6;
    g.strokeRect(8, 8, 496, 496);
  });
}
