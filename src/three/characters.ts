/**
 * Procedural figures, built the way the landmarks are built: a flat list of
 * kit primitives merged into one mesh per material, dressed in the shared
 * canvas-drawn PBR surfaces. Every character costs a few draw calls, nothing
 * on the wire, and sits in the same light as the architecture around it.
 *
 * Bodies, robes, cloaks, beards and helms are turned on a lathe from smooth
 * spline profiles (with fabric folds pressed into the hems), so silhouettes
 * read as cloth and armour rather than stacked cylinders. Faces have brows,
 * eyes and noses; hands have thumbs.
 *
 * All figures face +Z with their feet at y = 0, authored at human-ish scale;
 * placement code normalizes to a stated world height, so only proportions
 * matter here. Keyed by the basename of the old model URLs ("/models/x.glb")
 * so DB content keeps working unchanged.
 */

import * as THREE from "three";
import { Kit, type TF, type UVScales } from "@/three/kit";
import { pbr, plain, surfaces } from "@/three/materials";

// ── the character wardrobe ──────────────────────────────────────────────────
// Like the landmark palette: greyscale-ish textured bases, per-part tints do
// the colour work, so one cloth serves Gandalf's grey and Elrond's burgundy.

let CMATS: Record<string, THREE.Material> | null = null;

function cmats() {
  if (CMATS) return CMATS;
  const s = surfaces();
  CMATS = {
    cloth: pbr(s.organic, "#e0dacc", { roughness: 1, normalScale: 0.6, side: THREE.DoubleSide }),
    velvet: pbr(s.organic, "#e8e0d4", { roughness: 0.82, normalScale: 0.35, side: THREE.DoubleSide, envMapIntensity: 1.2 }),
    skin: plain("#eec9a2", { roughness: 0.72, envMapIntensity: 0.8 }),
    eye: plain("#120c08", { roughness: 0.15, envMapIntensity: 2.2 }),
    // thatch relief reads as combed strands at close UV scale — hair, beards,
    // fur. Its golden albedo is dropped, or every white beard turns to straw.
    // (two-sided, like the cloth: hair shells and the ranger's coat are open
    // lathes, whose inside is what faces the viewer through the opening)
    hair: Object.assign(pbr(s.thatch, "#ffffff", { normalScale: 1.25, roughness: 0.9, side: THREE.DoubleSide }), { map: null }),
    leather: pbr(s.timber, "#a08050", { normalScale: 0.55, roughness: 0.88, side: THREE.DoubleSide }),
    wood: pbr(s.timber, "#8a6438", { normalScale: 1.1 }),
    steel: pbr(s.metal, "#ccd0d6", { metalness: 0.85, roughness: 0.32, envMapIntensity: 1.6 }),
    blackSteel: pbr(s.metal, "#5a544e", { metalness: 0.55, roughness: 0.42, envMapIntensity: 1.8 }),
    goldTrim: pbr(s.metal, "#e2b45a", { metalness: 0.9, roughness: 0.32, envMapIntensity: 1.8 }),
    // the Balrog's hide: charred crust over inner fire
    charhide: pbr(s.rock, "#7a6250", { normalScale: 1.6, roughness: 1 }),
    horn: pbr(s.rock, "#2a2420", { normalScale: 0.8, roughness: 0.55, envMapIntensity: 1.4 }),
    membrane: plain("#20130f", {
      roughness: 1, side: THREE.DoubleSide, emissive: "#4a1204", emissiveIntensity: 0.6,
    }),
    flame: plain("#2a1006", { emissive: "#ff6a16", emissiveIntensity: 2.8, roughness: 0.9 }),
    ember: plain("#2a0d04", { emissive: "#ffb23e", emissiveIntensity: 3.2, roughness: 0.6 }),
    glim: plain("#dfe8ff", { emissive: "#bcd8ff", emissiveIntensity: 1.6, roughness: 0.3 }),
    gem: plain("#9fe4ff", { emissive: "#6fd4ff", emissiveIntensity: 1.2, roughness: 0.1, metalness: 0.2 }),
    ring: plain("#ffd36a", { emissive: "#ffb02e", emissiveIntensity: 1.8, metalness: 0.9, roughness: 0.25 }),
    paper: plain("#efe3c4", { roughness: 0.95 }),
  };
  return CMATS;
}

/** World units per texture tile — small, we are centimetres from the cloth. */
const CUV: UVScales = {
  cloth: 1.2, velvet: 1.6, hair: 0.55, leather: 0.9, wood: 0.7,
  steel: 1.1, blackSteel: 1.0, goldTrim: 0.7, charhide: 1.6, horn: 1.2,
};

// ── shaping helpers ─────────────────────────────────────────────────────────

type V3 = [number, number, number];
/** a lathe profile point: [radius, height] */
type P2 = [number, number];

const _dir = new THREE.Vector3();
const _aq = new THREE.Quaternion();
const _ae = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

/** Midpoint + YXZ euler that carries a +Y primitive from `from` to `to`. */
function aim(from: V3, to: V3) {
  _dir.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const len = _dir.length();
  _aq.setFromUnitVectors(UP, _dir.normalize());
  _ae.setFromQuaternion(_aq, "YXZ");
  return {
    x: (from[0] + to[0]) / 2, y: (from[1] + to[1]) / 2, z: (from[2] + to[2]) / 2,
    rx: _ae.x, ry: _ae.y, rz: _ae.z, len,
  };
}

/** A tapered cylinder between two points (`r0` at `from`), with a ball at the joint. */
function limb(
  k: Kit, mat: string, from: V3, to: V3, r0: number, r1: number,
  tf: Partial<TF> = {}, seg = 10, joint = true,
) {
  const a = aim(from, to);
  k.cyl(mat, r1, r0, a.len, seg, { x: a.x, y: a.y, z: a.z, rx: a.rx, ry: a.ry, rz: a.rz, ...tf });
  if (joint) k.sphere(mat, r0, seg, 6, { x: from[0], y: from[1], z: from[2], ...tf });
}

/** A chain of limbs through points, radius easing from r0 to r1. */
function chain(k: Kit, mat: string, pts: V3[], r0: number, r1: number, tf: Partial<TF> = {}, seg = 8) {
  for (let i = 0; i < pts.length - 1; i++) {
    const t0 = i / (pts.length - 1);
    const t1 = (i + 1) / (pts.length - 1);
    limb(k, mat, pts[i], pts[i + 1], r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1, tf, seg, i > 0);
  }
}

/** A cone whose apex points from `at` along `dir` — claws, spikes, horns. */
function spike(k: Kit, mat: string, at: V3, dir: V3, r: number, len: number, tf: Partial<TF> = {}, seg = 6) {
  const a = aim(at, [at[0] + dir[0], at[1] + dir[1], at[2] + dir[2]]);
  k.cone(mat, r, len, seg, {
    x: at[0] + (dir[0] / a.len) * (len / 2),
    y: at[1] + (dir[1] / a.len) * (len / 2),
    z: at[2] + (dir[2] / a.len) * (len / 2),
    rx: a.rx, ry: a.ry, rz: a.rz, ...tf,
  });
}

/** Smooth spline through profile points (bottom → top). */
function profile(pts: P2[], n = 40) {
  return new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y))).getPoints(n);
}

interface LatheOpts {
  seg?: number;
  /** gap angle left open, centred on +Z (the front) — or on -Z with `back` */
  open?: number;
  back?: boolean;
  /** cross-section scale: < 1 makes the body shallower front to back */
  sx?: number;
  sz?: number;
  /** pressed fabric folds: count round the hem, depth (fraction of r), height they fade out by */
  folds?: [number, number, number];
  /** ragged hem: vertices below this height are jittered down by up to `amount` */
  ragged?: [number, number];
}

