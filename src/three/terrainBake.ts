/**
 * The baked terrain: everything the ground needs that is too expensive to
 * evaluate per vertex or per pixel, computed once from `heightAt()` (still the
 * single source of terrain truth) on a 2-unit grid.
 *
 *   heights   Float32  GW×GH   vertex-displacement source (texelFetch, exact)
 *   normals   RGBA8    GW×GH   per-pixel normal (xyz) + packed height (a)
 *   features  RGBA8    GW×GH   r forest · g road · b river · a wetness
 *   biome     RGBA8    BW×BH   sRGB ground colour · a volcanic
 *
 * 1.3M `heightAt` calls is ~0.5 s on a fast laptop, so this runs in a worker
 * (terrain.worker.ts) while the reader is still on the book cover; the main
 * thread only receives the transferred buffers (see terrainData.ts).
 */

import * as THREE from "three";
import { MAP_W, MAP_H, SEA_LEVEL, SITES } from "@/data/content";
import { heightAt, padWeight, fbm, noise2 } from "@/three/noise";
import { RIVERS, ROADS, WOODS, type Way } from "@/three/ways";

export const CELL = 2; // world units per height sample
export const GW = MAP_W / CELL + 1; // 1537
export const GH = MAP_H / CELL + 1; // 865
export const BCELL = 4;
export const BW = MAP_W / BCELL + 1; // 769
export const BH = MAP_H / BCELL + 1; // 433
/** packing range of the height stored in the normal texture's alpha */
export const H_MIN = -12;
export const H_MAX = 180;

export const DETAIL = 512; // tileable ground detail, RGBA8
export const WAVES = 256; // tileable sea-surface normals, RGBA8

export interface TerrainData {
  heights: Float32Array;
  normals: Uint8Array;
  features: Uint8Array;
  biome: Uint8Array;
  detail: Uint8Array;
  waves: Uint8Array;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Landmark grounds kept clear of trees — by the bake (no forest floor or
 * canopy there) and by Forests.tsx (no trees). Lórien's landmark is itself a
 * grove of mallorns, so only its city is kept clear, not the Golden Wood.
 */
export const TREE_KEEP_OUT = Object.entries(SITES).map(([id, s]) => ({
  x: s.u * MAP_W,
  z: s.v * MAP_H,
  r: id === "lorien" ? 26 : s.r * 0.85,
}));

/** 0 inside a keep-out, easing up to 1 a few units beyond its edge. */
function treeRoom(x: number, z: number) {
  let m = 1;
  for (const k of TREE_KEEP_OUT) {
    const d2 = (x - k.x) ** 2 + (z - k.z) ** 2;
    if (d2 < (k.r + 6) ** 2) m = Math.min(m, smooth(k.r, k.r + 6, Math.sqrt(d2)));
  }
  return m;
}

// ── rasterising rivers & roads ───────────────────────────────────────────────

/**
 * Stamp a polyline into a GW×GH mask as a soft band. The Catmull-Rom curve is
 * the same smoothing the old ribbon meshes used, so courses are unchanged.
 */
function stampWay(mask: Float32Array, way: Way, widthMul: number, edge: number, ends = true) {
  const curve = new THREE.CatmullRomCurve3(
    way.pts.map(([u, v]) => new THREE.Vector3(u * MAP_W, 0, v * MAP_H)),
    false,
    "centripetal",
  );
  const len = curve.getLength();
  const n = Math.ceil(len / 1.0);
  const p = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    curve.getPointAt(f, p);
    // sources and mouths taper into the land, as the ribbons did
    const taper = ends ? Math.min(1, Math.min(f, 1 - f) * 10 + 0.25) : 1;
    const w = way.w * widthMul * taper;
    const R = w + edge;
    const gx0 = Math.max(0, Math.floor((p.x - R) / CELL));
    const gx1 = Math.min(GW - 1, Math.ceil((p.x + R) / CELL));
    const gz0 = Math.max(0, Math.floor((p.z - R) / CELL));
    const gz1 = Math.min(GH - 1, Math.ceil((p.z + R) / CELL));
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const dx = gx * CELL - p.x;
        const dz = gz * CELL - p.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const v = smooth(w + edge, w - Math.min(edge, w) * 0.5, d);
        const k = gz * GW + gx;
        if (v > mask[k]) mask[k] = v;
      }
    }
  }
}

