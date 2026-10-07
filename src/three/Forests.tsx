"use client";

import { use, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MAP_W, MAP_H, SEA_LEVEL } from "@/data/content";
import { useGame } from "@/state/store";
import { morph, realism } from "@/three/Terrain";
import { WOODS, type TreeKind } from "@/three/ways";
import {
  loadTerrainData, sampleFeature, sampleHeight, sampleUp, BCELL, BW, TREE_KEEP_OUT, type TerrainData,
} from "@/three/terrainData";

/**
 * The woods of Middle-earth as real trees.
 *
 * Every tree is generated once from the baked forest mask (plus a sparse
 * scatter over the open temperate country), binned spatially, and streamed
 * into instanced meshes around the camera: a near ring of full trees that cast
 * shadows and a thinned far ring of cheap silhouettes. Beyond that the
 * terrain's own canopy colour carries the forest to the horizon.
 *
 * Draw cost: two shapes × two rings = four draw calls, however many trees.
 */

const RANGE = {
  high: { near: 210, far: 560, farKeep: 0.55 },
  low: { near: 120, far: 330, farKeep: 0.35 },
};
const BIN = 128;
const NBX = Math.ceil(MAP_W / BIN);
const NBZ = Math.ceil(MAP_H / BIN);
const REBUILD_MOVE = 14; // world units the camera must travel before a re-stream

type Shape = 0 | 1; // 0 conifer, 1 broadleaf

const KIND_STYLE: Record<TreeKind, { shape: Shape | "mix"; tint: [number, number, number]; scale: [number, number] }> = {
  broadleaf: { shape: 1, tint: [1, 1, 1], scale: [0.9, 1.35] },
  conifer: { shape: 0, tint: [0.78, 0.9, 0.82], scale: [0.95, 1.45] },
  mirk: { shape: "mix", tint: [0.55, 0.66, 0.56], scale: [1.15, 1.7] },
  mallorn: { shape: 1, tint: [1.85, 1.45, 0.55], scale: [1.6, 2.1] },
  ent: { shape: 1, tint: [0.72, 0.84, 0.62], scale: [1.2, 1.75] },
};

// ── geometry ────────────────────────────────────────────────────────────────

let dapple = 1;
function paint(g: THREE.BufferGeometry, hex: string, y0: number, y1: number, dark = 0.55) {
  const g2 = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex); // sRGB in, linear out — vertex colours are linear
  const pos = g2.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    // self-shadowing: the underside of a crown is darker than its sunlit top
    const t = THREE.MathUtils.clamp((pos.getY(i) - y0) / (y1 - y0), 0, 1);
    // and a per-face dapple, so a crown reads as leaf masses, not one surface
    if (i % 3 === 0) dapple = 0.82 + (((i * 2654435761) >>> 0) % 1000) / 1000 * 0.3;
    const k = (dark + (1 - dark) * t) * dapple;
    col[i * 3] = c.r * k;
    col[i * 3 + 1] = c.g * k;
    col[i * 3 + 2] = c.b * k;
  }
  g2.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g2;
}

/** Low-poly lobe with normals pointing out from its centre (smooth, 20 tris). */
function lobe(r: number, x: number, y: number, z: number, sy = 0.85) {
  const g = new THREE.IcosahedronGeometry(r, 0);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
  }
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  return g;
}

const strip = (g: THREE.BufferGeometry) => {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== "position" && k !== "normal" && k !== "color") out.deleteAttribute(k);
  return out;
};

const BARK = "#4a3a2a";
const NEEDLE = "#2c4628";
const LEAF = "#47632a";

function coniferGeo(near: boolean) {
  const parts: THREE.BufferGeometry[] = [];
  if (near) {
    parts.push(paint(new THREE.CylinderGeometry(0.16, 0.3, 3, 5, 1, true).translate(0, 1.5, 0), BARK, 0, 3, 0.7));
    for (let i = 0; i < 3; i++) {
      const r = 2.5 - i * 0.62;
      const h = 3.7 - i * 0.3;
      const y = 2.4 + i * 2.05;
      parts.push(paint(new THREE.ConeGeometry(r, h, 7, 1, true).translate(0, y + h / 2, 0), NEEDLE, y, y + h, 0.5));
    }
  } else {
    parts.push(paint(new THREE.ConeGeometry(2.4, 8.6, 5, 1, true).translate(0, 1.6 + 4.3, 0), NEEDLE, 1.6, 10, 0.55));
  }
  return mergeGeometries(parts.map(strip), false)!;
}