/** Turn a profile on the lathe — robes, torsos, cloaks, beards, helms. */
function lathe(k: Kit, mat: string, pts: P2[], tf: Partial<TF> = {}, o: LatheOpts = {}) {
  const open = o.open ?? 0;
  const start = open / 2 + (o.back ? Math.PI : 0);
  const prof = profile(pts);
  const seg = o.seg ?? 28;
  const g = new THREE.LatheGeometry(prof, seg, start, Math.PI * 2 - open);
  const pos = g.attributes.position;
  const y0 = pts[0][1];
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const phi = Math.atan2(x, z);
    if (o.folds) {
      const [count, depth, top] = o.folds;
      const f = Math.max(0, Math.min(1, (top - y) / (top - y0)));
      const k2 = 1 + depth * f * (Math.sin(phi * count) * 0.7 + Math.sin(phi * count * 2.3 + 1.7) * 0.3);
      x *= k2;
      z *= k2;
    }
    if (o.ragged && y < o.ragged[0]) {
      const r = Math.abs(Math.sin(phi * 13.7) * Math.cos(phi * 5.3 + 0.8));
      y -= o.ragged[1] * r * (1 - (y - y0) / (o.ragged[0] - y0 || 1));
      // a hem on the ground pools there: below the soles it would lift the
      // whole figure when it is stood on its bounding box
      y = Math.max(y, Math.min(y0, 0));
    }
    pos.setXYZ(i, x * (o.sx ?? 1), y, z * (o.sz ?? 1));
  }
  g.computeVertexNormals();
  if (!open) {
    // a closed lathe repeats its seam column (down the front, at +Z); each
    // copy gets a one-sided normal, so average them or the seam shows a crease
    const nrm = g.attributes.normal;
    const np = prof.length;
    for (let j = 0; j < np; j++) {
      const a = j;
      const b = seg * np + j;
      const nx = nrm.getX(a) + nrm.getX(b);
      const ny = nrm.getY(a) + nrm.getY(b);
      const nz = nrm.getZ(a) + nrm.getZ(b);
      const l = Math.hypot(nx, ny, nz) || 1;
      nrm.setXYZ(a, nx / l, ny / l, nz / l);
      nrm.setXYZ(b, nx / l, ny / l, nz / l);
    }
  }
  k.add(mat, g, tf);
}

// ── anatomy ─────────────────────────────────────────────────────────────────

interface HeadOpts {
  x?: number;
  /** chin height */
  y: number;
  z?: number;
  /** head height, chin to crown */
  s: number;
  skin: string;
  brow: string;
  nose?: number;
  jaw?: number;
  ears?: "human" | "elf" | "hobbit" | "none";
  eye?: string;
  /** turn the face a little (radians about Y) */
  turn?: number;
}

/** A face that reads at a glance: cranium, jaw, brow ridge, eyes, nose, ears. */
function head(k: Kit, o: HeadOpts) {
  const s = o.s;
  const cx = o.x ?? 0;
  const cz = o.z ?? 0;
  const t = o.turn ?? 0;
  const ct = Math.cos(t);
  const st = Math.sin(t);
  // local (x, z) offsets rotated by the head turn
  const P = (dx: number, dy: number, dz: number): V3 => [cx + dx * ct + dz * st, o.y + dy, cz - dx * st + dz * ct];
  const tint = o.skin;
  const jaw = o.jaw ?? 1;
  k.sphere("skin", s * 0.5, 22, 16, { ...xyz(P(0, s * 0.56, -s * 0.02)), s: [0.84, 1, 0.94], ry: t, tint });
  k.sphere("skin", s * 0.35, 18, 12, { ...xyz(P(0, s * 0.28, s * 0.07)), s: [0.95 * jaw, 0.9, 1], ry: t, tint });
  // cheekbones and brow give the face planes to catch light
  k.box("skin", s * 0.62, s * 0.07, s * 0.12, { ...xyz(P(0, s * 0.6, s * 0.37)), ry: t, tint, shade: 0.97 });
  for (const sd of [-1, 1]) {
    k.sphere("skin", s * 0.11, 10, 8, { ...xyz(P(sd * s * 0.2, s * 0.42, s * 0.3)), ry: t, tint, shade: 1.03 });
    // eyes sit in the sockets under the brow
    k.sphere("eye", s * 0.05, 10, 8, { ...xyz(P(sd * s * 0.165, s * 0.515, s * 0.385)), tint: o.eye, flat: true });
  }
  spike(k, "skin", P(0, s * 0.53, s * 0.4), [st * 0.95, -0.42, ct * 0.95], s * 0.075 * (o.nose ?? 1), s * 0.24 * (o.nose ?? 1), { tint }, 7);
  // mouth
  k.box("skin", s * 0.2, s * 0.022, s * 0.04, { ...xyz(P(0, s * 0.29, s * 0.4)), ry: t, tint: "#7a4a3a", flat: true });
  // brows (hair-coloured)
  for (const sd of [-1, 1]) {
    k.box("hair", s * 0.2, s * 0.045, s * 0.07, { ...xyz(P(sd * s * 0.17, s * 0.62, s * 0.41)), ry: t, rz: sd * 0.14, tint: o.brow });
  }
  const ears = o.ears ?? "human";
  for (const sd of [-1, 1]) {
    if (ears === "none") continue;
    if (ears === "elf" || ears === "hobbit") {
      const len = ears === "elf" ? 0.32 : 0.2;
      spike(k, "skin", P(sd * s * 0.4, s * 0.5, -s * 0.02), [sd * 0.75 * ct, 0.95, -sd * 0.75 * st - 0.25], s * 0.08, s * len, { tint }, 6);
    }
    k.sphere("skin", s * 0.1, 8, 6, { ...xyz(P(sd * s * 0.41, s * 0.48, -s * 0.02)), s: [0.45, 1, 0.8], ry: t, tint });
  }
}

const xyz = (p: V3) => ({ x: p[0], y: p[1], z: p[2] });

/** A hand: palm elongated along `dir`, fingers curled, a thumb off the side. */
function hand(k: Kit, at: V3, dir: V3, s: number, tint: string, side: 1 | -1 = 1, mat = "skin") {
  const L = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const d: V3 = [dir[0] / L, dir[1] / L, dir[2] / L];
  const palm: V3 = [at[0] + d[0] * s * 0.5, at[1] + d[1] * s * 0.5, at[2] + d[2] * s * 0.5];
  const a = aim(at, [at[0] + d[0], at[1] + d[1], at[2] + d[2]]);
  k.sphere(mat, s * 0.5, 10, 8, { ...xyz(palm), rx: a.rx, ry: a.ry, rz: a.rz, s: [1, 1.35, 0.6], tint });
  // thumb: off the side, angled forward
  const tb: V3 = [at[0] + d[0] * s * 0.25 + side * s * 0.32, at[1] + d[1] * s * 0.25, at[2] + d[2] * s * 0.25 + s * 0.2];
  limb(k, mat, tb, [tb[0] + d[0] * s * 0.45 + side * s * 0.1, tb[1] + d[1] * s * 0.45, tb[2] + d[2] * s * 0.45 + s * 0.15], s * 0.15, s * 0.12, { tint }, 6);
}

/** A boot or shoe: heel, foot, rounded toe. */
function boot(k: Kit, x: number, s: number, tint: string, mat = "leather", toe = 0) {
  k.box(mat, s * 0.42, s * 0.3, s * 0.85, { x, y: s * 0.15, z: s * 0.12, tint, shade: 0.9 });
  k.sphere(mat, s * 0.23, 10, 8, { x, y: s * 0.17, z: s * 0.55 + toe, s: [0.95, 0.7, 1.25], tint, shade: 0.92 });
}

