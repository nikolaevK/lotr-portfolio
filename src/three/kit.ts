/**
 * A tiny architectural kit.
 *
 * Landmarks are authored as a flat list of transformed primitives, then merged
 * into ONE mesh per material. That is what buys the extra detail: Minas Tirith
 * went from ~60 draw calls to 5 while gaining several hundred stones.
 *
 * Two things happen at merge time that make procedural buildings read as built
 * rather than assembled:
 *   • UVs are re-projected in landmark space by dominant vertex normal, so
 *     texel density is uniform across every wall regardless of a part's size.
 *   • Vertex colours carry a per-part tint, a deterministic shade jitter, and
 *     contact darkening near the ground — the cheapest ambient occlusion there
 *     is, and the difference between "boxes" and "masonry".
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface TF {
  x?: number;
  y?: number;
  z?: number;
  /**
   * YXZ order: tilt the part in place (rx/rz), then yaw it about world up (ry).
   * That is the order buildings want — "lean this roof, then turn the house" —
   * and it keeps `ry` meaning compass heading no matter what else is set.
   */
  rx?: number;
  ry?: number;
  rz?: number;
  s?: number | [number, number, number];
  /** multiplies the material colour for this part */
  tint?: string | THREE.Color;
  /** extra brightness multiplier, 1 = untouched */
  shade?: number;
  /** opt out of ground contact darkening (things that float, glow, or hang) */
  flat?: boolean;
}