// ── climate & biome colour ──────────────────────────────────────────────────

type RGB = [number, number, number];
const PAL: Record<string, RGB> = {
  tundra: [0.66, 0.67, 0.6],
  moss: [0.42, 0.47, 0.32],
  lush: [0.3, 0.44, 0.15],
  meadow: [0.4, 0.49, 0.2],
  golden: [0.6, 0.55, 0.28],
  steppe: [0.56, 0.51, 0.34],
  brown: [0.47, 0.4, 0.27],
  dead: [0.4, 0.39, 0.3],
  sand: [0.74, 0.62, 0.42],
  deep: [0.27, 0.38, 0.14],
  ash: [0.2, 0.18, 0.165],
  shire: [0.34, 0.5, 0.16],
  lorien: [0.52, 0.52, 0.2],
  mirk: [0.2, 0.29, 0.13],
  fangorn: [0.24, 0.34, 0.15],
};

/** Regional character, as soft discs: centre (u, v), radius in world units. */
const REGION_TINTS: { u: number; v: number; r: number; c: RGB; w: number }[] = [
  { u: 0.352, v: 0.262, r: 230, c: PAL.shire, w: 0.85 }, // the Shire
  { u: 0.25, v: 0.26, r: 260, c: PAL.lush, w: 0.6 }, // Lindon
  { u: 0.52, v: 0.505, r: 250, c: PAL.golden, w: 0.8 }, // Rohan
  { u: 0.462, v: 0.44, r: 150, c: PAL.brown, w: 0.45 }, // Dunland
  { u: 0.632, v: 0.43, r: 190, c: PAL.brown, w: 0.85 }, // the Brown Lands
  { u: 0.64, v: 0.502, r: 120, c: PAL.dead, w: 0.85 }, // Dagorlad, the Dead Marshes
  { u: 0.548, v: 0.376, r: 70, c: PAL.lorien, w: 0.7 }, // Lórien
  { u: 0.625, v: 0.27, r: 300, c: PAL.mirk, w: 0.75 }, // Mirkwood
  { u: 0.522, v: 0.447, r: 85, c: PAL.fangorn, w: 0.7 }, // Fangorn
  { u: 0.628, v: 0.6, r: 90, c: PAL.deep, w: 0.75 }, // Ithilien
  { u: 0.57, v: 0.665, r: 210, c: PAL.meadow, w: 0.6 }, // Lebennin, Lossarnach
  { u: 0.83, v: 0.44, r: 380, c: PAL.steppe, w: 0.55 }, // Rhûn
];

/** Ash lands, as ellipses (world-unit radii) fitted inside the mountain rims. */
const VOLCANIC: { u: number; v: number; rx: number; rz: number }[] = [
  { u: 0.739, v: 0.646, rx: 268, rz: 168 }, // Mordor: Gorgoroth, Nurn and the inner plateau
  // and the rims themselves — ash and basalt, never snow
  { u: 0.734, v: 0.539, rx: 300, rz: 46 }, // Ered Lithui, the Ash Mountains
  { u: 0.643, v: 0.640, rx: 44, rz: 170 }, // Ephel Dúath, the Mountains of Shadow
  { u: 0.737, v: 0.743, rx: 300, rz: 42 }, // the southern rim
];