/** A sword: blade from `grip` along `dir`, crossguard, grip, pommel. */
function sword(k: Kit, grip: V3, dir: V3, len: number, o: { guard?: string; curve?: number; width?: number } = {}) {
  const L = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const d: V3 = [dir[0] / L, dir[1] / L, dir[2] / L];
  const w = o.width ?? 0.035;
  const g0: V3 = [grip[0] - d[0] * 0.09, grip[1] - d[1] * 0.09, grip[2] - d[2] * 0.09];
  const g1: V3 = [grip[0] + d[0] * 0.07, grip[1] + d[1] * 0.07, grip[2] + d[2] * 0.07];
  limb(k, "leather", g0, g1, 0.018, 0.018, { tint: "#2a1c10" }, 6, false);
  k.sphere("goldTrim", 0.03, 8, 6, { ...xyz(g0), tint: o.guard });
  const a = aim(g1, [g1[0] + d[0], g1[1] + d[1], g1[2] + d[2]]);
  k.box("goldTrim", 0.17, 0.025, 0.035, { ...xyz(g1), rx: a.rx, ry: a.ry, rz: a.rz, tint: o.guard });
  // sheathed: hilt only
  if (len <= 0) return;
  // the blade, in two lengths so it can bend a little (Orcrist)
  const c = o.curve ?? 0;
  const mid: V3 = [g1[0] + d[0] * len * 0.55, g1[1] + d[1] * len * 0.55 + c * 0.5, g1[2] + d[2] * len * 0.55];
  const tip: V3 = [g1[0] + d[0] * len, g1[1] + d[1] * len + c, g1[2] + d[2] * len];
  const b1 = aim(g1, mid);
  k.box("steel", w, b1.len, w * 0.28, { x: b1.x, y: b1.y, z: b1.z, rx: b1.rx, ry: b1.ry, rz: b1.rz });
  const b2 = aim(mid, tip);
  k.cyl("steel", w * 0.12, w * 0.5, b2.len, 4, { x: b2.x, y: b2.y, z: b2.z, rx: b2.rx, ry: b2.ry, rz: b2.rz, s: [1, 1, 0.3] });
}

/** Locks of hair falling from `at` toward `to`, fanned across `spread`. */
function locks(k: Kit, at: V3, to: V3, n: number, spread: V3, r: number, tint: string, shade = 1) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    const j = Math.sin(i * 12.9898) * 0.5;
    limb(
      k, "hair",
      [at[0] + spread[0] * t, at[1] + spread[1] * t, at[2] + spread[2] * t],
      [to[0] + spread[0] * t * 1.25 + j * r, to[1] + Math.abs(j) * r * 2, to[2] + spread[2] * t * 1.25],
      r, r * 0.35, { tint, shade: shade * (0.92 + Math.abs(j) * 0.16) }, 6,
    );
  }
}

// ── Gandalf the Grey ────────────────────────────────────────────────────────

function buildGandalf(k: Kit) {
  k.aoHeight = 0.6;
  k.aoDepth = 0.28;
  const ROBE = "#9e988c";
  const CLOAK = "#7f786c";
  const HAT = "#7a7468";
  const BEARD = "#e6e2d8";
  const SKIN = "#e4bf9c";

  // the robe, hem pooled on the ground, folds pressed in below the waist
  lathe(k, "cloth", [[0.4, 0], [0.37, 0.18], [0.32, 0.55], [0.26, 0.92], [0.25, 1.02], [0.27, 1.2], [0.28, 1.34], [0.23, 1.45], [0.13, 1.52], [0.07, 1.57]],
    { tint: ROBE }, { sz: 0.82, folds: [10, 0.07, 1.0] });
  // the travel cloak hangs open at the front, heavier behind
  lathe(k, "cloth", [[0.47, 0.02], [0.43, 0.4], [0.36, 0.9], [0.31, 1.25], [0.27, 1.42], [0.17, 1.5], [0.11, 1.54]],
    { z: -0.03, tint: CLOAK }, { open: 1.7, sz: 0.88, folds: [8, 0.09, 1.3] });
  // hood bunched behind the neck
  // (the arc runs from rz to rz + arc; its middle must sit at -Z, behind)
  k.torus("cloth", 0.13, 0.055, 8, 16, Math.PI * 1.4, { y: 1.5, z: -0.05, rx: Math.PI / 2, rz: Math.PI * 1.5 - Math.PI * 0.7, tint: CLOAK, shade: 0.9 });
  // rope belt, knotted
  k.torus("leather", 0.255, 0.022, 6, 24, Math.PI * 2, { y: 1.02, rx: Math.PI / 2, s: [1, 0.82, 1], tint: "#c8b890" });
  limb(k, "leather", [0.08, 1.0, 0.2], [0.11, 0.72, 0.24], 0.016, 0.012, { tint: "#c8b890" }, 5);
  limb(k, "leather", [0.04, 1.0, 0.21], [0.03, 0.78, 0.25], 0.016, 0.012, { tint: "#c8b890" }, 5);
  // right arm grips the staff at the chest; bell sleeve falls from the wrist
  limb(k, "cloth", [0.23, 1.43, 0], [0.33, 1.15, 0.02], 0.075, 0.08, { tint: ROBE });
  limb(k, "cloth", [0.33, 1.15, 0.02], [0.37, 1.24, 0.17], 0.08, 0.13, { tint: ROBE });
  hand(k, [0.37, 1.25, 0.19], [0.05, 0.25, 1], 0.1, SKIN, 1);
  // left arm hangs easy, sleeve wide
  limb(k, "cloth", [-0.23, 1.43, 0], [-0.31, 1.14, 0.02], 0.075, 0.08, { tint: ROBE });
  limb(k, "cloth", [-0.31, 1.14, 0.02], [-0.29, 0.9, 0.12], 0.08, 0.13, { tint: ROBE });
  hand(k, [-0.29, 0.88, 0.13], [0.0, -1, 0.25], 0.1, SKIN, -1);
  // Glamdring at the left hip
  limb(k, "leather", [-0.26, 1.0, 0.06], [-0.37, 0.28, -0.12], 0.032, 0.028, { tint: "#2c2218" });
  sword(k, [-0.25, 1.06, 0.08], [0.15, 1, 0.2], 0.0, { guard: "#c8ccd4" });
  // the face, long and lined
  head(k, { y: 1.56, s: 0.27, skin: SKIN, brow: BEARD, nose: 1.3, jaw: 0.95 });
  // bushy eyebrows jutting out
  for (const sd of [-1, 1]) spike(k, "hair", [sd * 0.07, 1.728, 0.115], [sd * 1, 0.35, 0.4], 0.02, 0.045, { tint: BEARD }, 5);
  for (const sd of [-1, 1]) k.sphere("cloth", 0.085, 12, 8, { x: sd * 0.22, y: 1.44, z: -0.01, s: [1.2, 0.8, 1], tint: CLOAK });
  // the beard: a long fall to the belt, strands combed through it
  lathe(k, "hair", [[0.015, 0.98], [0.07, 1.08], [0.12, 1.25], [0.135, 1.42], [0.125, 1.56], [0.1, 1.64]],
    { z: 0.135, tint: BEARD }, { open: Math.PI * 0.85, back: true, sz: 0.9, folds: [12, 0.08, 1.6] });
  locks(k, [0, 1.58, 0.22], [0, 1.08, 0.26], 3, [0.12, 0, 0], 0.018, BEARD, 1.03);
  // mustache drooping over it
  for (const sd of [-1, 1]) limb(k, "hair", [sd * 0.01, 1.65, 0.16], [sd * 0.1, 1.56, 0.13], 0.022, 0.01, { tint: BEARD }, 5);
  // long grey hair down the back
  lathe(k, "hair", [[0.12, 1.28], [0.15, 1.45], [0.15, 1.62], [0.135, 1.76], [0.09, 1.84]],
    { z: -0.035, tint: "#d6d2c8" }, { open: Math.PI * 1.05, sz: 0.9, folds: [12, 0.12, 1.7] });
  // the pointed hat: broad drooping brim, crown bent back
  lathe(k, "cloth", [[0.47, 1.78], [0.4, 1.81], [0.24, 1.84], [0.16, 1.86]], { z: -0.01, rx: -0.08, tint: HAT, shade: 0.9 }, { folds: [7, 0.06, 1.85] });
  k.torus("cloth", 0.155, 0.02, 6, 20, Math.PI * 2, { y: 1.87, rx: Math.PI / 2 - 0.08, tint: "#5e584e" });
  limb(k, "cloth", [0, 1.86, -0.01], [-0.01, 2.12, -0.05], 0.165, 0.11, { tint: HAT }, 16, false);
  limb(k, "cloth", [-0.01, 2.12, -0.05], [-0.06, 2.32, -0.13], 0.11, 0.055, { tint: HAT }, 12);
  spike(k, "cloth", [-0.06, 2.32, -0.13], [-0.45, 0.6, -0.65], 0.056, 0.2, { tint: HAT }, 10);
  // the staff: gnarled shaft, a claw of roots at its head holding a glimmer
  chain(k, "wood", [[0.4, 0, 0.22], [0.395, 0.6, 0.21], [0.39, 1.25, 0.2], [0.385, 1.85, 0.19], [0.39, 2.05, 0.19]], 0.032, 0.026, { tint: "#6e4c2c" });
  for (const y of [0.5, 0.95, 1.55]) k.sphere("wood", 0.038, 8, 6, { x: 0.393, y, z: 0.205, tint: "#5e4026" });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const o: V3 = [0.39 + Math.cos(a) * 0.05, 2.06, 0.19 + Math.sin(a) * 0.05];
    chain(k, "wood", [o, [0.39 + Math.cos(a) * 0.075, 2.13, 0.19 + Math.sin(a) * 0.075], [0.39 + Math.cos(a) * 0.035, 2.2, 0.19 + Math.sin(a) * 0.035]], 0.016, 0.008, { tint: "#6e4c2c" }, 6);
  }
  k.sphere("glim", 0.038, 10, 8, { x: 0.39, y: 2.13, z: 0.19, flat: true });
}