function broadleafGeo(near: boolean) {
  const parts: THREE.BufferGeometry[] = [];
  if (near) {
    parts.push(paint(new THREE.CylinderGeometry(0.22, 0.42, 4.2, 5, 1, true).translate(0, 2.1, 0), BARK, 0, 4.2, 0.7));
    parts.push(paint(lobe(2.6, 0, 6.2, 0), LEAF, 3.4, 8.6));
    parts.push(paint(lobe(2.0, 1.5, 5.0, 0.8), LEAF, 3.4, 8.6));
    parts.push(paint(lobe(1.9, -1.3, 5.3, -0.9), LEAF, 3.4, 8.6));
    parts.push(paint(lobe(1.6, -0.4, 7.4, 1.1), LEAF, 3.4, 8.6));
  } else {
    parts.push(paint(lobe(3.1, 0, 5.6, 0, 0.9), LEAF, 3.0, 8.4));
  }
  return mergeGeometries(parts.map(strip), false)!;
}

// ── placement ───────────────────────────────────────────────────────────────

interface Trees {
  n: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  s: Float32Array;
  rot: Float32Array;
  shape: Uint8Array;
  keep: Float32Array; // per-tree random, for thinning the far ring
  tall: Float32Array; // height:width stretch, so no two crowns share a silhouette
  col: Float32Array; // rgb tint
  binStart: Uint32Array; // NBX*NBZ+1 offsets into `order`
  order: Uint32Array;
}

function kindAt(x: number, z: number): TreeKind {
  // the wood whose ellipse this tree sits deepest inside
  let best: TreeKind = "broadleaf";
  let bestE = Infinity;
  for (const w of WOODS) {
    const du = (x - w.u * MAP_W) / (w.ru * MAP_W);
    const dv = (z - w.v * MAP_H) / (w.rv * MAP_H);
    const e = du * du + dv * dv;
    if (e < bestE) {
      bestE = e;
      best = w.kind;
    }
  }
  return bestE < 2.2 ? best : "broadleaf";
}

