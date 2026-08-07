/**
 * Procedural PBR surfaces for the world's architecture.
 *
 * Every texture is drawn once into a canvas on the client (never at module
 * scope — these components server-render), then shared by every landmark.
 * Each set is albedo + normal + roughness at 256², so the whole library costs
 * a few MB of VRAM and nothing on the wire.
 *
 * Materials are tinted through `color` and per-vertex colours (see kit.ts), so
 * one masonry texture serves Gondor's marble, Moria's basalt and Dale's ruins.
 */

import * as THREE from "three";

type Ctx = CanvasRenderingContext2D;

function makeCanvas(size: number, h = size) {
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = h;
  return cv;
}

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function texture(cv: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Tangent-space normals from a height canvas. Written back through a canvas
 * (not a DataTexture) so flipY matches the albedo — a DataTexture defaults to
 * flipY:false and would light the surface upside-down against its own colour.
 */
function normalFromHeight(src: HTMLCanvasElement, strength: number) {
  const w = src.width;
  const h = src.height;
  const data = src.getContext("2d")!.getImageData(0, 0, w, h).data;
  const at = (x: number, y: number) =>
    data[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;

  const out = makeCanvas(w, h);
  const octx = out.getContext("2d")!;
  const img = octx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // v runs up the image (flipY), so +v is -y in canvas space
      const nx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const ny = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return texture(out, false);
}

/** Roughness from the same height field: recesses (mortar, gaps) read rougher. */
function roughFromHeight(src: HTMLCanvasElement, lo: number, hi: number) {
  const w = src.width;
  const h = src.height;
  const data = src.getContext("2d")!.getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const octx = out.getContext("2d")!;
  const img = octx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = data[i * 4] / 255;
    const r = Math.round((hi + (lo - hi) * v) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = r;
    img.data[i * 4 + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return texture(out, false);
}

/** Tangent-space normals from any height/luminance canvas. */
export const heightToNormal = normalFromHeight;
/** Greyscale roughness from any height canvas; recesses read rougher. */
export const heightToRoughness = roughFromHeight;

export interface Surface {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

function surface(
  size: number,
  draw: (color: Ctx, height: Ctx, rnd: () => number) => void,
  opts: { seed: number; normal: number; roughLo: number; roughHi: number },
): Surface {
  const colorCv = makeCanvas(size);
  const heightCv = makeCanvas(size);
  draw(colorCv.getContext("2d")!, heightCv.getContext("2d")!, seeded(opts.seed));
  return {
    map: texture(colorCv, true),
    normalMap: normalFromHeight(heightCv, opts.normal),
    roughnessMap: roughFromHeight(heightCv, opts.roughLo, opts.roughHi),
  };
}

const grey = (v: number) => `rgb(${v | 0},${v | 0},${v | 0})`;

/** ctx.roundRect is recent enough that it is not worth risking — trace it. */
function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number | [number, number, number, number]) {
  const [tl, tr, br, bl] = typeof r === "number" ? [r, r, r, r] : r;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

/** Speckle a rectangle with fine grain — breaks up flat canvas fills. */
function speckle(ctx: Ctx, x: number, y: number, w: number, h: number, rnd: () => number, amt: number, n: number) {
  for (let i = 0; i < n; i++) {
    const px = x + rnd() * w;
    const py = y + rnd() * h;
    const r = 0.4 + rnd() * 1.6;
    ctx.fillStyle = `rgba(0,0,0,${rnd() * amt})`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Coursed ashlar: squared blocks in regular rows, recessed mortar joints. */
function ashlar(rows: number, cols: number, jitter: number, chamfer: number) {
  return (c: Ctx, hgt: Ctx, rnd: () => number) => {
    const S = c.canvas.width;
    const rh = S / rows;
    const cw = S / cols;
    c.fillStyle = "#6d6459";
    c.fillRect(0, 0, S, S);
    hgt.fillStyle = grey(46);
    hgt.fillRect(0, 0, S, S);

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * cw * 0.5;
      for (let k = -1; k <= cols; k++) {
        const x = k * cw + offset + 1.2;
        const y = r * rh + 1.2;
        const w = cw - 2.4;
        const h = rh - 2.4;
        const shade = 176 + (rnd() - 0.5) * jitter;
        c.fillStyle = grey(shade);
        c.fillRect(x, y, w, h);
        // a lit chamfer at the top of every block, shadow along the bottom
        c.fillStyle = `rgba(255,255,255,${chamfer})`;
        c.fillRect(x, y, w, 1.6);
        c.fillStyle = `rgba(0,0,0,${chamfer * 1.3})`;
        c.fillRect(x, y + h - 1.8, w, 1.8);
        speckle(c, x, y, w, h, rnd, 0.12, Math.round(w * h * 0.02));

        const hv = 196 + (rnd() - 0.5) * 26;
        hgt.fillStyle = grey(hv);
        hgt.fillRect(x, y, w, h);
        hgt.fillStyle = grey(hv * 0.82);
        hgt.fillRect(x, y + h - 2, w, 2);
      }
    }
  };
}

/** Undressed rubble: irregular stones of many sizes, deep joints. */
function rubble(c: Ctx, hgt: Ctx, rnd: () => number) {
  const S = c.canvas.width;
  c.fillStyle = "#4c463d";
  c.fillRect(0, 0, S, S);
  hgt.fillStyle = grey(38);
  hgt.fillRect(0, 0, S, S);
  const rows = 9;
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * 40;
    const y = (r / rows) * S;
    const h = S / rows;
    while (x < S) {
      const w = h * (0.7 + rnd() * 1.9);
      const pad = 1.6;
      const shade = 168 + (rnd() - 0.5) * 52;
      const rr = Math.min(w, h) * 0.22;
      const box = (ctx: Ctx, fill: string) => {
        ctx.fillStyle = fill;
        roundRect(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, rr);
        ctx.fill();
      };
      box(c, grey(shade));
      c.fillStyle = `rgba(255,255,255,0.09)`;
      c.fillRect(x + pad, y + pad, w - pad * 2, 1.4);
      speckle(c, x, y, w, h, rnd, 0.18, Math.round(w * h * 0.03));
      box(hgt, grey(180 + (rnd() - 0.5) * 44));
      x += w;
    }
  }
}

/** Natural rock face: fbm-ish blotches with sharp fracture lines. */
function rockface(c: Ctx, hgt: Ctx, rnd: () => number) {
  const S = c.canvas.width;
  c.fillStyle = "#57503f";
  c.fillRect(0, 0, S, S);
  hgt.fillStyle = grey(140);
  hgt.fillRect(0, 0, S, S);
  for (let i = 0; i < 340; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 6 + rnd() * 34;
    const v = rnd();
    c.fillStyle = `rgba(${120 + v * 90 | 0},${112 + v * 84 | 0},${96 + v * 76 | 0},0.5)`;
    c.beginPath();
    c.ellipse(x, y, r, r * (0.5 + rnd() * 0.7), rnd() * 3, 0, Math.PI * 2);
    c.fill();
    hgt.fillStyle = `rgba(${(110 + v * 120) | 0},${(110 + v * 120) | 0},${(110 + v * 120) | 0},0.42)`;
    hgt.beginPath();
    hgt.ellipse(x, y, r, r * (0.5 + rnd() * 0.7), rnd() * 3, 0, Math.PI * 2);
    hgt.fill();
  }
  // fractures
  for (let i = 0; i < 16; i++) {
    let x = rnd() * S;
    let y = rnd() * S;
    c.strokeStyle = "rgba(0,0,0,0.42)";
    hgt.strokeStyle = "rgba(0,0,0,0.6)";
    c.lineWidth = 1 + rnd() * 2;
    hgt.lineWidth = c.lineWidth;
    c.beginPath();
    hgt.beginPath();
    c.moveTo(x, y);
    hgt.moveTo(x, y);
    const a0 = rnd() * Math.PI * 2;
    for (let k = 0; k < 7; k++) {
      x += Math.cos(a0 + (rnd() - 0.5) * 1.6) * 22;
      y += Math.sin(a0 + (rnd() - 0.5) * 1.6) * 22;
      c.lineTo(x, y);
      hgt.lineTo(x, y);
    }
    c.stroke();
    hgt.stroke();
  }
  speckle(c, 0, 0, S, S, rnd, 0.22, 2600);
}

/** Sawn timber: vertical boards with grain and nail-line shadows. */
function planks(c: Ctx, hgt: Ctx, rnd: () => number) {
  const S = c.canvas.width;
  const n = 6;
  const bw = S / n;
  for (let i = 0; i < n; i++) {
    const x = i * bw;
    const base = 118 + rnd() * 44;
    c.fillStyle = `rgb(${base | 0},${(base * 0.72) | 0},${(base * 0.44) | 0})`;
    c.fillRect(x, 0, bw, S);
    hgt.fillStyle = grey(180 + rnd() * 40);
    hgt.fillRect(x, 0, bw, S);
    // grain
    for (let g = 0; g < 26; g++) {
      const gx = x + 2 + rnd() * (bw - 4);
      c.strokeStyle = `rgba(60,38,16,${0.06 + rnd() * 0.16})`;
      c.lineWidth = 0.6 + rnd() * 1.4;
      c.beginPath();
      c.moveTo(gx, 0);
      for (let y = 0; y <= S; y += 18) c.lineTo(gx + Math.sin(y * 0.04 + g) * 1.8, y);
      c.stroke();
    }
    // board gap
    c.fillStyle = "rgba(0,0,0,0.55)";
    c.fillRect(x + bw - 2, 0, 2, S);
    hgt.fillStyle = grey(60);
    hgt.fillRect(x + bw - 2, 0, 2, S);
  }
  speckle(c, 0, 0, S, S, rnd, 0.1, 1400);
}

/** Thatch: layered straw, combed downward, deep shadow between courses. */
function thatch(c: Ctx, hgt: Ctx, rnd: () => number) {
  const S = c.canvas.width;
  c.fillStyle = "#6d5623";
  c.fillRect(0, 0, S, S);
  hgt.fillStyle = grey(70);
  hgt.fillRect(0, 0, S, S);
  const courses = 5;
  for (let r = 0; r < courses; r++) {
    const y0 = (r / courses) * S;
    const ch = S / courses;
    for (let i = 0; i < 900; i++) {
      const x = rnd() * S;
      const y = y0 + rnd() * ch;
      const len = ch * (0.5 + rnd() * 0.6);
      const t = (y - y0) / ch;
      const v = 120 + t * 96 + rnd() * 40;
      c.strokeStyle = `rgb(${v | 0},${(v * 0.82) | 0},${(v * 0.46) | 0})`;
      c.lineWidth = 0.7 + rnd() * 1.1;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (rnd() - 0.5) * 6, y + len);
      c.stroke();
      hgt.strokeStyle = grey(90 + t * 150 + rnd() * 30);
      hgt.lineWidth = c.lineWidth;
      hgt.beginPath();
      hgt.moveTo(x, y);
      hgt.lineTo(x + (rnd() - 0.5) * 6, y + len);
      hgt.stroke();
    }
    // shadow under the overhang of the next course
    c.fillStyle = "rgba(0,0,0,0.42)";
    c.fillRect(0, y0, S, 3);
    hgt.fillStyle = grey(34);
    hgt.fillRect(0, y0, S, 3);
  }
}

/** Roof slates: overlapping courses with rounded butts. */
function slates(c: Ctx, hgt: Ctx, rnd: () => number) {
  const S = c.canvas.width;
  c.fillStyle = "#2f3338";
  c.fillRect(0, 0, S, S);
  hgt.fillStyle = grey(40);
  hgt.fillRect(0, 0, S, S);
  const rows = 7;
  const cols = 6;
  const rh = S / rows;
  const cw = S / cols;
  for (let r = rows - 1; r >= 0; r--) {
    for (let k = -1; k <= cols; k++) {
      const x = k * cw + (r % 2) * cw * 0.5;
      const y = r * rh;
      const v = 96 + rnd() * 54;
      const corners: [number, number, number, number] = [1, 1, cw * 0.34, cw * 0.34];
      c.fillStyle = `rgb(${v | 0},${(v * 1.03) | 0},${(v * 1.12) | 0})`;
      roundRect(c, x + 1, y, cw - 2, rh * 1.55, corners);
      c.fill();
      c.fillStyle = "rgba(0,0,0,0.34)";
      c.fillRect(x + 1, y, cw - 2, 2.4);
      hgt.fillStyle = grey(150 + rnd() * 60);
      roundRect(hgt, x + 1, y, cw - 2, rh * 1.55, corners);
      hgt.fill();
      hgt.fillStyle = grey(52);
      hgt.fillRect(x + 1, y, cw - 2, 2.4);
    }
  }
  speckle(c, 0, 0, S, S, rnd, 0.16, 2000);
}

/** Hammered metal: shallow dents, no tiling seams to speak of. */
function hammered(c: Ctx, hgt: Ctx, rnd: () => number) {
  const S = c.canvas.width;
  c.fillStyle = "#b9b9b9";
  c.fillRect(0, 0, S, S);
  hgt.fillStyle = grey(150);
  hgt.fillRect(0, 0, S, S);
  for (let i = 0; i < 520; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 3 + rnd() * 11;
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0.5, x, y, r);
    const v = 168 + rnd() * 78;
    g.addColorStop(0, `rgba(255,255,255,0.30)`);
    g.addColorStop(0.6, `rgba(${v | 0},${v | 0},${v | 0},0.20)`);
    g.addColorStop(1, "rgba(40,40,40,0.16)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    const hg = hgt.createRadialGradient(x, y, 0.5, x, y, r);
    hg.addColorStop(0, `rgba(${(120 + rnd() * 110) | 0},0,0,0.4)`);
    hg.addColorStop(1, "rgba(150,0,0,0)");
    hgt.fillStyle = hg;
    hgt.beginPath();
    hgt.arc(x, y, r, 0, Math.PI * 2);
    hgt.fill();
  }
}

/** Mottled organics — foliage canopies, turf, mounded earth. */
function organic(c: Ctx, hgt: Ctx, rnd: () => number) {
  const S = c.canvas.width;
  c.fillStyle = "#8f8f8f";
  c.fillRect(0, 0, S, S);
  hgt.fillStyle = grey(128);
  hgt.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 2 + rnd() * 13;
    const v = rnd();
    c.fillStyle = `rgba(${(120 + v * 130) | 0},${(120 + v * 130) | 0},${(120 + v * 130) | 0},0.32)`;
    c.beginPath();
    c.ellipse(x, y, r, r * (0.5 + rnd() * 0.8), rnd() * 3, 0, Math.PI * 2);
    c.fill();
    hgt.fillStyle = `rgba(${(90 + v * 150) | 0},0,0,0.3)`;
    hgt.beginPath();
    hgt.ellipse(x, y, r, r * (0.5 + rnd() * 0.8), rnd() * 3, 0, Math.PI * 2);
    hgt.fill();
  }
}

export interface Library {
  ashlar: Surface;
  rubble: Surface;
  rock: Surface;
  timber: Surface;
  thatch: Surface;
  slate: Surface;
  metal: Surface;
  organic: Surface;
}

let lib: Library | null = null;

/** Build (once) and return the shared texture library. Client-side only. */
export function surfaces(): Library {
  if (lib) return lib;
  lib = {
    ashlar: surface(256, ashlar(9, 6, 44, 0.14), { seed: 11, normal: 2.6, roughLo: 0.62, roughHi: 0.98 }),
    rubble: surface(256, rubble, { seed: 23, normal: 3.4, roughLo: 0.72, roughHi: 1.0 }),
    rock: surface(256, rockface, { seed: 37, normal: 3.0, roughLo: 0.8, roughHi: 1.0 }),
    timber: surface(256, planks, { seed: 53, normal: 1.6, roughLo: 0.66, roughHi: 0.95 }),
    thatch: surface(256, thatch, { seed: 71, normal: 3.2, roughLo: 0.88, roughHi: 1.0 }),
    slate: surface(256, slates, { seed: 89, normal: 2.4, roughLo: 0.44, roughHi: 0.86 }),
    metal: surface(256, hammered, { seed: 97, normal: 1.5, roughLo: 0.22, roughHi: 0.58 }),
    organic: surface(256, organic, { seed: 101, normal: 2.0, roughLo: 0.8, roughHi: 1.0 }),
  };
  return lib;
}

/** A textured standard material. `tint` multiplies the (greyscale) albedo. */
export function pbr(
  s: Surface,
  tint: string,
  opts: {
    metalness?: number;
    roughness?: number;
    normalScale?: number;
    envMapIntensity?: number;
    vertexColors?: boolean;
    side?: THREE.Side;
    emissive?: string;
    emissiveIntensity?: number;
  } = {},
) {
  const m = new THREE.MeshStandardMaterial({
    color: tint,
    map: s.map,
    normalMap: s.normalMap,
    roughnessMap: s.roughnessMap,
    // roughness/metalness scale their maps, so 1.0 lets the map speak
    roughness: opts.roughness ?? 1,
    metalness: opts.metalness ?? 0,
    vertexColors: opts.vertexColors ?? true,
    side: opts.side,
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : undefined,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
  m.normalScale.set(opts.normalScale ?? 1, opts.normalScale ?? 1);
  m.envMapIntensity = opts.envMapIntensity ?? 1;
  return m;
}

/** An untextured standard material (small props, glows, glass). */
export function plain(
  tint: string,
  opts: {
    metalness?: number;
    roughness?: number;
    envMapIntensity?: number;
    vertexColors?: boolean;
    side?: THREE.Side;
    emissive?: string;
    emissiveIntensity?: number;
    transparent?: boolean;
    opacity?: number;
  } = {},
) {
  const m = new THREE.MeshStandardMaterial({
    color: tint,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0,
    vertexColors: opts.vertexColors ?? true,
    side: opts.side,
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : undefined,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent,
    opacity: opts.opacity ?? 1,
  });
  m.envMapIntensity = opts.envMapIntensity ?? 1;
  return m;
}