interface Part {
  geo: THREE.BufferGeometry;
  mat: string;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** How many world units one texture tile covers, per material key. */
export type UVScales = Record<string, number>;

function ensureIndexed(g: THREE.BufferGeometry) {
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return g;
}

/** Keep exactly the attributes mergeGeometries needs, in every part. */
function normalizeAttributes(g: THREE.BufferGeometry) {
  for (const name of Object.keys(g.attributes)) {
    if (name !== "position" && name !== "normal" && name !== "color") g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
}

/** Planar projection per dominant vertex normal — uniform texel density. */
function projectUV(geo: THREE.BufferGeometry, scale: number) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else if (nx >= nz) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

export class Kit {
  private parts: Part[] = [];
  private seq = 0;
  /** height over which ground contact darkening fades out */
  aoHeight = 3.6;
  aoDepth = 0.42;

  add(mat: string, geo: THREE.BufferGeometry, tf: TF = {}) {
    const sx = typeof tf.s === "number" ? tf.s : tf.s ? tf.s[0] : 1;
    const sy = typeof tf.s === "number" ? tf.s : tf.s ? tf.s[1] : 1;
    const sz = typeof tf.s === "number" ? tf.s : tf.s ? tf.s[2] : 1;
    _e.set(tf.rx ?? 0, tf.ry ?? 0, tf.rz ?? 0, "YXZ");
    _q.setFromEuler(_e);
    _s.set(sx, sy, sz);
    _m.compose(new THREE.Vector3(tf.x ?? 0, tf.y ?? 0, tf.z ?? 0), _q, _s);
    geo.applyMatrix4(_m);
    normalizeAttributes(geo);
    ensureIndexed(geo);

    // per-part colour: tint × deterministic jitter × ground contact darkening
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    if (tf.tint) _c.set(tf.tint as string);
    else _c.setRGB(1, 1, 1);
    const jitter = 1 + (((this.seq++ * 2654435761) % 1000) / 1000 - 0.5) * 0.09;
    const shade = (tf.shade ?? 1) * jitter;
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    for (let i = 0; i < n; i++) {
      let k = shade;
      if (!tf.flat) {
        const y = pos.getY(i);
        const t = THREE.MathUtils.clamp(y / this.aoHeight, 0, 1);
        // up-facing surfaces still see the sky, so they keep most of their
        // light — without this, every paved yard and pond turns into a hole
        const sky = Math.max(0, nor.getY(i));
        k *= 1 - this.aoDepth * (1 - t * t) * (1 - sky * 0.78);
      }
      col[i * 3] = _c.r * k;
      col[i * 3 + 1] = _c.g * k;
      col[i * 3 + 2] = _c.b * k;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));

    this.parts.push({ geo, mat });
    return this;
  }

  // ── primitives ────────────────────────────────────────────────────────────
  box(mat: string, w: number, h: number, d: number, tf?: TF) {
    return this.add(mat, new THREE.BoxGeometry(w, h, d), tf);
  }
  cyl(mat: string, rt: number, rb: number, h: number, seg = 12, tf?: TF, open = false) {
    return this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), tf);
  }
  cone(mat: string, r: number, h: number, seg = 12, tf?: TF) {
    return this.add(mat, new THREE.ConeGeometry(r, h, seg), tf);
  }
  sphere(mat: string, r: number, w = 14, h = 10, tf?: TF, phiLen = Math.PI * 2, thetaStart = 0, thetaLen = Math.PI) {
    return this.add(mat, new THREE.SphereGeometry(r, w, h, 0, phiLen, thetaStart, thetaLen), tf);
  }
  torus(mat: string, r: number, tube: number, radial = 8, tubular = 20, arc = Math.PI * 2, tf?: TF) {
    return this.add(mat, new THREE.TorusGeometry(r, tube, radial, tubular, arc), tf);
  }
  plane(mat: string, w: number, h: number, tf?: TF) {
    return this.add(mat, new THREE.PlaneGeometry(w, h), tf);
  }
  /** Triangular prism — gable ends, roof slopes, buttress spurs. */
  wedge(mat: string, w: number, h: number, d: number, tf?: TF) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, -h / 2);
    shape.lineTo(w / 2, -h / 2);
    shape.lineTo(0, h / 2);
    shape.closePath();
    return this.add(mat, new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2), tf);
  }
  /** A wall panel pierced by a round-headed opening. */
  archWall(mat: string, w: number, h: number, d: number, openW: number, openH: number, sill = 0, tf?: TF) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, -h / 2);
    shape.lineTo(w / 2, -h / 2);
    shape.lineTo(w / 2, h / 2);
    shape.lineTo(-w / 2, h / 2);
    shape.closePath();
    const hole = new THREE.Path();
    const r = openW / 2;
    const y0 = -h / 2 + sill;
    const y1 = y0 + Math.max(openH - r, r * 0.05);
    hole.moveTo(-r, y0);
    hole.lineTo(-r, y1);
    hole.absarc(0, y1, r, Math.PI, 0, true);
    hole.lineTo(r, y0);
    hole.closePath();
    shape.holes.push(hole);
    return this.add(mat, new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2), tf);
  }
  /** A free-standing round-headed arch (gateway, bridge span). */
  archBand(mat: string, r: number, thickness: number, d: number, tf?: TF) {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, r + thickness, Math.PI, 0, true);
    shape.lineTo(r, 0);
    shape.absarc(0, 0, r, 0, Math.PI, false);
    shape.closePath();
    return this.add(mat, new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2), tf);
  }

  // ── architectural runs ────────────────────────────────────────────────────
  /** Merlons round a circle — the tooth line that says "fortress" at a glance. */
  merlonRing(
    mat: string,
    o: {
      r: number; y: number; count: number; cx?: number; cz?: number;
      w?: number; h?: number; d?: number; gapAt?: number; gapArc?: number; tint?: string; shade?: number;
    },
  ) {
    const w = o.w ?? 1.1;
    const h = o.h ?? 1.3;
    const d = o.d ?? 0.8;
    for (let i = 0; i < o.count; i++) {
      const a = (i / o.count) * Math.PI * 2;
      if (o.gapAt !== undefined && Math.abs(Math.atan2(Math.sin(a - o.gapAt), Math.cos(a - o.gapAt))) < (o.gapArc ?? 0.2)) continue;
      this.box(mat, d, h, w, {
        x: (o.cx ?? 0) + Math.cos(a) * o.r,
        y: o.y + h / 2,
        z: (o.cz ?? 0) + Math.sin(a) * o.r,
        ry: -a,
        tint: o.tint,
        shade: o.shade,
      });
    }
    return this;
  }
  /** Merlons along a straight run. */
  merlonLine(
    mat: string,
    o: { from: [number, number]; to: [number, number]; y: number; count: number; w?: number; h?: number; d?: number; tint?: string },
  ) {
    const w = o.w ?? 1.0;
    const h = o.h ?? 1.2;
    const d = o.d ?? 0.7;
    const ang = Math.atan2(o.to[1] - o.from[1], o.to[0] - o.from[0]);
    for (let i = 0; i < o.count; i++) {
      const t = o.count === 1 ? 0.5 : i / (o.count - 1);
      this.box(mat, w, h, d, {
        x: THREE.MathUtils.lerp(o.from[0], o.to[0], t),
        y: o.y + h / 2,
        z: THREE.MathUtils.lerp(o.from[1], o.to[1], t),
        ry: -ang,
        tint: o.tint,
      });
    }
    return this;
  }
  /** A run of columns with base and capital. */
  colonnade(
    mat: string,
    o: { from: [number, number]; to: [number, number]; count: number; y?: number; h: number; r: number; tint?: string },
  ) {
    for (let i = 0; i < o.count; i++) {
      const t = o.count === 1 ? 0.5 : i / (o.count - 1);
      const x = THREE.MathUtils.lerp(o.from[0], o.to[0], t);
      const z = THREE.MathUtils.lerp(o.from[1], o.to[1], t);
      const y = o.y ?? 0;
      this.cyl(mat, o.r * 0.86, o.r, o.h, 10, { x, y: y + o.h / 2, z, tint: o.tint });
      this.box(mat, o.r * 2.9, o.r * 0.5, o.r * 2.9, { x, y: y + o.r * 0.25, z, tint: o.tint });
      this.box(mat, o.r * 2.6, o.r * 0.55, o.r * 2.6, { x, y: y + o.h - o.r * 0.25, z, tint: o.tint });
    }
    return this;
  }
  /** A flight of steps climbing outward along heading `a` from (x, z). */
  stairs(
    mat: string,
    o: { steps: number; w: number; rise: number; run: number; x?: number; z?: number; a?: number; tint?: string },
  ) {
    const a = o.a ?? 0;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let i = 0; i < o.steps; i++) {
      // treads widen as they descend, the way a formal stair does
      const d = i * o.run;
      this.box(mat, o.run, o.rise, o.w + (o.steps - i) * o.run * 0.35, {
        x: (o.x ?? 0) + ca * d,
        y: (i + 0.5) * o.rise,
        z: (o.z ?? 0) + sa * d,
        ry: -a,
        tint: o.tint,
      });
    }
    return this;
  }

  /** Merge everything down to one mesh per material. */
  finish(mats: Record<string, THREE.Material>, uvScales: UVScales, defaultScale = 4) {
    const group = new THREE.Group();
    const byMat = new Map<string, THREE.BufferGeometry[]>();
    for (const p of this.parts) {
      const list = byMat.get(p.mat);
      if (list) list.push(p.geo);
      else byMat.set(p.mat, [p.geo]);
    }
    for (const [key, geos] of byMat) {
      const material = mats[key];
      if (!material) {
        if (process.env.NODE_ENV !== "production") console.warn(`kit: unknown material "${key}"`);
        continue;
      }
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue;
      if (geos.length > 1) for (const g of geos) g.dispose();
      projectUV(merged, uvScales[key] ?? defaultScale);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // everything is baked into the geometry; the mesh itself never moves
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    group.matrixAutoUpdate = false;
    this.parts = [];
    return group;
  }
}

/** Dispose every geometry under a group built by the kit. */
export function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry?.dispose();
  });
}
