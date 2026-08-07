/**
 * Procedural figures, built the way the landmarks are built: a flat list of
 * kit primitives merged into one mesh per material, dressed in the shared
 * canvas-drawn PBR surfaces. Replaces the downloaded GLBs — every character
 * costs a few draw calls, nothing on the wire, and sits in the same light as
 * the architecture around it.
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
    cloth: pbr(s.organic, "#e0dacc", { roughness: 1, normalScale: 0.7, side: THREE.DoubleSide }),
    skin: plain("#eec9a2", { roughness: 0.85 }),
    // thatch reads as combed strands at close UV scale — hair, beards, fur
    hair: pbr(s.thatch, "#e6e2d8", { normalScale: 1.15, roughness: 0.95 }),
    leather: pbr(s.timber, "#a08050", { normalScale: 0.55, roughness: 0.92 }),
    wood: pbr(s.timber, "#8a6438", { normalScale: 1.1 }),
    steel: pbr(s.metal, "#ccd0d6", { metalness: 0.85, roughness: 0.38, envMapIntensity: 1.6 }),
    blackSteel: pbr(s.metal, "#544c48", { metalness: 0.8, roughness: 0.42, envMapIntensity: 2.2 }),
    goldTrim: pbr(s.metal, "#e2b45a", { metalness: 0.85, roughness: 0.4, envMapIntensity: 1.6 }),
    // the Balrog's hide: charred crust over inner fire
    charhide: pbr(s.rock, "#382a20", { normalScale: 1.5, roughness: 1 }),
    membrane: plain("#241612", {
      roughness: 1, side: THREE.DoubleSide, emissive: "#3a0e04", emissiveIntensity: 0.55,
    }),
    flame: plain("#2a1006", { emissive: "#ff6a16", emissiveIntensity: 2.6, roughness: 0.9 }),
    ember: plain("#2a0d04", { emissive: "#ffb23e", emissiveIntensity: 3.0, roughness: 0.6 }),
    glim: plain("#dfe8ff", { emissive: "#bcd8ff", emissiveIntensity: 1.6, roughness: 0.3 }),
  };
  return CMATS;
}

/** World units per texture tile — small, we are centimetres from the cloth. */
const CUV: UVScales = {
  cloth: 1.5, hair: 0.8, leather: 1.1, wood: 0.8,
  steel: 1.3, blackSteel: 1.3, goldTrim: 0.9, charhide: 2.4,
};

// ── aiming helpers ──────────────────────────────────────────────────────────

type V3 = [number, number, number];

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

/** A tapered cylinder between two points. `r0` at `from`, `r1` at `to`. */
function limb(k: Kit, mat: string, from: V3, to: V3, r0: number, r1: number, tf: Partial<TF> = {}, seg = 8) {
  const a = aim(from, to);
  k.cyl(mat, r1, r0, a.len, seg, { x: a.x, y: a.y, z: a.z, rx: a.rx, ry: a.ry, rz: a.rz, ...tf });
}

/** A cone whose apex points from `at` along `dir` — claws, spikes, horns. */
function spike(k: Kit, mat: string, at: V3, dir: V3, r: number, len: number, tf: Partial<TF> = {}, seg = 5) {
  const a = aim(at, [at[0] + dir[0], at[1] + dir[1], at[2] + dir[2]]);
  k.cone(mat, r, len, seg, {
    x: at[0] + (dir[0] / a.len) * (len / 2),
    y: at[1] + (dir[1] / a.len) * (len / 2),
    z: at[2] + (dir[2] / a.len) * (len / 2),
    rx: a.rx, ry: a.ry, rz: a.rz, ...tf,
  });
}

function hand(k: Kit, at: V3, r: number, tint?: string) {
  k.sphere("skin", r, 8, 6, { x: at[0], y: at[1], z: at[2], tint });
}

// ── Gandalf the Grey ────────────────────────────────────────────────────────