function biomeAt(x: number, z: number, out: Uint8Array, o: number) {
  const u = x / MAP_W;
  const v = z / MAP_H;
  const n1 = fbm(x * 0.0035 + 71, z * 0.0035 - 13, 3);
  const n2 = fbm(x * 0.012 - 5, z * 0.012 + 33, 3);

  // temperature runs north → south, moisture west (the Sea) → east (Rhûn) and
  // dries again toward Harad
  const T = clamp01(smooth(0.06, 0.82, v) + n1 * 0.08);
  const M = clamp01(0.78 - 0.5 * smooth(0.55, 0.95, u) - 0.4 * smooth(0.68, 0.86, v) + n1 * 0.18);

  const cold: RGB = [0, 0, 0];
  const temp: RGB = [0, 0, 0];
  const hot: RGB = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    cold[i] = mix(PAL.steppe[i] * 0.95, PAL.moss[i], M);
    temp[i] = mix(PAL.golden[i], PAL.lush[i], M);
    hot[i] = mix(PAL.sand[i], PAL.deep[i], M * 0.8);
  }
  const c: RGB = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    c[i] = T < 0.5 ? mix(cold[i], temp[i], T * 2) : mix(temp[i], hot[i], (T - 0.5) * 2);
  }
  // the frozen north fades toward bare tundra
  const north = smooth(0.14, 0.05, v);
  for (let i = 0; i < 3; i++) c[i] = mix(c[i], PAL.tundra[i], north * 0.8);

  for (const r of REGION_TINTS) {
    const d = Math.hypot(x - r.u * MAP_W, z - r.v * MAP_H);
    if (d > r.r * 1.15) continue;
    const w = smooth(r.r * (1.1 + n2 * 0.3), r.r * 0.45, d) * r.w;
    for (let i = 0; i < 3; i++) c[i] = mix(c[i], r.c[i], w);
  }

  let volc = 0;
  for (const m of VOLCANIC) {
    const e = Math.hypot((x - m.u * MAP_W) / m.rx, (z - m.v * MAP_H) / m.rz);
    volc = Math.max(volc, smooth(1.05 + n2 * 0.15, 0.78, e));
  }
  for (let i = 0; i < 3; i++) c[i] = mix(c[i], PAL.ash[i] * (0.9 + n2 * 0.3), volc);

  // patchiness — meadow light and shade at a few hundred units
  const patch = 0.92 + n2 * 0.16;
  out[o] = Math.round(clamp01(c[0] * patch) * 255);
  out[o + 1] = Math.round(clamp01(c[1] * patch) * 255);
  out[o + 2] = Math.round(clamp01(c[2] * patch) * 255);
  out[o + 3] = Math.round(volc * 255);
}

// ── tileable detail ─────────────────────────────────────────────────────────

/** Value noise on a wrapped n×n lattice — tiles exactly over [0,1)². */
function lattice(n: number, seed: number) {
  let s = seed >>> 0;
  const g = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    g[i] = s / 4294967296;
  }
  return (u: number, v: number) => {
    const fx = u * n;
    const fy = v * n;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const ex = tx * tx * (3 - 2 * tx);
    const ey = ty * ty * (3 - 2 * ty);
    const at = (ix: number, iy: number) => g[(((iy % n) + n) % n) * n + (((ix % n) + n) % n)];
    const a = mix(at(x0, y0), at(x0 + 1, y0), ex);
    const b = mix(at(x0, y0 + 1), at(x0 + 1, y0 + 1), ex);
    return mix(a, b, ey);
  };
}

function tileFbm(base: number, octaves: number, seed: number) {
  const layers = Array.from({ length: octaves }, (_, i) => lattice(base << i, seed + i * 7919));
  return (u: number, v: number) => {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (const l of layers) {
      sum += l(u, v) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

/** Wrapped cellular noise: distance to the nearest of one jittered point per cell. */
function tileCells(n: number, seed: number) {
  let s = seed >>> 0;
  const pts = new Float32Array(n * n * 2);
  for (let i = 0; i < n * n * 2; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    pts[i] = s / 4294967296;
  }
  return (u: number, v: number) => {
    const fx = u * n;
    const fy = v * n;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    let best = 9;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const ix = (((cx + ox) % n) + n) % n;
        const iy = (((cy + oy) % n) + n) % n;
        const px = cx + ox + pts[(iy * n + ix) * 2];
        const py = cy + oy + pts[(iy * n + ix) * 2 + 1];
        const d = Math.hypot(px - fx, py - fy);
        if (d < best) best = d;
      }
    }
    return best;
  };
}

/**
 * r grass/meadow relief · g rock (ridges + strata) · b soil & pebbles ·
 * a macro variation. Luminance only — colour comes from the biome.
 */
function buildDetail() {
  const S = DETAIL;
  const out = new Uint8Array(S * S * 4);
  const fine = tileFbm(32, 4, 11);
  const blades = tileFbm(64, 2, 23);
  const rockA = tileFbm(8, 5, 37);
  const rockB = tileFbm(16, 3, 41);
  const warp = tileFbm(4, 3, 53);
  const cells = tileCells(24, 61);
  const soil = tileFbm(16, 4, 67);
  const macro = tileFbm(3, 4, 71);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const grass = fine(u, v) * 0.6 + blades(u, v) * 0.4;
      const ridge = 1 - Math.abs(rockA(u, v) * 2 - 1);
      // strata run along v (vertical in the side projections of the rock)
      const strata = 0.5 + 0.5 * Math.sin((v + warp(u, v) * 0.35) * Math.PI * 2 * 9);
      const rock = ridge * ridge * 0.55 + rockB(u, v) * 0.25 + strata * 0.2;
      const pebble = smooth(0.42, 0.12, cells(u, v));
      const dirt = soil(u, v) * 0.6 + pebble * 0.4;
      const o = (y * S + x) * 4;
      out[o] = Math.round(clamp01(grass) * 255);
      out[o + 1] = Math.round(clamp01(rock) * 255);
      out[o + 2] = Math.round(clamp01(dirt) * 255);
      out[o + 3] = Math.round(clamp01(macro(u, v)) * 255);
    }
  }
  return out;
}

