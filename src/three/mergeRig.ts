/**
 * Draw-call reduction for procedurally rigged creatures.
 *
 * The mounts are authored the readable way — one small mesh per tooth, spike
 * and claw, parented to whatever moves it — which left the dragon alone at
 * ~130 draw calls, doubled again by the shadow pass. These helpers collapse
 * that after the fact without changing a single vertex on screen:
 *
 *   • mergeRigid  — everything that never moves relative to a pivot becomes
 *                   one mesh per material under that pivot.
 *   • skinRigid   — parts hung off skeleton bones (spikes, barbs) are folded
 *                   into a SkinnedMesh weighted 100% to their bone, so a
 *                   dozen bones' worth of spikes cost one draw per material.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const _m = new THREE.Matrix4();

/** Clone `geo` into `space`, keeping exactly position/normal/uv (indexed). */
function bake(geo: THREE.BufferGeometry, matrix: THREE.Matrix4) {
  const g = geo.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.index) {
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  g.applyMatrix4(matrix);
  return g;
}

interface Bucket {
  geos: THREE.BufferGeometry[];
  cast: boolean;
}

function bucket(map: Map<THREE.Material, Bucket>, mat: THREE.Material, geo: THREE.BufferGeometry, cast: boolean) {
  const b = map.get(mat);
  if (b) {
    b.geos.push(geo);
    b.cast ||= cast;
  } else map.set(mat, { geos: [geo], cast });
}

/**
 * Merge every plain mesh under `root` (not crossing bones or `keep` subtrees,
 * which animate on their own) into one mesh per material, parented to `root`.
 */
export function mergeRigid(root: THREE.Object3D, keep: Set<THREE.Object3D> = new Set()) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map<THREE.Material, Bucket>();
  const victims: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (keep.has(c) || (c as THREE.Bone).isBone) continue;
      const m = c as THREE.Mesh;
      if (m.isMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh && !Array.isArray(m.material) && m.children.length === 0) {
        _m.multiplyMatrices(inv, m.matrixWorld);
        bucket(buckets, m.material, bake(m.geometry, _m), m.castShadow);
        victims.push(m);
      } else {
        visit(c);
      }
    }
  };
  visit(root);
  for (const v of victims) v.removeFromParent();
  for (const [mat, b] of buckets) {
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (b.geos.length > 1) for (const g of b.geos) g.dispose();
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = b.cast;
    root.add(mesh);
  }
  return victims.length;
}

/**
 * Fold rigid parts hung off `body`'s bones into SkinnedMeshes sharing its
 * skeleton. Must run in the rest pose (before the first animated frame).
 */
export function skinRigid(body: THREE.SkinnedMesh, parts: { obj: THREE.Object3D; bone: number }[]) {
  body.updateMatrixWorld(true);
  const inv = body.matrixWorld.clone().invert();
  const buckets = new Map<THREE.Material, Bucket>();
  for (const { obj, bone } of parts) {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      _m.multiplyMatrices(inv, m.matrixWorld);
      const g = bake(m.geometry, _m);
      const n = g.attributes.position.count;
      const si = new Uint16Array(n * 4);
      const sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        si[i * 4] = bone;
        sw[i * 4] = 1;
      }
      g.setAttribute("skinIndex", new THREE.BufferAttribute(si, 4));
      g.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
      bucket(buckets, m.material, g, m.castShadow);
    });
    obj.removeFromParent();
  }
  const out: THREE.SkinnedMesh[] = [];
  for (const [mat, b] of buckets) {
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (b.geos.length > 1) for (const g of b.geos) g.dispose();
    if (!geo) continue;
    const sm = new THREE.SkinnedMesh(geo, mat);
    sm.castShadow = b.cast;
    sm.frustumCulled = false;
    body.parent?.add(sm);
    sm.position.copy(body.position);
    sm.quaternion.copy(body.quaternion);
    sm.scale.copy(body.scale);
    sm.updateMatrixWorld(true);
    sm.bind(body.skeleton, body.bindMatrix);
    out.push(sm);
  }
  return out;
}