function plantTrees(d: TerrainData): Trees {
  let seed = 90210;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const SP = 5.4; // jittered-grid spacing inside a full-density wood
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  const ss: number[] = [];
  const rs: number[] = [];
  const sh: number[] = [];
  const kp: number[] = [];
  const tl: number[] = [];
  const cs: number[] = [];
  for (let gz = 0; gz * SP < MAP_H; gz++) {
    for (let gx = 0; gx * SP < MAP_W; gx++) {
      const x = (gx + 0.15 + rand() * 0.7) * SP;
      const z = (gz + 0.15 + rand() * 0.7) * SP;
      const r = rand();
      const f = sampleFeature(d, x, z, 0);
      // a sparse scatter of lone trees and copses over the open country
      let p = f;
      if (f < 0.05) {
        const wet = sampleFeature(d, x, z, 3);
        p = 0.004 + wet * 0.03;
      }
      if (r >= p) continue;
      const h = sampleHeight(d, x, z);
      if (h < SEA_LEVEL + 1.2 || h > 64) continue;
      if (sampleUp(d, x, z) < 0.8) continue;
      if (sampleFeature(d, x, z, 1) > 0.15 || sampleFeature(d, x, z, 2) > 0.1) continue;
      let blocked = false;
      for (const k of TREE_KEEP_OUT) {
        if ((x - k.x) ** 2 + (z - k.z) ** 2 < k.r * k.r) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      // nothing grows on the ash of Mordor
      const bi = (Math.round(z / BCELL) * BW + Math.round(x / BCELL)) * 4 + 3;
      if (d.biome[bi] > 60) continue;

      const kind = f >= 0.05 ? kindAt(x, z) : "broadleaf";
      const st = KIND_STYLE[kind];
      const shape: Shape = st.shape === "mix" ? (rand() < 0.3 ? 0 : 1) : st.shape;
      const jitter = 0.86 + rand() * 0.28;
      const warm = rand() * 0.12;
      xs.push(x);
      ys.push(h);
      zs.push(z);
      ss.push(THREE.MathUtils.lerp(st.scale[0], st.scale[1], rand()) * (f < 0.05 ? 1.1 : 1));
      rs.push(rand() * Math.PI * 2);
      sh.push(shape);
      kp.push(rand());
      tl.push(0.85 + rand() * 0.35);
      cs.push(st.tint[0] * jitter * (1 + warm), st.tint[1] * jitter, st.tint[2] * jitter * (1 - warm));
    }
  }
  const n = xs.length;
  // counting sort into spatial bins
  const binOf = (i: number) =>
    Math.min(NBZ - 1, Math.floor(zs[i] / BIN)) * NBX + Math.min(NBX - 1, Math.floor(xs[i] / BIN));
  const binStart = new Uint32Array(NBX * NBZ + 1);
  for (let i = 0; i < n; i++) binStart[binOf(i) + 1]++;
  for (let b = 0; b < NBX * NBZ; b++) binStart[b + 1] += binStart[b];
  const fill = binStart.slice(0, NBX * NBZ);
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[fill[binOf(i)]++] = i;
  return {
    n,
    x: Float32Array.from(xs),
    y: Float32Array.from(ys),
    z: Float32Array.from(zs),
    s: Float32Array.from(ss),
    rot: Float32Array.from(rs),
    shape: Uint8Array.from(sh),
    keep: Float32Array.from(kp),
    tall: Float32Array.from(tl),
    col: Float32Array.from(cs),
    binStart,
    order,
  };
}

// ── material ────────────────────────────────────────────────────────────────

const sway = { uTime: { value: 0 } };

function treeMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  m.envMapIntensity = 0.7;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sway.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         #ifdef USE_INSTANCING
           // crowns stir in the wind; trunks stay put
           vec3 ip = instanceMatrix[3].xyz;
           float bend = max(position.y - 2.5, 0.0) * 0.022;
           transformed.x += sin(uTime * 1.25 + ip.x * 0.045 + ip.z * 0.031) * bend;
           transformed.z += cos(uTime * 1.05 + ip.z * 0.05) * bend * 0.6;
         #endif`,
      );
  };
  m.customProgramCacheKey = () => "tree-sway";
  return m;
}

// ── the component ───────────────────────────────────────────────────────────

function makeLayer(geo: THREE.BufferGeometry, mat: THREE.Material, max: number, shadows: boolean) {
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.count = 0;
  m.frustumCulled = false;
  m.castShadow = shadows;
  m.receiveShadow = true;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  return m;
}

const MAX_NEAR = 9000;
const MAX_FAR = 16000;