/** Sea swell normals: the gradient of a tileable fbm, packed xyz → rgb. */
function buildWaves() {
  const S = WAVES;
  const f = tileFbm(4, 5, 97);
  const hgt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) hgt[y * S + x] = f(x / S, y / S);
  const out = new Uint8Array(S * S * 4);
  const k = 7;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const at = (ix: number, iy: number) => hgt[((iy + S) % S) * S + ((ix + S) % S)];
      const nx = (at(x - 1, y) - at(x + 1, y)) * k;
      const nz = (at(x, y - 1) - at(x, y + 1)) * k;
      const len = Math.hypot(nx, 1, nz);
      const o = (y * S + x) * 4;
      out[o] = Math.round((nx / len * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((1 / len * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
      out[o + 3] = Math.round(clamp01(at(x, y)) * 255);
    }
  }
  return out;
}

// ── the bake ────────────────────────────────────────────────────────────────

export function buildTerrainData(): TerrainData {
  const N = GW * GH;
  const heights = new Float32Array(N);
  for (let gz = 0; gz < GH; gz++) {
    for (let gx = 0; gx < GW; gx++) heights[gz * GW + gx] = heightAt(gx * CELL, gz * CELL);
  }

  // rivers & roads
  const river = new Float32Array(N);
  const wet = new Float32Array(N);
  const road = new Float32Array(N);
  for (const w of RIVERS) {
    stampWay(river, w, 1, 2.5);
    stampWay(wet, w, 1, 26);
  }
  for (const w of ROADS) stampWay(road, w, 1, 1.6, false);

  // carve the river beds a little so they read as cut into the land, not
  // painted on it — never below the sea, and never on the open sea itself
  for (let k = 0; k < N; k++) {
    if (river[k] <= 0) continue;
    // no river under a landmark: its pad keeps the ground level and dry, or
    // the structure (anchored on heightAt) would stand over a carved bed
    river[k] *= 1 - padWeight((k % GW) * CELL, Math.floor(k / GW) * CELL);
    const r = river[k];
    const h = heights[k];
    if (h > SEA_LEVEL + 0.4) heights[k] = Math.max(SEA_LEVEL + 0.3, h - r * 1.8);
  }

  // forest density
  const forest = new Float32Array(N);
  for (const w of WOODS) {
    const cx = w.u * MAP_W;
    const cz = w.v * MAP_H;
    const rx = w.ru * MAP_W * 1.25;
    const rz = w.rv * MAP_H * 1.25;
    const gx0 = Math.max(0, Math.floor((cx - rx) / CELL));
    const gx1 = Math.min(GW - 1, Math.ceil((cx + rx) / CELL));
    const gz0 = Math.max(0, Math.floor((cz - rz) / CELL));
    const gz1 = Math.min(GH - 1, Math.ceil((cz + rz) / CELL));
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const x = gx * CELL;
        const z = gz * CELL;
        const du = (x - cx) / (w.ru * MAP_W);
        const dv = (z - cz) / (w.rv * MAP_H);
        // ragged edges and glades rather than a clean ellipse
        const e = du * du + dv * dv + noise2(x * 0.02 + 9, z * 0.02) * 0.35;
        const glade = smooth(-0.35, 0.05, fbm(x * 0.011 + 3, z * 0.011 - 8, 3));
        const val = smooth(1.15, 0.7, e) * w.density * (0.55 + 0.45 * glade);
        const k = gz * GW + gx;
        if (val > forest[k]) forest[k] = val;
      }
    }
  }

  // normals from the (carved) heights, plus the packed height
  const normals = new Uint8Array(N * 4);
  const features = new Uint8Array(N * 4);
  for (let gz = 0; gz < GH; gz++) {
    for (let gx = 0; gx < GW; gx++) {
      const k = gz * GW + gx;
      const xl = heights[gz * GW + Math.max(0, gx - 1)];
      const xr = heights[gz * GW + Math.min(GW - 1, gx + 1)];
      const zd = heights[Math.max(0, gz - 1) * GW + gx];
      const zu = heights[Math.min(GH - 1, gz + 1) * GW + gx];
      const sx = gx === 0 || gx === GW - 1 ? 1 : 2;
      const sz = gz === 0 || gz === GH - 1 ? 1 : 2;
      let nx = -(xr - xl) / (sx * CELL);
      let nz = -(zu - zd) / (sz * CELL);
      let ny = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const o = k * 4;
      normals[o] = Math.round((nx * 0.5 + 0.5) * 255);
      normals[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normals[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normals[o + 3] = Math.round(clamp01((heights[k] - H_MIN) / (H_MAX - H_MIN)) * 255);

      // trees thin out on steep ground, above the tree line, by the water
      const h = heights[k];
      const treeOk = smooth(0.62, 0.8, ny) * smooth(SEA_LEVEL + 0.8, SEA_LEVEL + 3, h) * smooth(70, 48, h);
      let f = forest[k] * treeOk * (1 - river[k]) * (1 - road[k]);
      if (f > 0) f *= treeRoom(gx * CELL, gz * CELL);
      features[o] = Math.round(clamp01(f) * 255);
      features[o + 1] = Math.round(clamp01(road[k] * (1 - river[k])) * 255);
      features[o + 2] = Math.round(clamp01(river[k]) * 255);
      features[o + 3] = Math.round(clamp01(wet[k]) * 255);
    }
  }

  const biome = new Uint8Array(BW * BH * 4);
  for (let bz = 0; bz < BH; bz++) {
    for (let bx = 0; bx < BW; bx++) biomeAt(bx * BCELL, bz * BCELL, biome, (bz * BW + bx) * 4);
  }

  return { heights, normals, features, biome, detail: buildDetail(), waves: buildWaves() };
}

/** Bilinear ground height from the baked grid (includes river carving). */
export function sampleHeight(d: TerrainData, x: number, z: number) {
  const gx = Math.min(Math.max(x / CELL, 0), GW - 1.001);
  const gz = Math.min(Math.max(z / CELL, 0), GH - 1.001);
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  const k = iz * GW + ix;
  const h = d.heights;
  return mix(mix(h[k], h[k + 1], fx), mix(h[k + GW], h[k + GW + 1], fx), fz);
}

/** Nearest-sample feature channel (0..1): 0 forest, 1 road, 2 river, 3 wet. */
export function sampleFeature(d: TerrainData, x: number, z: number, ch: 0 | 1 | 2 | 3) {
  const gx = Math.min(Math.max(Math.round(x / CELL), 0), GW - 1);
  const gz = Math.min(Math.max(Math.round(z / CELL), 0), GH - 1);
  return d.features[(gz * GW + gx) * 4 + ch] / 255;
}

/** Up-component of the baked normal at (x, z). */
export function sampleUp(d: TerrainData, x: number, z: number) {
  const gx = Math.min(Math.max(Math.round(x / CELL), 0), GW - 1);
  const gz = Math.min(Math.max(Math.round(z / CELL), 0), GH - 1);
  return (d.normals[(gz * GW + gx) * 4 + 1] / 255) * 2 - 1;
}
