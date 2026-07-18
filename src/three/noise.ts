import { MAP_W, MAP_H, SEA_LEVEL } from "@/data/content";

/** Deterministic seeded 2D value-noise + fbm (no deps, fast enough for ~85k verts). */
const PERM = new Uint8Array(512);
(() => {
  let s = 1337;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function grad(h: number, x: number, y: number) {
  switch (h & 7) {
    case 0: return x + y;
    case 1: return x - y;
    case 2: return -x + y;
    case 3: return -x - y;
    case 4: return x;
    case 5: return -x;
    case 6: return y;
    default: return -y;
  }
}

export function noise2(x: number, y: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  const u = fade(x);
  const v = fade(y);
  const a = PERM[X] + Y;
  const b = PERM[X + 1] + Y;
  return lerp(
    lerp(grad(PERM[a], x, y), grad(PERM[b], x - 1, y), u),
    lerp(grad(PERM[a + 1], x, y - 1), grad(PERM[b + 1], x - 1, y - 1), u),
    v,
  ); // ≈ [-1, 1]
}

export function fbm(x: number, y: number, octaves = 4): number {
  let amp = 0.5;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * f, y * f);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

const ridged = (x: number, y: number) => {
  const n = 1 - Math.abs(fbm(x, y, 3));
  return n * n;
};

// ── scale: features were authored on a 1536×864 world; K stretches their
// footprints with the map, HK exaggerates the relief ─────────────────────────
const K = MAP_W / 1536;
const HK = 1.5;
const BASE_F = 0.008 / (K * 0.72); // rolling-land frequency (slightly denser than pure scale)
const DET_F = 0.02 / (K * 0.72);

// ── Middle-earth relief, authored in map-fraction space (u,v) ────────────────
interface Ridge { a: [number, number]; b: [number, number]; w: number; h: number }

// Traced against the drawn art of public/assets/map.jpg (July 2026 audit)
const RIDGES: Ridge[] = [
  { a: [0.532, 0.09], b: [0.518, 0.30], w: 20, h: 64 },  // Misty Mountains (north half)
  { a: [0.518, 0.30], b: [0.487, 0.458], w: 19, h: 60 }, // Misty Mountains (south half, tip at Methedras/Isengard)
  { a: [0.437, 0.603], b: [0.523, 0.578], w: 22, h: 52 }, // White Mountains (west)
  { a: [0.523, 0.578], b: [0.598, 0.604], w: 20, h: 48 }, // White Mountains (east, ends at Minas Tirith)
  { a: [0.44, 0.10], b: [0.62, 0.085], w: 16, h: 42 },  // Grey Mountains
  { a: [0.205, 0.06], b: [0.272, 0.245], w: 13, h: 34 }, // Blue Mountains (north of the Gulf)
  { a: [0.272, 0.33], b: [0.308, 0.455], w: 11, h: 28 }, // Blue Mountains (Harlindon arm)
  { a: [0.648, 0.545], b: [0.82, 0.532], w: 17, h: 54 }, // Ash Mountains (Mordor N)
  { a: [0.650, 0.558], b: [0.636, 0.725], w: 15, h: 52 }, // Ephel Dúath (Mordor W)
  { a: [0.645, 0.745], b: [0.83, 0.742], w: 16, h: 46 }, // Mordor S rim
  { a: [0.755, 0.19], b: [0.86, 0.15], w: 12, h: 36 },  // Iron Hills
];

interface Peak { u: number; v: number; r: number; h: number; pow: number }

const PEAKS: Peak[] = [
  { u: 0.670, v: 0.205, r: 22, h: 92, pow: 1.7 }, // Erebor, the Lonely Mountain
  { u: 0.700, v: 0.585, r: 25, h: 58, pow: 1.5 }, // Mount Doom
  { u: 0.452, v: 0.261, r: 9, h: 16, pow: 1.2 },  // Weathertop
  { u: 0.607, v: 0.607, r: 15, h: 24, pow: 1.1 }, // hill of Minas Tirith
  { u: 0.512, v: 0.542, r: 7, h: 9, pow: 1.1 },   // the hill of Edoras
];

// Western coastline: for a given v, sea lies where u < coastU(v)
const COAST: [number, number][] = [
  [0.0, 0.115], [0.06, 0.115], [0.1, 0.135], [0.2, 0.175], [0.26, 0.225],
  [0.34, 0.245], [0.44, 0.26], [0.5, 0.28], [0.56, 0.33], [0.62, 0.40],
  [0.68, 0.475], [0.73, 0.53], [0.78, 0.565], [0.85, 0.60], [0.92, 0.61], [1.0, 0.60],
];

function coastU(v: number): number {
  if (v <= COAST[0][0]) return COAST[0][1];
  for (let i = 1; i < COAST.length; i++) {
    if (v <= COAST[i][0]) {
      const [v0, u0] = COAST[i - 1];
      const [v1, u1] = COAST[i];
      return lerp(u0, u1, (v - v0) / (v1 - v0));
    }
  }
  return COAST[COAST.length - 1][1];
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = Math.min(1, Math.max(0, t));
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

// Inland waters as soft ellipses: [u, v, semiU, semiV]
const LAKES: [number, number, number, number][] = [
  [0.755, 0.685, 0.05, 0.026],  // Sea of Núrnen (Mordor)
  [0.800, 0.380, 0.045, 0.033], // Sea of Rhûn
  [0.362, 0.196, 0.020, 0.012], // Lake Evendim
  [0.677, 0.252, 0.008, 0.016], // the Long Lake at Esgaroth
];

/** 1 where open sea (west ocean, bays, gulf, inland seas), 0 on land. */
export function seaMask(u: number, v: number): number {
  const cu = coastU(v) + noise2(v * 14 + 3.7, u * 9) * 0.012;
  let m = smoothstep(cu + 0.006, cu - 0.018, u);
  for (const [lu, lv, su, sv] of LAKES) {
    const du = (u - lu) / su;
    const dv = (v - lv) / sv;
    m = Math.max(m, smoothstep(1.0, 0.72, du * du + dv * dv));
  }
  // the Gulf of Lune — narrow inlet slanting NE to the Grey Havens
  {
    const du0 = u - 0.243;
    const dv0 = (v - 0.300) * 0.5625; // aspect-corrected
    const ca = Math.cos(-0.21);
    const sa = Math.sin(-0.21);
    const along = (du0 * ca + dv0 * sa) / 0.05;
    const across = (-du0 * sa + dv0 * ca) / 0.0055;
    m = Math.max(m, smoothstep(1.0, 0.72, along * along + across * across));
  }
  return m;
}

/**
 * World-space terrain height (x ∈ [0,MAP_W], z ∈ [0,MAP_H]).
 * This single function drives the mesh, dragon altitude, landmarks and camera.
 */
export function heightAt(x: number, z: number): number {
  const u = x / MAP_W;
  const v = z / MAP_H;

  // parchment border stays flat (the map's decorative frame)
  const border =
    smoothstep(0.012, 0.05, u) * smoothstep(0.988, 0.95, u) *
    smoothstep(0.012, 0.055, v) * smoothstep(0.988, 0.945, v);

  // rolling base land
  let h = (6 + fbm(x * BASE_F, z * BASE_F, 4) * 6) * HK * 0.85;

  // mountain ridges (max-blend), rockified by ridged noise
  let mtn = 0;
  for (const r of RIDGES) {
    const d = distToSeg(x, z, r.a[0] * MAP_W, r.a[1] * MAP_H, r.b[0] * MAP_W, r.b[1] * MAP_H);
    const w = r.w * K;
    const g = Math.exp(-(d * d) / (2 * w * w));
    if (g > 0.004) {
      const rock = 0.62 + 0.55 * ridged(x * DET_F + 17, z * DET_F);
      mtn = Math.max(mtn, r.h * HK * g * rock);
    }
  }
  h += mtn;

  // solitary peaks
  for (const p of PEAKS) {
    const d = Math.hypot(x - p.u * MAP_W, z - p.v * MAP_H);
    const pr = p.r * K;
    const g = Math.exp(-(d * d) / (2 * pr * pr));
    if (g > 0.004) h += p.h * HK * Math.pow(g, p.pow) * (0.85 + 0.3 * ridged(x * DET_F * 1.5, z * DET_F * 1.5 + 9));
  }

  // Mount Doom crater dip
  {
    const d = Math.hypot(x - 0.700 * MAP_W, z - 0.585 * MAP_H);
    const cr = 4.5 * K;
    h -= 16 * HK * Math.exp(-(d * d) / (2 * cr * cr));
  }

  // Shire — soft green downs
  {
    const d = Math.hypot(x - 0.352 * MAP_W, z - 0.262 * MAP_H);
    const gr = 85 * K;
    const g = Math.exp(-(d * d) / (2 * gr * gr));
    h += g * (4 + 7 * (fbm(x * DET_F + 40, z * DET_F, 3) * 0.5 + 0.5)) * HK;
  }

  // Rivendell — the Hidden Valley (carved trench, floor kept above the water)
  {
    const cx = 0.502 * MAP_W;
    const cz = 0.252 * MAP_H;
    const ca = Math.cos(-0.25);
    const sa = Math.sin(-0.25);
    const lx = (x - cx) * ca - (z - cz) * sa;
    const lz = (x - cx) * sa + (z - cz) * ca;
    const g = Math.exp(-((lx * lx) / (2 * 46 * K * 46 * K) + (lz * lz) / (2 * 11 * K * 11 * K)));
    h -= 18 * HK * g;
    h += 9 * HK * Math.exp(-((lx * lx) / (2 * 60 * K * 60 * K) + ((Math.abs(lz) - 16 * K) ** 2) / (2 * 7 * K * 7 * K)));
    if (g > 0.35) h = Math.max(h, SEA_LEVEL + 2.2);
  }

  // Mordor plateau (charred uplands inside the rim)
  {
    const d = Math.hypot(x - 0.715 * MAP_W, z - 0.635 * MAP_H);
    const pr = 105 * K;
    h += 7 * HK * Math.exp(-(d * d) / (2 * pr * pr));
  }

  // sea
  const sea = seaMask(u, v);
  h = lerp(h, -5 * HK, sea);

  return h * border;
}

/** Central-difference terrain normal. */
export function normalAt(x: number, z: number, eps = 3.4): [number, number, number] {
  const hL = heightAt(x - eps, z);
  const hR = heightAt(x + eps, z);
  const hD = heightAt(x, z - eps);
  const hU = heightAt(x, z + eps);
  const nx = hL - hR;
  const nz = hD - hU;
  const ny = 2 * eps;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}