// ── Sauron, the Dark Lord ───────────────────────────────────────────────────

function buildSauron(k: Kit) {
  k.aoHeight = 0.8;
  k.aoDepth = 0.25;
  const IRON = "#6a625a";
  const DARK = "#45403b";
  // sabatons and greaves
  for (const sd of [-1, 1] as const) {
    boot(k, sd * 0.15, 0.36, IRON, "blackSteel", 0.04);
    spike(k, "blackSteel", [sd * 0.15, 0.1, 0.24], [0, 0.1, 1], 0.03, 0.14);
    limb(k, "blackSteel", [sd * 0.15, 0.12, 0], [sd * 0.16, 0.62, 0.02], 0.085, 0.1, { tint: IRON });
    k.sphere("blackSteel", 0.1, 10, 8, { x: sd * 0.16, y: 0.64, z: 0.05, tint: DARK });
    spike(k, "blackSteel", [sd * 0.16, 0.66, 0.13], [0, 0.25, 1], 0.035, 0.12);
  }
  // the long cape, torn at the hem, falling behind
  lathe(k, "cloth", [[0.56, 0.0], [0.5, 0.4], [0.42, 0.95], [0.36, 1.4], [0.34, 1.75], [0.24, 1.88]],
    { z: -0.06, tint: "#1a1514" }, { open: 2.3, sz: 0.85, folds: [9, 0.12, 1.6], ragged: [0.5, 0.22] });
  // three tiers of armoured skirt, each flaring over the last
  for (let i = 0; i < 3; i++) {
    const y = 0.62 + i * 0.2;
    lathe(k, "blackSteel", [[0.33 - i * 0.03, y], [0.3 - i * 0.03, y + 0.12], [0.26 - i * 0.025, y + 0.26]],
      { tint: i % 2 ? DARK : IRON }, { sz: 0.82, seg: 16, folds: [8, 0.08, y + 0.26] });
  }
  // cuirass, ribbed
  lathe(k, "blackSteel", [[0.24, 1.18], [0.28, 1.35], [0.33, 1.58], [0.34, 1.72], [0.27, 1.82], [0.12, 1.88]], { tint: IRON }, { sz: 0.78 });
  for (let i = 0; i < 4; i++) k.torus("blackSteel", 0.27 + i * 0.018, 0.012, 5, 22, Math.PI * 0.9, { y: 1.3 + i * 0.1, z: 0.02, rx: Math.PI / 2, rz: -Math.PI * 0.45 + Math.PI / 2, s: [1, 0.8, 1], tint: DARK });
  // pauldrons: layered plates, each crested with spines
  for (const sd of [-1, 1] as const) {
    for (let i = 0; i < 3; i++) {
      k.sphere("blackSteel", 0.17 - i * 0.025, 14, 10, { x: sd * (0.36 + i * 0.03), y: 1.76 - i * 0.09, z: 0, s: [1.15, 0.62, 1.05], tint: i ? DARK : IRON }, Math.PI * 2, 0, Math.PI * 0.62);
    }
    for (let i = 0; i < 4; i++) {
      spike(k, "blackSteel", [sd * (0.32 + i * 0.05), 1.82 - i * 0.03, -0.04 + i * 0.03], [sd * 0.45, 1, -0.15], 0.032, 0.24 - i * 0.03);
    }
    // armoured arms; the right bears the mace
    const sh: V3 = [sd * 0.38, 1.66, 0];
    const el: V3 = [sd * 0.46, 1.3, 0.06];
    const wr: V3 = sd > 0 ? [0.5, 1.2, 0.24] : [-0.44, 1.02, 0.18];
    limb(k, "blackSteel", sh, el, 0.09, 0.085, { tint: IRON });
    limb(k, "blackSteel", el, wr, 0.085, 0.075, { tint: DARK });
    k.cyl("blackSteel", 0.095, 0.085, 0.16, 10, { x: (el[0] + wr[0]) / 2, y: (el[1] + wr[1]) / 2, z: (el[2] + wr[2]) / 2, tint: IRON });
    spike(k, "blackSteel", el, [sd * 0.4, -0.2, -1], 0.03, 0.16);
    // gauntlet: armoured fist and clawed fingertips
    hand(k, wr, sd > 0 ? [0, -0.5, 0.6] : [0.1, -0.6, 0.8], 0.15, DARK, sd, "blackSteel");
    for (let f = 0; f < 4; f++) {
      spike(k, "blackSteel", [wr[0] + sd * (f - 1.5) * 0.025, wr[1] - 0.02, wr[2] + 0.13], [0, -0.6, 0.6], 0.012, 0.07);
    }
  }
  // the One Ring on the left hand, glowing
  k.torus("ring", 0.03, 0.009, 6, 14, Math.PI * 2, { x: -0.44, y: 0.99, z: 0.27, rx: 0.4, flat: true });
  // the mace: a long haft and a flanged head
  chain(k, "blackSteel", [[0.5, 1.1, 0.26], [0.53, 0.65, 0.3], [0.56, 0.36, 0.34]], 0.026, 0.024, { tint: DARK });
  k.sphere("blackSteel", 0.04, 8, 6, { x: 0.5, y: 1.14, z: 0.26, tint: IRON });
  k.cyl("blackSteel", 0.1, 0.13, 0.32, 8, { x: 0.565, y: 0.2, z: 0.35, tint: IRON });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.box("blackSteel", 0.03, 0.36, 0.13, { x: 0.565 + Math.cos(a) * 0.12, y: 0.21, z: 0.35 + Math.sin(a) * 0.12, ry: -a, tint: DARK });
  }
  // the helm: a narrow face of iron, a burning slit, a crown of blades
  lathe(k, "blackSteel", [[0.13, 1.84], [0.15, 1.95], [0.155, 2.1], [0.13, 2.22], [0.07, 2.28]], { tint: IRON }, { sz: 1.05 });
  spike(k, "blackSteel", [0, 2.02, 0.14], [0, -1, 0.35], 0.06, 0.18);
  k.box("ember", 0.17, 0.016, 0.02, { y: 2.07, z: 0.16, flat: true });
  for (let i = 0; i < 9; i++) {
    const a = ((i - 4) / 4) * 1.2;
    const len = 0.5 - Math.abs(i - 4) * 0.05;
    spike(k, "blackSteel", [Math.sin(a) * 0.14, 2.16, Math.cos(a) * 0.12 - 0.02], [Math.sin(a) * 0.35, 1, Math.cos(a) * 0.2 - 0.12], 0.035, len, { tint: i % 2 ? IRON : DARK }, 4);
  }
}

// ── the Balrog of Morgoth ───────────────────────────────────────────────────