function buildGandalf(k: Kit) {
  k.aoHeight = 0.6;
  k.aoDepth = 0.3;
  const GREY = "#b8b2a6";
  const GREY_D = "#968e80";
  const HAT = "#8e887a";
  const WHITE = "#f2efe8";

  // layered robe, hem kissing the ground
  k.cyl("cloth", 0.3, 0.46, 1.12, 12, { y: 0.56, tint: GREY, shade: 0.96 });
  k.cyl("cloth", 0.32, 0.4, 0.5, 12, { y: 1.3, tint: GREY });
  // travel cloak falling from the shoulders, heavier behind
  k.cyl("cloth", 0.2, 0.44, 0.95, 12, { y: 1.18, z: -0.07, rx: 0.09, tint: GREY_D, shade: 0.9 });
  k.sphere("cloth", 0.3, 12, 8, { y: 1.56, s: [1.12, 0.58, 0.95], tint: GREY_D });
  // rope belt
  k.torus("leather", 0.35, 0.032, 6, 16, Math.PI * 2, { y: 1.06, rx: Math.PI / 2, tint: "#d8cba8" });
  // arms — right planted on the staff, left drawn in
  limb(k, "cloth", [0.28, 1.52, 0], [0.44, 1.06, 0.24], 0.085, 0.125, { tint: GREY });
  limb(k, "cloth", [-0.28, 1.52, 0], [-0.28, 1.04, 0.3], 0.085, 0.125, { tint: GREY });
  hand(k, [0.45, 1.0, 0.26], 0.055);
  hand(k, [-0.28, 0.98, 0.33], 0.055);
  // head, nose, deep-set brow shadow under the hat
  k.sphere("skin", 0.145, 12, 10, { y: 1.78, z: 0.02 });
  k.cone("skin", 0.032, 0.09, 5, { y: 1.78, z: 0.17, rx: Math.PI / 2 });
  k.box("hair", 0.2, 0.035, 0.06, { y: 1.85, z: 0.12, tint: WHITE, shade: 1.1 });
  // the beard — a full fall to the chest, mustache wings over it
  k.cone("hair", 0.155, 0.66, 9, { y: 1.4, z: 0.1, rx: Math.PI, tint: WHITE });
  for (const s of [-1, 1] as const) {
    k.cone("hair", 0.042, 0.28, 5, { x: s * 0.075, y: 1.62, z: 0.15, rx: Math.PI, rz: s * 0.5, tint: WHITE, shade: 1.05 });
  }
  // hair sweeping down the back
  k.sphere("hair", 0.155, 10, 8, { y: 1.8, z: -0.04, s: [1.08, 0.95, 1.05], tint: "#eae6dc" });
  k.cone("hair", 0.13, 0.6, 8, { y: 1.5, z: -0.13, rx: Math.PI, tint: "#eae6dc", shade: 0.92 });
  // the pointed hat, brim bent, tip drooping — two stacked cones fake the fold
  k.cyl("cloth", 0.4, 0.45, 0.05, 14, { y: 1.92, rz: 0.07, tint: HAT, shade: 0.88 });
  k.cone("cloth", 0.235, 0.6, 12, { x: -0.02, y: 2.2, rz: 0.1, tint: HAT });
  k.cone("cloth", 0.1, 0.3, 8, { x: -0.08, y: 2.48, rz: 0.32, tint: HAT, shade: 0.9 });
  // the staff: gnarled shaft, a root-cage head, a pale glimmer caught in it
  limb(k, "wood", [0.48, 0, 0.3], [0.42, 2.02, 0.16], 0.045, 0.028);
  k.torus("wood", 0.05, 0.02, 5, 10, Math.PI * 2, { x: 0.455, y: 1.32, z: 0.21, rx: 0.4, shade: 0.9 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    spike(k, "wood", [0.42, 2.0, 0.16], [Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35], 0.014, 0.17);
  }
  k.sphere("glim", 0.042, 8, 6, { x: 0.42, y: 2.06, z: 0.16, flat: true });
}

// ── Sauron, the Dark Lord ───────────────────────────────────────────────────

function buildSauron(k: Kit) {
  k.aoHeight = 0.7;
  k.aoDepth = 0.3;
  // sabatons and greaves
  for (const s of [-1, 1] as const) {
    k.box("blackSteel", 0.17, 0.1, 0.32, { x: s * 0.17, y: 0.06, z: 0.06 });
    spike(k, "blackSteel", [s * 0.17, 0.08, 0.22], [0, 0.25, 1], 0.032, 0.14);
    limb(k, "blackSteel", [s * 0.17, 0.1, 0.02], [s * 0.16, 0.58, -0.01], 0.062, 0.08);
    k.sphere("blackSteel", 0.088, 8, 6, { x: s * 0.16, y: 0.62, z: 0.01, shade: 1.08 });
    spike(k, "blackSteel", [s * 0.16, 0.64, 0.06], [0, 0.5, 1], 0.026, 0.11);
    limb(k, "blackSteel", [s * 0.16, 0.64, 0], [s * 0.14, 1.06, 0], 0.083, 0.1);
  }
  // skirt of tassets round the fauld
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.35;
    k.box("blackSteel", 0.17, 0.36, 0.035, {
      x: Math.cos(a) * 0.23, y: 1.0, z: Math.sin(a) * 0.2,
      ry: -a + Math.PI / 2, rx: Math.sin(a) * -0.14, shade: 0.9 + (i % 3) * 0.08,
    });
  }
  k.cyl("blackSteel", 0.2, 0.235, 0.26, 10, { y: 1.2 });
  // cuirass with a raised centre ridge
  k.box("blackSteel", 0.54, 0.54, 0.3, { y: 1.5, shade: 1.04 });
  k.box("blackSteel", 0.05, 0.55, 0.335, { y: 1.5, shade: 1.16 });
  k.box("blackSteel", 0.46, 0.14, 0.27, { y: 1.21, shade: 0.92 });
  // pauldrons: cupped plates bristling upward
  for (const s of [-1, 1] as const) {
    k.sphere("blackSteel", 0.17, 10, 8, { x: s * 0.34, y: 1.76, s: [1.1, 0.82, 1.0], shade: 1.06 });
    k.cone("blackSteel", 0.155, 0.13, 8, { x: s * 0.35, y: 1.66 });
    spike(k, "blackSteel", [s * 0.42, 1.82, 0], [s * 0.7, 1, -0.1], 0.036, 0.3);
    spike(k, "blackSteel", [s * 0.3, 1.86, 0], [s * 0.25, 1, 0], 0.028, 0.22);
    // arm, elbow cop, flared vambrace, gauntlet
    limb(k, "blackSteel", [s * 0.34, 1.72, 0], [s * 0.42, 1.3, 0.06], 0.07, 0.058);
    k.sphere("blackSteel", 0.065, 8, 6, { x: s * 0.42, y: 1.3, z: 0.06 });
    limb(k, "blackSteel", [s * 0.42, 1.3, 0.06], [s * 0.4, 0.98, 0.17], 0.052, 0.072);
    k.box("blackSteel", 0.1, 0.15, 0.17, { x: s * 0.4, y: 0.92, z: 0.21, shade: 1.05 });
    for (let f = 0; f < 3; f++) {
      spike(k, "blackSteel", [s * 0.37 + s * f * 0.03, 0.87, 0.3], [0, -0.35, 1], 0.014, 0.07);
    }
  }
  // the mace, hafted in the right fist
  limb(k, "blackSteel", [0.44, 0.6, 0.24], [0.58, 1.88, 0.44], 0.026, 0.032);
  k.sphere("blackSteel", 0.11, 8, 6, { x: 0.6, y: 2.0, z: 0.46, shade: 1.1 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    spike(k, "blackSteel", [0.6, 2.0, 0.46], [Math.cos(a), 0.32, Math.sin(a) * 0.8], 0.045, 0.2, { shade: 1.08 }, 4);
  }
  // gorget and the great helm — a slit of fire between cheek plates,
  // and the twin bladed prongs that make the silhouette
  k.cyl("blackSteel", 0.095, 0.12, 0.14, 8, { y: 1.9 });
  k.cyl("blackSteel", 0.125, 0.145, 0.32, 8, { y: 2.08, shade: 1.05 });
  k.cone("blackSteel", 0.13, 0.14, 8, { y: 2.3 });
  k.box("ember", 0.15, 0.024, 0.02, { y: 2.12, z: 0.135, flat: true });
  for (const s of [-1, 1] as const) {
    k.box("blackSteel", 0.05, 0.16, 0.06, { x: s * 0.1, y: 2.08, z: 0.1, ry: s * 0.5, shade: 0.9 });
    // each prong: three tapering segments leaning further out — a curve
    limb(k, "blackSteel", [s * 0.08, 2.3, 0], [s * 0.2, 2.62, -0.02], 0.038, 0.026);
    limb(k, "blackSteel", [s * 0.2, 2.62, -0.02], [s * 0.34, 2.86, -0.06], 0.026, 0.016);
    spike(k, "blackSteel", [s * 0.34, 2.86, -0.06], [s * 0.55, 0.75, -0.15], 0.016, 0.24);
    // shorter mid blades
    spike(k, "blackSteel", [s * 0.05, 2.34, -0.06], [s * 0.28, 1, -0.3], 0.02, 0.3);
  }
}

// ── the Balrog of Morgoth ───────────────────────────────────────────────────

/** A scalloped bat-wing membrane fanned from `root` — one custom geometry. */
function balrogWing(k: Kit, s: 1 | -1) {
  const root: V3 = [s * 0.85, 3.85, -0.2];
  // wing frame: outward and up-ish basis vectors, swept slightly back
  const e1 = new THREE.Vector3(s * 1, 0.18, -0.38).normalize();
  const e2 = new THREE.Vector3(s * 0.12, 1, -0.25).normalize();
  const P = (u: number, w: number): V3 => [
    root[0] + e1.x * u + e2.x * w,
    root[1] + e1.y * u + e2.y * w,
    root[2] + e1.z * u + e2.z * w,
  ];
  // finger tips, root-to-trailing-edge order
  const tips: [number, number][] = [[2.5, 1.15], [3.05, 0.25], [2.7, -0.85], [1.7, -1.6]];
  // bones: leading arm + a bone to each tip
  limb(k, "charhide", root, P(1.4, 0.85), 0.11, 0.07, { shade: 0.9 });
  for (const [u, w] of tips.slice(0, 3)) limb(k, "charhide", P(1.3, 0.8), P(u, w), 0.055, 0.02, { shade: 0.85 }, 5);
  spike(k, "charhide", P(2.5, 1.15), [e1.x + e2.x, e1.y + e2.y, e1.z + e2.z], 0.035, 0.3);
  // membrane: triangle fan from the root through scalloped edge points
  const edge: V3[] = [];
  for (let i = 0; i < tips.length; i++) {
    edge.push(P(tips[i][0], tips[i][1]));
    if (i < tips.length - 1) {
      // scallop: midpoint pulled toward the root
      const mu = (tips[i][0] + tips[i + 1][0]) / 2;
      const mw = (tips[i][1] + tips[i + 1][1]) / 2;
      edge.push(P(mu * 0.72, mw * 0.72));
    }
  }
  const pos: number[] = [];
  for (let i = 0; i < edge.length - 1; i++) {
    pos.push(...root, ...edge[i], ...edge[i + 1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  k.add("membrane", g, { flat: true });
}

function buildBalrog(k: Kit) {
  k.aoHeight = 1.4;
  k.aoDepth = 0.34;
  const r = (() => { let sd = 6660; return () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; }; })();

  // clawed feet, braced wide
  for (const s of [-1, 1] as const) {
    k.box("charhide", 0.5, 0.28, 0.62, { x: s * 0.72, y: 0.14, z: -0.02, ry: s * 0.15, shade: 0.85 });
    for (let c = 0; c < 3; c++) {
      spike(k, "charhide", [s * (0.55 + c * 0.17), 0.12, 0.28], [s * (c - 1) * 0.25, -0.05, 1], 0.06, 0.3, { shade: 1.25 }, 4);
    }
    // legs: shin and thigh, thick and knotted
    limb(k, "charhide", [s * 0.72, 0.25, -0.05], [s * 0.6, 1.3, -0.3], 0.2, 0.26, { shade: 0.92 });
    k.sphere("charhide", 0.28, 8, 6, { x: s * 0.6, y: 1.32, z: -0.28, shade: 0.88 });
    limb(k, "charhide", [s * 0.6, 1.3, -0.3], [s * 0.44, 2.2, 0.02], 0.27, 0.33, { shade: 0.95 });
  }
  // hips, gut, the huge smouldering chest, hunched forward
  k.sphere("charhide", 0.6, 12, 9, { y: 2.25, s: [1.1, 0.75, 0.9], shade: 0.9 });
  k.sphere("charhide", 0.58, 12, 9, { y: 2.75, z: 0.06, s: [1.12, 0.85, 0.92], shade: 0.95 });
  k.sphere("charhide", 0.74, 14, 10, { y: 3.45, z: 0.1, s: [1.38, 1.0, 0.95], shade: 1.05 });
  // shoulders and arms — long, ending in claws
  for (const s of [-1, 1] as const) {
    k.sphere("charhide", 0.38, 10, 8, { x: s * 0.98, y: 3.85, z: 0.05, shade: 1.0 });
    limb(k, "charhide", [s * 0.98, 3.85, 0.05], [s * 1.32, 2.95, 0.15], 0.21, 0.17, { shade: 0.92 });
    limb(k, "charhide", [s * 1.32, 2.95, 0.15], [s * 1.38, 2.05, 0.42], 0.16, 0.19, { shade: 0.9 });
    k.sphere("charhide", 0.2, 8, 6, { x: s * 1.38, y: 1.98, z: 0.48, shade: 0.85 });
    for (let c = 0; c < 4; c++) {
      const a = (c / 3 - 0.5) * 0.9;
      spike(k, "charhide", [s * 1.38, 1.9, 0.5], [Math.sin(a) * 0.5 * s, -1, 0.35], 0.05, 0.3, { shade: 1.3 }, 4);
    }
  }
  // the head: heavy skull, split maw of fire, fangs, ember eyes
  k.sphere("charhide", 0.32, 10, 8, { y: 4.4, z: 0.18, s: [1.0, 0.9, 1.1], shade: 1.0 });
  k.box("charhide", 0.36, 0.2, 0.34, { y: 4.32, z: 0.48, shade: 0.95 });
  k.box("charhide", 0.3, 0.1, 0.3, { y: 4.14, z: 0.5, rx: 0.35, shade: 0.85 });
  k.box("flame", 0.26, 0.05, 0.26, { y: 4.24, z: 0.5, flat: true });
  for (let t = 0; t < 4; t++) {
    spike(k, "hair", [-0.12 + t * 0.08, 4.27, 0.62], [0, -1, 0.15], 0.018, 0.07, { tint: "#d8d0c0", flat: true }, 4);
  }
  for (const s of [-1, 1] as const) {
    k.sphere("ember", 0.055, 8, 6, { x: s * 0.14, y: 4.46, z: 0.42, flat: true });
    // the great horns: three segments each, sweeping out, up and back
    limb(k, "charhide", [s * 0.26, 4.52, 0.12], [s * 0.62, 4.72, -0.1], 0.11, 0.075, { shade: 1.1 });
    limb(k, "charhide", [s * 0.62, 4.72, -0.1], [s * 0.88, 5.0, -0.42], 0.075, 0.045, { shade: 1.15 });
    spike(k, "charhide", [s * 0.88, 5.0, -0.42], [s * 0.35, 0.85, -0.75], 0.045, 0.42, { shade: 1.2 });
  }
  // mane and spine: low gouts of flame licking backward along the crust —
  // kept short, or they read as a rigid crown instead of fire
  const tufts: V3[] = [
    [0, 4.62, -0.12], [0.28, 4.55, -0.2], [-0.28, 4.55, -0.2],
    [0.55, 4.05, -0.28], [-0.55, 4.05, -0.28], [0, 4.15, -0.42],
    [0.3, 3.6, -0.5], [-0.3, 3.6, -0.5], [0, 3.0, -0.55],
  ];
  for (const [tx, ty, tz] of tufts) {
    spike(k, "flame", [tx, ty, tz], [tx * 0.5 + (r() - 0.5) * 0.4, 0.75, tz * 0.8 - 0.5], 0.055 + r() * 0.035, 0.26 + r() * 0.2, { flat: true }, 5);
  }
  // lava cracks over chest and shoulders
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    k.box("flame", 0.035, 0.4 + r() * 0.3, 0.02, {
      x: Math.cos(a) * (0.55 + r() * 0.3), y: 2.6 + r() * 1.2, z: 0.25 + Math.sin(a) * 0.35,
      rz: (r() - 0.5) * 1.2, rx: (r() - 0.5) * 0.6, flat: true,
    });
  }
  // wings
  balrogWing(k, 1);
  balrogWing(k, -1);
  // the flaming sword, raised in the right fist
  limb(k, "charhide", [1.45, 2.0, 0.5], [1.62, 2.5, 0.62], 0.05, 0.04);
  limb(k, "flame", [1.62, 2.5, 0.62], [2.05, 3.9, 0.95], 0.085, 0.015, { flat: true }, 5);
  // the whip of many thongs, trailing from the left
  const whip: V3[] = [[-1.42, 1.95, 0.55], [-1.8, 1.5, 0.8], [-2.3, 1.05, 0.75], [-2.75, 0.55, 0.5]];
  for (let i = 0; i < whip.length - 1; i++) {
    limb(k, "flame", whip[i], whip[i + 1], 0.06 - i * 0.015, 0.045 - i * 0.012, { flat: true }, 5);
  }
  for (let t = 0; t < 3; t++) {
    spike(k, "flame", whip[3], [-(0.5 + t * 0.2), -0.5, (t - 1) * 0.5], 0.025, 0.35, { flat: true }, 4);
  }
}

// ── Bilbo Baggins ───────────────────────────────────────────────────────────

function buildBilbo(k: Kit) {
  k.aoHeight = 0.35;
  k.aoDepth = 0.3;
  const SKIN = "#f2c9a0";
  // famous feet: broad, bare, tufted
  for (const s of [-1, 1] as const) {
    k.sphere("skin", 0.075, 8, 6, { x: s * 0.1, y: 0.05, z: 0.07, s: [1.25, 0.6, 1.9], tint: SKIN });
    k.sphere("hair", 0.035, 6, 5, { x: s * 0.1, y: 0.1, z: 0.05, tint: "#8a5c30", flat: true });
    // breeches to the knee
    limb(k, "cloth", [s * 0.09, 0.08, 0], [s * 0.09, 0.42, 0], 0.055, 0.075, { tint: "#8a6a44" });
  }
  // shirt, waistcoat straining at its buttons, round belly
  k.cyl("cloth", 0.16, 0.19, 0.24, 10, { y: 0.52, tint: "#f2ead8" });
  k.sphere("cloth", 0.2, 10, 8, { y: 0.68, z: 0.02, s: [1.0, 1.05, 0.92], tint: "#7c8a40" });
  k.cyl("cloth", 0.165, 0.2, 0.3, 10, { y: 0.78, tint: "#7c8a40", shade: 0.96 });
  for (let b = 0; b < 3; b++) {
    k.sphere("goldTrim", 0.016, 6, 5, { y: 0.6 + b * 0.11, z: 0.195, flat: true });
  }
  k.torus("cloth", 0.1, 0.03, 5, 12, Math.PI * 2, { y: 0.93, rx: Math.PI / 2 + 0.25, tint: "#f6f0e0" });
  // shirt-sleeve arms, rolled at the forearm
  limb(k, "cloth", [0.17, 0.86, 0], [0.26, 0.62, 0.14], 0.05, 0.062, { tint: "#f2ead8" });
  limb(k, "skin", [0.26, 0.62, 0.14], [0.24, 0.48, 0.26], 0.038, 0.032, { tint: SKIN });
  limb(k, "cloth", [-0.17, 0.86, 0], [-0.24, 0.6, 0.12], 0.05, 0.062, { tint: "#f2ead8" });
  limb(k, "skin", [-0.24, 0.6, 0.12], [-0.2, 0.5, 0.26], 0.038, 0.032, { tint: SKIN });
  hand(k, [0.24, 0.45, 0.28], 0.045, SKIN);
  hand(k, [-0.19, 0.47, 0.29], 0.045, SKIN);
  // the red book, held to the chest — There and Back Again
  k.box("leather", 0.16, 0.21, 0.045, { x: -0.14, y: 0.6, z: 0.28, ry: 0.3, rz: 0.15, tint: "#8a2418" });
  k.box("cloth", 0.145, 0.19, 0.02, { x: -0.14, y: 0.6, z: 0.295, ry: 0.3, rz: 0.15, tint: "#f6efdc", flat: true });
  // head: round cheeks, button nose, pointed ears, curly mop
  k.sphere("skin", 0.12, 12, 9, { y: 1.02, z: 0.01, tint: SKIN });
  k.cone("skin", 0.024, 0.055, 5, { y: 1.01, z: 0.125, rx: Math.PI / 2, tint: SKIN });
  for (const s of [-1, 1] as const) {
    spike(k, "skin", [s * 0.115, 1.04, -0.01], [s * 1, 0.35, -0.3], 0.02, 0.06, { tint: SKIN }, 4);
  }
  const curls: [number, number, number, number][] = [
    [0, 1.13, -0.02, 0.075], [0.08, 1.11, 0.05, 0.06], [-0.08, 1.11, 0.05, 0.06],
    [0.1, 1.08, -0.06, 0.06], [-0.1, 1.08, -0.06, 0.06], [0, 1.09, -0.1, 0.065],
    [0.05, 1.15, 0.02, 0.05], [-0.05, 1.02, -0.11, 0.05],
  ];
  for (const [cx, cy, cz, cr] of curls) {
    k.sphere("hair", cr, 7, 6, { x: cx, y: cy, z: cz, tint: "#8a5c30", shade: 0.9 + (cx + cy) % 0.2 });
  }
}

// ── Elrond of Rivendell ─────────────────────────────────────────────────────

function buildElrond(k: Kit) {
  k.aoHeight = 0.6;
  k.aoDepth = 0.3;
  const ROBE = "#7a3040";
  const MANTLE = "#4a2230";
  const HAIR = "#2c2018";
  const SKIN = "#e8c8a8";
  // floor-length robe with gold-banded hem
  k.cyl("cloth", 0.28, 0.44, 1.38, 14, { y: 0.69, tint: ROBE });
  k.cyl("goldTrim", 0.435, 0.445, 0.06, 14, { y: 0.1, flat: true });
  // open mantle, heavier and darker, falling from the shoulders behind
  k.cyl("cloth", 0.24, 0.5, 1.3, 12, { y: 0.82, z: -0.08, rx: 0.07, tint: MANTLE, shade: 0.92 });
  k.sphere("cloth", 0.28, 12, 8, { y: 1.55, s: [1.15, 0.55, 0.95], tint: MANTLE });
  // gold sash at the waist
  k.cyl("goldTrim", 0.295, 0.31, 0.05, 12, { y: 1.08, flat: true });
  // wide sleeves meeting before him, hands clasped
  limb(k, "cloth", [0.26, 1.5, 0], [0.12, 1.08, 0.28], 0.08, 0.14, { tint: ROBE });
  limb(k, "cloth", [-0.26, 1.5, 0], [-0.12, 1.08, 0.28], 0.08, 0.14, { tint: ROBE });
  hand(k, [0.05, 1.05, 0.3], 0.05, SKIN);
  hand(k, [-0.05, 1.05, 0.3], 0.05, SKIN);
  // head — clean-shaven, stern
  k.sphere("skin", 0.14, 12, 10, { y: 1.76, z: 0.01, tint: SKIN });
  k.cone("skin", 0.028, 0.08, 5, { y: 1.76, z: 0.15, rx: Math.PI / 2, tint: SKIN });
  for (const s of [-1, 1] as const) {
    spike(k, "skin", [s * 0.135, 1.79, -0.02], [s * 1, 0.4, -0.25], 0.02, 0.06, { tint: SKIN }, 4);
    k.box("hair", 0.03, 0.014, 0.07, { x: s * 0.06, y: 1.83, z: 0.125, tint: HAIR, flat: true });
  }
  // long dark hair: crown, back fall, two front falls past the shoulders
  k.sphere("hair", 0.15, 10, 8, { y: 1.79, z: -0.03, s: [1.06, 0.95, 1.05], tint: HAIR });
  k.cone("hair", 0.14, 0.75, 8, { y: 1.42, z: -0.14, rx: Math.PI, tint: HAIR, shade: 0.9 });
  for (const s of [-1, 1] as const) {
    limb(k, "hair", [s * 0.13, 1.78, 0.03], [s * 0.17, 1.28, 0.08], 0.045, 0.03, { tint: HAIR, shade: 0.85 }, 5);
  }
  // the circlet — a thin gold band with a peak over the brow
  k.torus("goldTrim", 0.128, 0.011, 5, 18, Math.PI * 2, { y: 1.83, rx: Math.PI / 2 - 0.12, flat: true });
  k.cone("goldTrim", 0.018, 0.05, 4, { y: 1.87, z: 0.12, rx: 0.5, flat: true });
}

// ── Strider, the Ranger ─────────────────────────────────────────────────────

function buildStrider(k: Kit) {
  k.aoHeight = 0.6;
  k.aoDepth = 0.3;
  const CLOAK = "#465236";
  const JERKIN = "#5a4630";
  const HAIR = "#2e2418";
  const SKIN = "#e2b892";
  // travel-worn boots, cuffed at the knee
  for (const s of [-1, 1] as const) {
    k.box("leather", 0.13, 0.09, 0.26, { x: s * 0.12, y: 0.05, z: 0.05, tint: "#6a5238", shade: 0.85 });
    limb(k, "leather", [s * 0.12, 0.08, 0], [s * 0.115, 0.52, -0.01], 0.06, 0.07, { tint: "#6a5238" });
    k.cyl("leather", 0.082, 0.075, 0.09, 8, { x: s * 0.115, y: 0.54, tint: "#7a6244", shade: 0.9 });
    // trousers
    limb(k, "cloth", [s * 0.115, 0.56, 0], [s * 0.1, 0.92, 0], 0.068, 0.08, { tint: "#4a4038" });
  }
  // jerkin, belt, and the cloak thrown back off the sword arm
  k.cyl("cloth", 0.23, 0.27, 0.34, 10, { y: 1.08, tint: "#4a4038" });
  k.cyl("leather", 0.24, 0.27, 0.42, 10, { y: 1.32, tint: JERKIN });
  k.torus("leather", 0.255, 0.028, 5, 14, Math.PI * 2, { y: 1.12, rx: Math.PI / 2, tint: "#3a2c1c" });
  k.box("goldTrim", 0.05, 0.06, 0.02, { y: 1.12, z: 0.26, flat: true });
  // baldric across the chest
  k.box("leather", 0.06, 0.6, 0.025, { y: 1.36, z: 0.255, rz: 0.6, tint: "#3a2c1c", flat: true });
  // the cloak: an open shell, swept a little to the left
  k.cyl("cloth", 0.21, 0.5, 1.32, 12, { x: -0.03, y: 0.85, z: -0.1, rx: 0.1, rz: -0.06, tint: CLOAK, shade: 0.9 }, true);
  k.sphere("cloth", 0.29, 12, 8, { y: 1.56, s: [1.14, 0.55, 0.95], tint: CLOAK });
  // hood, down about the shoulders
  k.torus("cloth", 0.13, 0.055, 6, 12, Math.PI * 2, { y: 1.62, z: -0.1, rx: Math.PI / 2 - 0.4, tint: CLOAK, shade: 0.82 });
  // the star of the Dúnedain at the shoulder
  k.sphere("steel", 0.026, 6, 5, { x: 0.14, y: 1.6, z: 0.22, flat: true });
  // arms — left hand resting on the sword hilt
  limb(k, "cloth", [0.27, 1.52, 0], [0.34, 1.06, 0.14], 0.075, 0.06, { tint: JERKIN });
  hand(k, [0.34, 1.0, 0.16], 0.05, SKIN);
  limb(k, "cloth", [-0.27, 1.52, 0], [-0.3, 1.12, 0.16], 0.075, 0.06, { tint: JERKIN });
  hand(k, [-0.3, 1.06, 0.19], 0.05, SKIN);
  // sword at the left hip: scabbard, guard, grip, pommel
  limb(k, "leather", [-0.28, 1.02, 0.1], [-0.38, 0.42, 0.3], 0.035, 0.028, { tint: "#3a2c1c" });
  k.box("steel", 0.14, 0.03, 0.04, { x: -0.26, y: 1.06, z: 0.07, rz: 0.3 });
  limb(k, "leather", [-0.25, 1.08, 0.06], [-0.21, 1.2, 0.02], 0.022, 0.02, { tint: "#241a10" });
  k.sphere("steel", 0.03, 6, 5, { x: -0.2, y: 1.23, z: 0.01 });
  // head: shaggy dark hair, short beard
  k.sphere("skin", 0.135, 12, 10, { y: 1.78, z: 0.02, tint: SKIN });
  k.cone("skin", 0.028, 0.08, 5, { y: 1.77, z: 0.15, rx: Math.PI / 2, tint: SKIN });
  k.cone("hair", 0.075, 0.14, 7, { y: 1.66, z: 0.1, rx: Math.PI, tint: HAIR, shade: 0.9 });
  k.sphere("hair", 0.145, 10, 8, { y: 1.81, z: -0.03, s: [1.08, 0.95, 1.05], tint: HAIR });
  k.cone("hair", 0.115, 0.4, 8, { y: 1.6, z: -0.11, rx: Math.PI, tint: HAIR, shade: 0.88 });
  for (const s of [-1, 1] as const) {
    limb(k, "hair", [s * 0.12, 1.8, 0.02], [s * 0.15, 1.55, 0.04], 0.04, 0.025, { tint: HAIR, shade: 0.85 }, 5);
  }
}

// ── Thorin Oakenshield ──────────────────────────────────────────────────────

function buildThorin(k: Kit) {
  k.aoHeight = 0.5;
  k.aoDepth = 0.3;
  const COAT = "#3a4a66";
  const FUR = "#3a2c1e";
  const HAIR = "#241a12";
  const SKIN = "#e2b088";
  // heavy boots, short thick legs — dwarven proportions carry the figure
  for (const s of [-1, 1] as const) {
    k.box("leather", 0.16, 0.11, 0.3, { x: s * 0.15, y: 0.06, z: 0.04, tint: "#4a3826", shade: 0.85 });
    limb(k, "leather", [s * 0.15, 0.1, 0], [s * 0.14, 0.38, 0], 0.075, 0.09, { tint: "#4a3826" });
    limb(k, "cloth", [s * 0.14, 0.38, 0], [s * 0.13, 0.62, 0], 0.085, 0.1, { tint: "#2e2a30" });
  }
  // the long coat, skirt split over the legs, studded belt
  k.cyl("cloth", 0.28, 0.34, 0.45, 12, { y: 0.62, tint: COAT, shade: 0.94 });
  k.cyl("cloth", 0.29, 0.31, 0.42, 12, { y: 1.0, tint: COAT });
  k.torus("leather", 0.3, 0.035, 5, 14, Math.PI * 2, { y: 0.84, rx: Math.PI / 2, tint: "#2c2014" });
  k.box("steel", 0.09, 0.07, 0.02, { y: 0.84, z: 0.3, flat: true });
  // mail glint at the collar, chest plate
  k.cyl("steel", 0.24, 0.27, 0.14, 10, { y: 1.24, shade: 0.9 });
  k.box("steel", 0.34, 0.22, 0.06, { y: 1.1, z: 0.24, shade: 1.05 });
  // the great fur mantle — two courses of it, dwarf-king broad
  k.torus("hair", 0.31, 0.105, 7, 14, Math.PI * 2, { y: 1.34, rx: Math.PI / 2, tint: FUR });
  k.torus("hair", 0.24, 0.085, 7, 12, Math.PI * 2, { y: 1.44, rx: Math.PI / 2, tint: FUR, shade: 0.88 });
  // arms: coat sleeves, leather bracers, fists
  limb(k, "cloth", [0.32, 1.36, 0], [0.4, 0.98, 0.1], 0.085, 0.07, { tint: COAT });
  k.cyl("leather", 0.075, 0.08, 0.16, 8, { x: 0.4, y: 0.92, z: 0.12, tint: "#4a3826" });
  hand(k, [0.41, 0.8, 0.16], 0.052, SKIN);
  limb(k, "cloth", [-0.32, 1.36, 0], [-0.42, 1.0, 0.06], 0.085, 0.07, { tint: COAT });
  k.cyl("leather", 0.075, 0.08, 0.16, 8, { x: -0.42, y: 0.94, z: 0.08, tint: "#4a3826" });
  hand(k, [-0.43, 0.82, 0.12], 0.052, SKIN);
  // Orcrist in the right fist, point up and outward
  limb(k, "leather", [0.41, 0.76, 0.17], [0.43, 0.92, 0.2], 0.02, 0.018, { tint: "#241a10" });
  k.box("steel", 0.12, 0.035, 0.04, { x: 0.43, y: 0.94, z: 0.21, rz: 0.15 });
  limb(k, "steel", [0.43, 0.95, 0.21], [0.52, 1.72, 0.34], 0.032, 0.008, {}, 4);
  // the oaken shield on the left forearm — a section of trunk, branch stubs
  limb(k, "wood", [-0.5, 0.82, 0.02], [-0.42, 1.14, 0.14], 0.14, 0.15, { tint: "#7a5a34", shade: 0.9 }, 9);
  spike(k, "wood", [-0.5, 1.05, 0.1], [-1, 0.3, 0.4], 0.03, 0.14, { tint: "#6a4c2c" });
  spike(k, "wood", [-0.48, 0.9, 0.12], [-0.8, -0.3, 0.6], 0.025, 0.11, { tint: "#6a4c2c" });
  // the head sits low between the shoulders
  k.sphere("skin", 0.135, 12, 10, { y: 1.52, z: 0.03, tint: SKIN });
  k.cone("skin", 0.032, 0.09, 5, { y: 1.51, z: 0.16, rx: Math.PI / 2, tint: SKIN });
  for (const s of [-1, 1] as const) {
    k.box("hair", 0.05, 0.018, 0.07, { x: s * 0.055, y: 1.57, z: 0.12, tint: HAIR, flat: true });
  }
  // the beard, forked; the mane streaked with a paler shade at the temples
  k.cone("hair", 0.11, 0.3, 8, { y: 1.36, z: 0.1, rx: Math.PI, tint: HAIR });
  for (const s of [-1, 1] as const) {
    spike(k, "hair", [s * 0.045, 1.28, 0.13], [s * 0.15, -1, 0.2], 0.028, 0.14, { tint: HAIR, shade: 0.9 });
  }
  k.sphere("hair", 0.15, 10, 8, { y: 1.55, z: -0.02, s: [1.08, 0.95, 1.05], tint: HAIR });
  k.cone("hair", 0.13, 0.5, 8, { y: 1.3, z: -0.12, rx: Math.PI, tint: HAIR, shade: 0.9 });
  for (const s of [-1, 1] as const) {
    limb(k, "hair", [s * 0.12, 1.54, 0.04], [s * 0.17, 1.16, 0.06], 0.045, 0.028, { tint: "#4a4038", shade: 1.1 }, 5);
    // silver clasps binding the front strands
    k.cyl("steel", 0.03, 0.03, 0.035, 6, { x: s * 0.16, y: 1.24, z: 0.06, flat: true });
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
  const m = /([a-z]+)\.glb$/i.exec(url);
  const name = m?.[1].toLowerCase();
  return name && BUILDERS[name] ? name : null;
}