export function Forests() {
  const data = use(loadTerrainData());
  const quality = useGame((s) => s.quality);
  const trees = useMemo(() => plantTrees(data), [data]);

  const layers = useMemo(() => {
    const mat = treeMaterial();
    return {
      mat,
      // [shape][ring]
      meshes: [
        [makeLayer(coniferGeo(true), mat, MAX_NEAR, true), makeLayer(coniferGeo(false), mat, MAX_FAR, false)],
        [makeLayer(broadleafGeo(true), mat, MAX_NEAR, true), makeLayer(broadleafGeo(false), mat, MAX_FAR, false)],
      ],
    };
  }, []);
  useEffect(
    () => () => {
      layers.mat.dispose();
      for (const row of layers.meshes) for (const m of row) {
        m.geometry.dispose();
        m.dispose();
      }
    },
    [layers],
  );

  const group = useRef<THREE.Group>(null);
  const last = useRef({ x: 1e9, z: 1e9, grow: -1, quality: "" });

  useFrame(({ camera }, dt) => {
    sway.uTime.value += Math.min(dt, 0.05);
    const g = group.current;
    if (!g) return;
    // trees grow out of the map as it comes alive, and fold away again
    const grow = Math.min(morph.value, THREE.MathUtils.smoothstep(realism.value, 0.05, 0.6));
    g.visible = grow > 0.01;
    if (!g.visible) return;

    const L = last.current;
    const moved = Math.hypot(camera.position.x - L.x, camera.position.z - L.z);
    if (moved < REBUILD_MOVE && Math.abs(grow - L.grow) < 0.02 && L.quality === quality) return;
    L.x = camera.position.x;
    L.z = camera.position.z;
    L.grow = grow;
    L.quality = quality;

    const R = RANGE[quality];
    const cx = camera.position.x;
    const cz = camera.position.z;
    const counts = [
      [0, 0],
      [0, 0],
    ];
    const bx0 = Math.max(0, Math.floor((cx - R.far) / BIN));
    const bx1 = Math.min(NBX - 1, Math.floor((cx + R.far) / BIN));
    const bz0 = Math.max(0, Math.floor((cz - R.far) / BIN));
    const bz1 = Math.min(NBZ - 1, Math.floor((cz + R.far) / BIN));
    const near2 = R.near * R.near;
    const far2 = R.far * R.far;
    const t = trees;
    for (let bz = bz0; bz <= bz1; bz++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const b = bz * NBX + bx;
        for (let k = t.binStart[b]; k < t.binStart[b + 1]; k++) {
          const i = t.order[k];
          const dx = t.x[i] - cx;
          const dz = t.z[i] - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 > far2) continue;
          const ring = d2 < near2 ? 0 : 1;
          if (ring === 1) {
            // thin the far ring progressively with distance — from none at
            // the ring's edge, so half the trees don't vanish as they cross it
            const f = (Math.sqrt(d2) - R.near) / (R.far - R.near);
            const keep = 1 - (1 - R.farKeep) * Math.min(1, f * 4);
            if (t.keep[i] > keep * (1 - f * 0.6)) continue;
          }
          const shape = t.shape[i];
          const mesh = layers.meshes[shape][ring];
          const c = counts[shape][ring];
          if (c >= (ring === 0 ? MAX_NEAR : MAX_FAR)) continue;
          counts[shape][ring] = c + 1;
          // rotation about Y + uniform scale, written straight into the matrix
          const s = t.s[i] * grow * (ring === 1 ? 1.08 : 1);
          const co = Math.cos(t.rot[i]) * s;
          const si = Math.sin(t.rot[i]) * s;
          const a = mesh.instanceMatrix.array as Float32Array;
          const o = c * 16;
          a[o] = co; a[o + 1] = 0; a[o + 2] = -si; a[o + 3] = 0;
          a[o + 4] = 0; a[o + 5] = s * t.tall[i]; a[o + 6] = 0; a[o + 7] = 0;
          a[o + 8] = si; a[o + 9] = 0; a[o + 10] = co; a[o + 11] = 0;
          a[o + 12] = t.x[i]; a[o + 13] = t.y[i] * morph.value - 0.4; a[o + 14] = t.z[i]; a[o + 15] = 1;
          const ca = mesh.instanceColor!.array as Float32Array;
          ca[c * 3] = t.col[i * 3];
          ca[c * 3 + 1] = t.col[i * 3 + 1];
          ca[c * 3 + 2] = t.col[i * 3 + 2];
        }
      }
    }
    for (let sh = 0; sh < 2; sh++) {
      for (let ring = 0; ring < 2; ring++) {
        const m = layers.meshes[sh][ring];
        const n = counts[sh][ring];
        m.count = n;
        // upload only the live instances, not the whole 9–16k buffer (a range
        // of 0 would mean "to the end", so an empty layer uploads nothing)
        if (n > 0) {
          m.instanceMatrix.addUpdateRange(0, n * 16);
          m.instanceMatrix.needsUpdate = true;
          m.instanceColor!.addUpdateRange(0, n * 3);
          m.instanceColor!.needsUpdate = true;
        }
        m.castShadow = ring === 0 && quality === "high";
      }
    }
  });

  return (
    <group ref={group}>
      {layers.meshes.flat().map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}