/** A scalloped bat-wing membrane fanned from `root` — one custom geometry. */
function balrogWing(k: Kit, s: 1 | -1) {
  const root: V3 = [s * 0.75, 3.2, -0.45];
  const e1 = new THREE.Vector3(s * 1, 0.25, -0.45).normalize();
  const e2 = new THREE.Vector3(s * 0.1, 1, -0.3).normalize();
  const P = (u: number, w: number): V3 => [
    root[0] + e1.x * u + e2.x * w,
    root[1] + e1.y * u + e2.y * w,
    root[2] + e1.z * u + e2.z * w,
  ];
  const tips: [number, number][] = [[2.3, 1.3], [2.95, 0.3], [2.65, -0.85], [1.75, -1.7], [0.7, -1.9]];
  chain(k, "charhide", [root, P(0.7, 0.55), P(1.35, 0.95)], 0.12, 0.07, { shade: 0.9 });
  for (const [u, w] of tips.slice(0, 4)) chain(k, "charhide", [P(1.3, 0.9), P((1.3 + u) / 2, (0.9 + w) / 2 + 0.1), P(u, w)], 0.05, 0.018, { shade: 0.85 }, 5);
  spike(k, "horn", P(1.35, 0.95), [e1.x + e2.x * 1.5, e1.y + e2.y * 1.5, e1.z + e2.z * 1.5], 0.05, 0.38);
  const edge: V3[] = [];
  for (let i = 0; i < tips.length; i++) {
    edge.push(P(tips[i][0], tips[i][1]));
    if (i < tips.length - 1) {
      const mu = (tips[i][0] + tips[i + 1][0]) / 2;
      const mw = (tips[i][1] + tips[i + 1][1]) / 2;
      edge.push(P(mu * 0.74, mw * 0.74));
    }
  }
  const pos: number[] = [];
  for (let i = 0; i < edge.length - 1; i++) pos.push(...root, ...edge[i], ...edge[i + 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  k.add("membrane", g, { flat: true });
}

function buildBalrog(k: Kit) {
  k.aoHeight = 1.2;
  k.aoDepth = 0.3;
  // digitigrade legs: thigh forward, shin back, clawed feet
  for (const sd of [-1, 1] as const) {
    const hip: V3 = [sd * 0.38, 1.45, -0.1];
    const knee: V3 = [sd * 0.46, 0.92, 0.28];
    const ankle: V3 = [sd * 0.44, 0.34, -0.12];
    const ball: V3 = [sd * 0.44, 0.1, 0.2];
    limb(k, "charhide", hip, knee, 0.24, 0.17, { tint: "#8a6a54" });
    limb(k, "charhide", knee, ankle, 0.17, 0.11, { tint: "#8a6a54" });
    limb(k, "charhide", ankle, ball, 0.11, 0.1, { tint: "#8a6a54" });
    for (let t = -1; t <= 1; t++) spike(k, "horn", [ball[0] + t * 0.08, 0.08, ball[2] + 0.06], [t * 0.2, -0.2, 1], 0.04, 0.2);
    spike(k, "horn", [knee[0], knee[1], knee[2] + 0.12], [sd * 0.2, 0.3, 1], 0.05, 0.22);
  }
  // the hunched torso: broad chest, narrow waist
  const TORSO: P2[] = [[0.3, 1.25], [0.38, 1.5], [0.47, 1.9], [0.66, 2.35], [0.72, 2.6], [0.55, 2.85], [0.24, 3.02]];
  const TILT = 0.22;
  lathe(k, "charhide", TORSO, { rx: TILT, z: -0.08, tint: "#8a6a54" }, { sx: 1.1, sz: 0.74, folds: [11, 0.06, 2.9] });
  // a point on the tilted torso's skin, at height y and angle phi (0 = front)
  const onTorso = (y: number, phi: number, lift = 1.03): V3 => {
    let r = TORSO[0][0];
    for (let i = 1; i < TORSO.length; i++) {
      if (y <= TORSO[i][1]) {
        const f = (y - TORSO[i - 1][1]) / (TORSO[i][1] - TORSO[i - 1][1]);
        r = TORSO[i - 1][0] + (TORSO[i][0] - TORSO[i - 1][0]) * f;
        break;
      }
    }
    const x = Math.sin(phi) * r * 1.1 * lift;
    const z = Math.cos(phi) * r * 0.74 * lift;
    return [x, y * Math.cos(TILT) - z * Math.sin(TILT), y * Math.sin(TILT) + z * Math.cos(TILT) - 0.08];
  };
  // fire glows through cracks in the crust of chest and belly
  const veins: [number, number, number, number][] = [
    [2.75, -0.05, 2.35, 0.2], [2.35, 0.2, 1.95, 0.02], [2.6, -0.45, 2.15, -0.6], [2.55, 0.55, 2.2, 0.75],
    [2.1, -0.2, 1.7, -0.08], [2.05, 0.4, 1.62, 0.3], [2.45, -0.25, 2.3, 0.05], [1.95, -0.45, 1.6, -0.5],
  ];
  for (const [y0, p0, y1, p1] of veins) {
    const mid: V3 = onTorso((y0 + y1) / 2, (p0 + p1) / 2 + 0.06);
    chain(k, "ember", [onTorso(y0, p0), mid, onTorso(y1, p1)], 0.03, 0.012, { flat: true }, 5);
  }
  // arms: massive, clawed
  for (const sd of [-1, 1] as const) {
    const sh: V3 = [sd * 0.74, 2.72, 0.14];
    const el: V3 = [sd * 0.98, 2.15, 0.38];
    const wr: V3 = [sd * 0.92, 1.62, 0.66];
    k.sphere("charhide", 0.32, 14, 10, { x: sh[0], y: sh[1], z: sh[2], s: [1.1, 0.9, 1], tint: "#8a6a54" });
    limb(k, "charhide", sh, el, 0.21, 0.16, { tint: "#8a6a54" });
    limb(k, "charhide", el, wr, 0.16, 0.12, { tint: "#8a6a54" });
    limb(k, "ember", [sd * 0.85, 2.4, 0.35], [sd * 0.95, 2.05, 0.45], 0.018, 0.01, { flat: true }, 5, false);
    hand(k, wr, [0, -0.5, 1], 0.32, "#3a2c22", sd, "charhide");
    for (let f = 0; f < 4; f++) spike(k, "horn", [wr[0] + sd * (f - 1.5) * 0.07, wr[1] - 0.12, wr[2] + 0.26], [0, -0.7, 0.7], 0.03, 0.2);
  }
  // the head: a bull's skull of iron and coal, horns sweeping forward
  const H: V3 = [0, 3.12, 0.42];
  k.sphere("charhide", 0.28, 16, 12, { x: H[0], y: H[1], z: H[2], s: [1, 0.9, 1.15], tint: "#3a2c22" });
  k.sphere("charhide", 0.2, 12, 10, { x: 0, y: H[1] - 0.14, z: H[2] + 0.2, s: [0.95, 0.8, 1.2], tint: "#3a2c22" });
  k.box("ember", 0.22, 0.04, 0.06, { x: 0, y: H[1] - 0.22, z: H[2] + 0.36, flat: true });
  for (const sd of [-1, 1] as const) {
    k.sphere("ember", 0.045, 8, 6, { x: sd * 0.11, y: H[1] + 0.03, z: H[2] + 0.27, flat: true });
    k.box("charhide", 0.14, 0.05, 0.08, { x: sd * 0.1, y: H[1] + 0.09, z: H[2] + 0.26, rz: sd * 0.4, tint: "#2a2018" });
    chain(k, "horn", [
      [sd * 0.2, H[1] + 0.14, H[2] - 0.02], [sd * 0.48, H[1] + 0.3, H[2] - 0.05],
      [sd * 0.7, H[1] + 0.52, H[2] + 0.12], [sd * 0.74, H[1] + 0.78, H[2] + 0.4],
    ], 0.11, 0.025);
  }
  // a mane of fire: short tongues, swept back off the head and shoulders
  for (let i = 0; i < 14; i++) {
    const a = (i / 13 - 0.5) * 2.4;
    const at: V3 = [Math.sin(a) * 0.32, 3.15 + Math.cos(a) * 0.12, 0.28 - Math.abs(a) * 0.08];
    spike(k, "flame", at, [Math.sin(a) * 0.4, 0.55, -1], 0.05, 0.26 + (i % 3) * 0.06, { flat: true }, 5);
  }
  for (let i = 0; i < 10; i++) {
    const sd = i % 2 ? 1 : -1;
    spike(k, "flame", [sd * (0.35 + (i >> 1) * 0.09), 2.9 - (i >> 1) * 0.05, -0.1], [sd * 0.3, 0.7, -1], 0.045, 0.24, { flat: true }, 5);
  }
  balrogWing(k, 1);
  balrogWing(k, -1);
  // the whip of many thongs, trailing from the right fist to the ground
  const W: V3[] = [[0.92, 1.5, 0.82], [1.2, 1.1, 1.05], [1.35, 0.6, 1.0], [1.3, 0.22, 0.75], [1.05, 0.06, 0.45], [0.7, 0.04, 0.38]];
  chain(k, "flame", W, 0.04, 0.015, { flat: true }, 6);
  chain(k, "flame", W.map(([x, y, z], i) => [x + 0.08 * Math.sin(i), y - 0.04, z + 0.1 * Math.cos(i)] as V3), 0.025, 0.01, { flat: true }, 5);
}

// ── Bilbo Baggins ───────────────────────────────────────────────────────────

function buildBilbo(k: Kit) {
  k.aoHeight = 0.35;
  k.aoDepth = 0.32;
  const SKIN = "#f0c49c";
  const HAIR = "#6a4426";
  const COAT = "#7a5634";
  const VEST = "#8a2c26";
  const SHIRT = "#efe6d0";
  const BREECH = "#5e4a34";
  // the famous feet: broad, bare, hairy on top
  for (const sd of [-1, 1] as const) {
    k.sphere("skin", 0.085, 12, 8, { x: sd * 0.11, y: 0.05, z: 0.07, s: [1, 0.55, 1.75], tint: SKIN });
    for (let t = 0; t < 4; t++) k.sphere("skin", 0.022, 6, 5, { x: sd * 0.11 + (t - 1.5) * 0.028, y: 0.035, z: 0.2, tint: SKIN });
    k.sphere("hair", 0.06, 8, 6, { x: sd * 0.11, y: 0.09, z: 0.06, s: [1.2, 0.5, 1.4], tint: HAIR });
    limb(k, "skin", [sd * 0.11, 0.06, 0.0], [sd * 0.11, 0.24, 0.0], 0.05, 0.055, { tint: SKIN }, 8, false);
    // breeches rolled at the shin
    limb(k, "cloth", [sd * 0.11, 0.24, 0], [sd * 0.1, 0.5, 0.0], 0.07, 0.085, { tint: BREECH });
    k.torus("cloth", 0.068, 0.018, 5, 12, Math.PI * 2, { x: sd * 0.11, y: 0.25, rx: Math.PI / 2, tint: BREECH, shade: 0.9 });
  }
  // shirt, round belly, waistcoat buttoned over it
  lathe(k, "cloth", [[0.18, 0.46], [0.22, 0.6], [0.23, 0.76], [0.2, 0.9], [0.16, 0.98], [0.07, 1.02]], { tint: SHIRT }, { sz: 0.9 });
  lathe(k, "velvet", [[0.19, 0.5], [0.225, 0.62], [0.235, 0.76], [0.205, 0.88], [0.16, 0.94]], { z: 0.005, tint: VEST }, { open: 0.35, sz: 0.92 });
  for (let i = 0; i < 4; i++) k.sphere("goldTrim", 0.012, 6, 5, { x: 0.035, y: 0.58 + i * 0.08, z: 0.215 + (i === 1 || i === 2 ? 0.01 : 0), flat: true });
  // the coat, open, tails to the knee
  lathe(k, "cloth", [[0.25, 0.36], [0.25, 0.55], [0.24, 0.75], [0.21, 0.9], [0.16, 0.98], [0.1, 1.02]], { z: -0.01, tint: COAT }, { open: 1.4, sz: 0.92, folds: [7, 0.07, 0.75] });
  // a cravat at the throat
  k.sphere("cloth", 0.05, 8, 6, { y: 0.98, z: 0.12, s: [1.3, 0.8, 0.8], tint: "#c8a04a" });
  // arms: the right holds the Red Book to his chest, the left rests at his side
  limb(k, "cloth", [0.16, 0.95, 0], [0.22, 0.75, 0.04], 0.055, 0.05, { tint: COAT });
  limb(k, "cloth", [0.22, 0.75, 0.04], [0.12, 0.78, 0.17], 0.05, 0.045, { tint: COAT });
  hand(k, [0.1, 0.79, 0.19], [-1, 0.1, 0.2], 0.075, SKIN, 1);
  k.box("leather", 0.16, 0.2, 0.05, { x: 0.05, y: 0.8, z: 0.2, ry: 0.15, tint: "#8a2a1e" });
  k.box("paper", 0.15, 0.185, 0.035, { x: 0.058, y: 0.8, z: 0.2, ry: 0.15 });
  k.box("goldTrim", 0.04, 0.04, 0.052, { x: 0.05, y: 0.82, z: 0.205, ry: 0.15, flat: true });
  limb(k, "cloth", [-0.16, 0.95, 0], [-0.22, 0.72, 0.02], 0.055, 0.05, { tint: COAT });
  limb(k, "cloth", [-0.22, 0.72, 0.02], [-0.21, 0.55, 0.08], 0.05, 0.045, { tint: COAT });
  hand(k, [-0.21, 0.53, 0.09], [0, -1, 0.2], 0.075, SKIN, -1);
  // the Ring, on its chain, catching the light at his waistcoat
  k.torus("ring", 0.016, 0.005, 6, 12, Math.PI * 2, { x: -0.06, y: 0.66, z: 0.235, flat: true });
  limb(k, "goldTrim", [-0.06, 0.68, 0.23], [0.03, 0.74, 0.23], 0.003, 0.003, { flat: true }, 4, false);
  // Sting at the left hip
  limb(k, "leather", [-0.2, 0.62, 0.02], [-0.26, 0.3, -0.06], 0.022, 0.018, { tint: "#3a2a1a" });
  // a big round head, rosy, curly-haired
  head(k, { y: 1.0, s: 0.29, skin: SKIN, brow: HAIR, nose: 1.05, jaw: 1.08, ears: "hobbit" });
  for (const sd of [-1, 1]) k.sphere("skin", 0.035, 8, 6, { x: sd * 0.07, y: 1.11, z: 0.11, tint: "#e89a80", flat: true });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const ring = i % 3;
    const y = 1.2 + ring * 0.035 + (i % 2) * 0.02;
    const r = 0.145 - ring * 0.025;
    const z = Math.sin(a) * r * 0.9 - 0.03;
    if (z > 0.08 && y < 1.24) continue; // keep the face clear
    k.sphere("hair", 0.045 + (i % 4) * 0.006, 8, 6, { x: Math.cos(a) * r, y, z, tint: HAIR, shade: 0.9 + (i % 5) * 0.05 });
  }
  k.sphere("hair", 0.15, 12, 10, { y: 1.22, z: -0.03, s: [1, 0.7, 1], tint: HAIR }, Math.PI * 2, 0, Math.PI * 0.5);
}

// ── Elrond of Rivendell ─────────────────────────────────────────────────────

function buildElrond(k: Kit) {
  k.aoHeight = 0.6;
  k.aoDepth = 0.26;
  const ROBE = "#6a2436";
  const MANTLE = "#4a1c2c";
  const HAIR = "#1e1610";
  const SKIN = "#e8caa8";
  // the inner robe, floor length
  lathe(k, "velvet", [[0.34, 0], [0.31, 0.3], [0.26, 0.8], [0.22, 1.0], [0.24, 1.25], [0.26, 1.38], [0.22, 1.47], [0.12, 1.53], [0.06, 1.58]],
    { tint: ROBE }, { sz: 0.8, folds: [9, 0.06, 0.9] });
  // the outer mantle, open at the front, gold-edged
  const mantle: P2[] = [[0.42, 0.02], [0.38, 0.4], [0.31, 0.95], [0.28, 1.25], [0.27, 1.42], [0.17, 1.5], [0.1, 1.55]];
  const GAP = 1.1;
  lathe(k, "velvet", mantle, { z: -0.02, tint: MANTLE }, { open: GAP, sz: 0.86, folds: [8, 0.07, 1.2] });
  for (const sd of [-1, 1]) {
    const pts: V3[] = profile(mantle, 14).map((p) => [Math.sin(sd * GAP / 2) * p.x, p.y, Math.cos(GAP / 2) * p.x * 0.86 - 0.02] as V3);
    chain(k, "goldTrim", pts, 0.014, 0.014, { flat: true }, 5);
  }
  k.torus("goldTrim", 0.235, 0.014, 5, 24, Math.PI * 2, { y: 1.0, rx: Math.PI / 2, s: [1, 0.8, 1], flat: true });
  // wide sleeves; both hands hold the open Tome of the Eldar
  for (const sd of [-1, 1] as const) {
    limb(k, "velvet", [sd * 0.22, 1.43, 0], [sd * 0.28, 1.14, 0.06], 0.07, 0.075, { tint: MANTLE });
    limb(k, "velvet", [sd * 0.28, 1.14, 0.06], [sd * 0.16, 1.12, 0.26], 0.075, 0.12, { tint: MANTLE });
    hand(k, [sd * 0.13, 1.12, 0.28], [-sd * 0.4, 0.3, 1], 0.09, SKIN, sd);
  }
  // the book: two leaves in a shallow V, its pages pale
  for (const sd of [-1, 1]) {
    k.box("leather", 0.16, 0.012, 0.22, { x: sd * 0.08, y: 1.16, z: 0.34, rz: -sd * 0.18, rx: -0.5, tint: "#3e2a1a" });
    k.box("paper", 0.15, 0.012, 0.2, { x: sd * 0.078, y: 1.172, z: 0.336, rz: -sd * 0.16, rx: -0.5 });
  }
  // the face: fine, ageless, elf-eared
  head(k, { y: 1.56, s: 0.26, skin: SKIN, brow: HAIR, nose: 1.05, jaw: 0.9, ears: "elf" });
  // long straight hair, parted, falling behind and over the shoulders
  k.sphere("hair", 0.138, 16, 12, { y: 1.72, z: -0.02, s: [0.92, 1, 1], tint: HAIR }, Math.PI * 2, 0, Math.PI * 0.55);
  lathe(k, "hair", [[0.13, 1.2], [0.15, 1.4], [0.145, 1.6], [0.13, 1.75], [0.08, 1.83]], { z: -0.03, tint: HAIR }, { open: Math.PI * 1.1, sz: 0.85, folds: [14, 0.06, 1.7] });
  locks(k, [-0.125, 1.7, 0.02], [-0.17, 1.32, 0.1], 3, [0.0, 0, 0.05], 0.015, HAIR);
  locks(k, [0.125, 1.7, 0.02], [0.17, 1.32, 0.1], 3, [0.0, 0, 0.05], 0.015, HAIR);
  // the silver circlet, a star of Eärendil at the brow
  k.torus("goldTrim", 0.135, 0.008, 5, 28, Math.PI * 2, { y: 1.73, z: -0.005, rx: Math.PI / 2 + 0.12, s: [0.92, 1, 1], tint: "#e8e6e0" });
  k.sphere("gem", 0.016, 8, 6, { y: 1.745, z: 0.13, flat: true });
}

// ── Strider, the Ranger ─────────────────────────────────────────────────────

function buildStrider(k: Kit) {
  k.aoHeight = 0.5;
  k.aoDepth = 0.3;
  const CLOAK = "#3e4632";
  const COAT = "#5c4c3a";
  const JERKIN = "#76583c";
  const HAIR = "#2a2016";
  const SKIN = "#dcb08a";
  // tall boots and dark breeches
  for (const sd of [-1, 1] as const) {
    boot(k, sd * 0.12, 0.3, "#3a2a1c");
    limb(k, "leather", [sd * 0.12, 0.12, 0], [sd * 0.12, 0.52, 0.01], 0.07, 0.075, { tint: "#3a2a1c" });
    k.torus("leather", 0.078, 0.014, 5, 12, Math.PI * 2, { x: sd * 0.12, y: 0.5, rx: Math.PI / 2, tint: "#2e2016" });
    limb(k, "cloth", [sd * 0.12, 0.52, 0.01], [sd * 0.13, 0.98, 0], 0.075, 0.09, { tint: "#46403a" });
  }
  // the jerkin, belted, over a dark shirt
  lathe(k, "leather", [[0.2, 0.86], [0.21, 1.0], [0.23, 1.2], [0.245, 1.34], [0.21, 1.45], [0.11, 1.52], [0.06, 1.56]], { tint: JERKIN }, { sx: 1.08, sz: 0.68 });
  k.torus("leather", 0.215, 0.022, 5, 22, Math.PI * 2, { y: 0.98, rx: Math.PI / 2, s: [1, 0.78, 1], tint: "#241810" });
  k.box("steel", 0.05, 0.04, 0.02, { y: 0.98, z: 0.17, flat: true });
  // the long coat, split, to the knee
  lathe(k, "leather", [[0.3, 0.42], [0.27, 0.7], [0.23, 0.95], [0.235, 1.2], [0.245, 1.36], [0.2, 1.46], [0.12, 1.52]], { z: -0.01, tint: COAT }, { open: 1.2, sx: 1.08, sz: 0.74, folds: [7, 0.06, 0.9] });
  for (const sd of [-1, 1]) k.sphere("leather", 0.078, 12, 8, { x: sd * 0.225, y: 1.44, s: [1.2, 0.8, 1], tint: COAT });
  // the ranger's cloak, hood fallen behind the neck
  lathe(k, "cloth", [[0.42, 0.22], [0.38, 0.6], [0.32, 1.0], [0.29, 1.3], [0.26, 1.43], [0.16, 1.5], [0.11, 1.53]], { z: -0.04, tint: CLOAK }, { open: 2.1, sz: 0.85, folds: [8, 0.1, 1.2], ragged: [0.4, 0.06] });
  k.torus("cloth", 0.12, 0.06, 8, 16, Math.PI * 1.3, { y: 1.5, z: -0.06, rx: Math.PI / 2, rz: Math.PI * 1.5 - Math.PI * 0.65, tint: CLOAK, shade: 0.9 });
  k.sphere("steel", 0.022, 8, 6, { x: 0.1, y: 1.47, z: 0.12, flat: true });
  // sword belt slung across, the blade at his left hip, his hand on the hilt
  limb(k, "leather", [0.18, 1.02, 0.12], [-0.2, 0.9, 0.12], 0.014, 0.014, { tint: "#241810" }, 5, false);
  limb(k, "leather", [-0.22, 0.92, 0.08], [-0.34, 0.2, -0.18], 0.03, 0.026, { tint: "#2a1e14" });
  sword(k, [-0.21, 1.0, 0.12], [0.18, 1, 0.12], 0.0, { guard: "#b8bcc4" });
  for (const sd of [-1, 1] as const) {
    const sh: V3 = [sd * 0.23, 1.43, 0];
    const el: V3 = [sd * 0.29, 1.14, sd > 0 ? 0.02 : 0.06];
    const wr: V3 = sd > 0 ? [0.27, 0.88, 0.1] : [-0.19, 1.04, 0.16];
    limb(k, "cloth", sh, el, 0.07, 0.065, { tint: COAT });
    limb(k, "leather", el, wr, 0.065, 0.055, { tint: "#3a2a1c" });
    hand(k, wr, sd > 0 ? [0, -1, 0.15] : [0.5, -0.3, 0.6], 0.1, SKIN, sd);
  }
  // the face: weathered, stubbled, dark hair to the shoulders
  head(k, { y: 1.56, s: 0.265, skin: SKIN, brow: HAIR, nose: 1.1, jaw: 1.02, turn: 0.18 });
  // stubble: a shell over the lower jaw only, below the mouth
  k.sphere("hair", 0.098, 16, 10, { y: 1.633, z: 0.02, s: [0.98, 0.92, 1.04], ry: 0.18, tint: "#3e3024" }, Math.PI, Math.PI * 0.5, Math.PI * 0.45);
  k.sphere("hair", 0.14, 16, 12, { y: 1.71, z: -0.025, s: [0.95, 1, 1], tint: HAIR }, Math.PI * 2, 0, Math.PI * 0.56);
  lathe(k, "hair", [[0.14, 1.42], [0.155, 1.55], [0.15, 1.68], [0.12, 1.79]], { z: -0.03, tint: HAIR }, { open: Math.PI * 0.9, sz: 0.9, folds: [12, 0.16, 1.7] });
  locks(k, [0.115, 1.72, 0.03], [0.15, 1.52, 0.05], 2, [0, 0, 0.04], 0.016, HAIR);
  locks(k, [-0.115, 1.72, 0.03], [-0.15, 1.52, 0.05], 2, [0, 0, 0.04], 0.016, HAIR);
}

// ── Thorin Oakenshield ──────────────────────────────────────────────────────

function buildThorin(k: Kit) {
  k.aoHeight = 0.45;
  k.aoDepth = 0.3;
  const COAT = "#34445e";
  const FUR = "#3a2c1e";
  const HAIR = "#211810";
  const SKIN = "#deac84";
  // heavy boots, short thick legs
  for (const sd of [-1, 1] as const) {
    boot(k, sd * 0.15, 0.36, "#3e2e1e");
    limb(k, "leather", [sd * 0.15, 0.12, 0], [sd * 0.15, 0.36, 0], 0.085, 0.095, { tint: "#3e2e1e" });
    k.torus("hair", 0.1, 0.03, 6, 12, Math.PI * 2, { x: sd * 0.15, y: 0.36, rx: Math.PI / 2, tint: FUR });
    limb(k, "cloth", [sd * 0.15, 0.38, 0], [sd * 0.14, 0.6, 0], 0.095, 0.105, { tint: "#2a2830" });
  }
  // mail beneath the coat, the coat split at the front
  lathe(k, "steel", [[0.26, 0.48], [0.27, 0.7], [0.28, 0.95], [0.27, 1.12]], { tint: "#9aa0a8", shade: 0.85 }, { sz: 0.85, folds: [24, 0.03, 1.1] });
  lathe(k, "cloth", [[0.36, 0.42], [0.33, 0.62], [0.3, 0.86], [0.31, 1.05], [0.33, 1.22], [0.3, 1.32], [0.18, 1.4]], { tint: COAT }, { open: 0.75, sz: 0.88, folds: [8, 0.06, 0.85] });
  // fur trims the hem and the great mantle
  k.torus("hair", 0.33, 0.04, 6, 24, Math.PI * 2 - 0.75, { y: 0.44, rx: Math.PI / 2, rz: Math.PI / 2 + 0.375, s: [1, 0.88, 1], tint: FUR });
  // the fur mantle: a shawl over the shoulders, open at the breast
  lathe(k, "hair", [[0.4, 1.06], [0.42, 1.16], [0.37, 1.28], [0.25, 1.37], [0.14, 1.41]], { z: -0.03, tint: FUR }, { open: 1.15, sx: 1.05, sz: 0.85, folds: [20, 0.08, 1.4] });
  k.torus("hair", 0.17, 0.05, 8, 18, Math.PI * 2, { y: 1.4, rx: Math.PI / 2, s: [1.05, 0.85, 1], tint: FUR, shade: 0.92 });
  // the belt, wide, with a heavy buckle
  k.torus("leather", 0.305, 0.04, 5, 24, Math.PI * 2, { y: 0.9, rx: Math.PI / 2, s: [1, 0.86, 1], tint: "#2a1e12" });
  k.box("steel", 0.12, 0.09, 0.03, { y: 0.9, z: 0.27, tint: "#c8b06a" });
  for (const sd of [-1, 1] as const) {
    const sh: V3 = [sd * 0.33, 1.36, 0];
    const el: V3 = [sd * 0.42, 1.04, 0.06];
    const wr: V3 = sd > 0 ? [0.4, 0.86, 0.24] : [-0.44, 0.9, 0.16];
    limb(k, "cloth", sh, el, 0.095, 0.09, { tint: COAT });
    limb(k, "cloth", el, wr, 0.09, 0.08, { tint: COAT });
    k.torus("hair", 0.085, 0.028, 6, 12, Math.PI * 2, { x: wr[0], y: wr[1] + 0.05, z: wr[2] - 0.03, rx: Math.PI / 2 - 0.5, tint: FUR });
    hand(k, wr, sd > 0 ? [0, 0.2, 1] : [0, -0.3, 1], 0.11, SKIN, sd);
  }
  // Orcrist raised in the right fist, the elven blade curving
  sword(k, [0.4, 0.88, 0.3], [0.12, 1, 0.3], 0.82, { guard: "#c8d0d8", curve: 0.06, width: 0.04 });
  // Oakenshield on the left forearm: a cut bough, branch stubs and bark
  limb(k, "wood", [-0.52, 0.72, 0.1], [-0.46, 1.12, 0.22], 0.15, 0.16, { tint: "#6e5232" }, 12, false);
  for (const sd of [0, 1]) k.cyl("wood", 0.15, 0.15, 0.01, 12, { x: -0.52 + sd * 0.06, y: 0.72 + sd * 0.4, z: 0.1 + sd * 0.12, rx: 0.3, tint: "#a88a5c" });
  spike(k, "wood", [-0.55, 0.98, 0.2], [-1, 0.3, 0.3], 0.035, 0.15, { tint: "#5a4228" });
  spike(k, "wood", [-0.5, 0.82, 0.25], [-0.6, -0.4, 0.7], 0.028, 0.12, { tint: "#5a4228" });
  // the face: heavy-browed, great nose, the beard short and braided
  head(k, { y: 1.42, s: 0.27, skin: SKIN, brow: HAIR, nose: 1.4, jaw: 1.12 });
  lathe(k, "hair", [[0.02, 1.24], [0.08, 1.3], [0.115, 1.38], [0.12, 1.45], [0.1, 1.5]], { z: 0.06, tint: HAIR }, { open: Math.PI * 1.0, back: true, sz: 0.8, folds: [14, 0.12, 1.48] });
  for (const sd of [-1, 1]) {
    chain(k, "hair", [[sd * 0.05, 1.33, 0.15], [sd * 0.06, 1.24, 0.15], [sd * 0.055, 1.16, 0.14]], 0.022, 0.016, { tint: HAIR }, 6);
    k.cyl("steel", 0.024, 0.024, 0.03, 8, { x: sd * 0.055, y: 1.17, z: 0.14, tint: "#d8dce2", flat: true });
  }
  for (const sd of [-1, 1]) limb(k, "hair", [sd * 0.01, 1.52, 0.15], [sd * 0.1, 1.45, 0.13], 0.024, 0.012, { tint: HAIR }, 5);
  // the mane, long, a streak of grey at the temples; braids before the ears
  k.sphere("hair", 0.145, 16, 12, { y: 1.58, z: -0.02, s: [0.95, 1, 1], tint: HAIR }, Math.PI * 2, 0, Math.PI * 0.56);
  lathe(k, "hair", [[0.15, 1.14], [0.17, 1.3], [0.165, 1.5], [0.14, 1.64], [0.09, 1.71]], { z: -0.03, tint: HAIR }, { open: Math.PI * 1.05, sz: 0.9, folds: [12, 0.14, 1.6] });
  for (const sd of [-1, 1]) {
    chain(k, "hair", [[sd * 0.125, 1.6, 0.03], [sd * 0.14, 1.46, 0.05], [sd * 0.145, 1.32, 0.06]], 0.014, 0.011, { tint: "#3a3028" }, 6);
    k.cyl("steel", 0.016, 0.016, 0.026, 8, { x: sd * 0.145, y: 1.33, z: 0.06, tint: "#d8dce2", flat: true });
  }
}

// ── registry ────────────────────────────────────────────────────────────────

const BUILDERS: Record<string, (k: Kit) => void> = {
  gandalf: buildGandalf,
  sauron: buildSauron,
  balrog: buildBalrog,
  bilbo: buildBilbo,
  elrond: buildElrond,
  strider: buildStrider,
  thorin: buildThorin,
};

/** Build a figure by name. Returns a merged group, feet at y=0, facing +Z. */
export function buildCharacter(name: string): THREE.Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const k = new Kit();
  build(k);
  return k.finish(cmats(), CUV, 1.2);
}

/** Map a model URL ("/models/strider.glb") to a procedural builder name. */
export function characterFor(url: string): string | null {
  // the whole file name, so an uploaded "my-gandalf.glb" still loads as itself
  const m = /(?:^|\/)([a-z]+)\.glb$/i.exec(url);
  const name = m?.[1].toLowerCase();
  return name && BUILDERS[name] ? name : null;
}
