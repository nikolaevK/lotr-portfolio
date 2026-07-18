"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { runtime } from "@/game/runtime";
import { input } from "@/input/controls";
import { game } from "@/state/store";
import { morph } from "@/three/Terrain";
import { audio } from "@/audio/engine";
import { createFlightState, stepFlight, DRAGON_TUNING } from "@/three/flight";

// ── palette (from the 2D concept) ────────────────────────────────────────────
const RED = new THREE.Color("#96201d");
const RED_L = new THREE.Color("#b03428");
const RED_D = new THREE.Color("#6e1310");
const TEAL = new THREE.Color("#3d5a52");
const HORN = new THREE.Color("#42625a");
const HORN_D = new THREE.Color("#2c443d");
const CLAW = new THREE.Color("#d8c9a8");

// Spine rest curve, tail tip → head base (model space, +X forward, Y up)
const SPINE: [number, number][] = [
  [-10.2, 0.55], [-9.1, 0.42], [-8.0, 0.32], [-6.9, 0.24], [-5.8, 0.17],
  [-4.7, 0.1], [-3.6, 0.05], [-2.5, 0.0], [-1.4, -0.02], [-0.3, 0.0],
  [0.8, 0.08], [1.5, 0.2], [2.55, 0.62], [3.5, 1.18], [4.3, 1.85], [5.0, 2.6],
];
const HEAD_POS: [number, number] = [5.38, 3.05];
const ROOT_IDX = 11; // chest
const RADII = [0.05, 0.1, 0.15, 0.22, 0.3, 0.38, 0.46, 0.56, 0.72, 0.88, 0.98, 1.02, 0.72, 0.55, 0.46, 0.42];
const RINGS_PER_SEG = 4;
const RADIAL = 20;
const DRAGON_SCALE = 1.6;

// bone index for a spine point index
const boneOf = (j: number) => (j < ROOT_IDX ? ROOT_IDX - j : j === ROOT_IDX ? 0 : j);

/** Dual-scale hide: big plates + fine scales; doubles as roughness variation. */
function makeScaleBump() {
  const S = 512;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#7d7d7d";
  ctx.fillRect(0, 0, S, S);
  // large plates
  const rows = 11;
  const cols = 8;
  for (let r = 0; r < rows; r++) {
    for (let c = -1; c < cols + 1; c++) {
      const x = ((c + (r % 2 ? 0.5 : 0)) / cols) * S;
      const y = (r / rows) * S;
      const rad = (S / cols) * 0.66;
      const g = ctx.createRadialGradient(x, y + rad * 0.3, rad * 0.12, x, y + rad * 0.3, rad);
      g.addColorStop(0, "#9c9c9c");
      g.addColorStop(0.72, "#6a6a6a");
      g.addColorStop(1, "#585858");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y + rad * 0.3, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // fine scales on top
  const frows = 30;
  const fcols = 22;
  ctx.globalAlpha = 0.42;
  for (let r = 0; r < frows; r++) {
    for (let c = -1; c < fcols + 1; c++) {
      const x = ((c + (r % 2 ? 0.5 : 0)) / fcols) * S;
      const y = (r / frows) * S;
      const rad = (S / fcols) * 0.62;
      const g = ctx.createRadialGradient(x, y + rad * 0.3, rad * 0.1, x, y + rad * 0.3, rad);
      g.addColorStop(0, "#909090");
      g.addColorStop(0.8, "#6e6e6e");
      g.addColorStop(1, "#646464");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y + rad * 0.3, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

interface WingRig {
  side: 1 | -1;
  membrane: THREE.BufferGeometry;
  mesh: THREE.Mesh;
  bonesMeshes: THREE.Mesh[]; // arm + finger rods
  claws: THREE.Mesh[]; // wingtip + thumb claw
  rest: {
    S: THREE.Vector3; E: THREE.Vector3; W: THREE.Vector3;
    F: THREE.Vector3[]; H: THREE.Vector3; L: THREE.Vector3;
  };
}

interface Rig {
  group: THREE.Group;
  bones: THREE.Bone[];
  headGroup: THREE.Group;
  jaw: THREE.Group;
  mouth: THREE.Object3D;
  mouthTip: THREE.Object3D;
  wings: WingRig[];
  legs: THREE.Group[];
  nostrilMat: THREE.MeshStandardMaterial;
  mouthGlowMat: THREE.MeshBasicMaterial;
  eyeMat: THREE.MeshStandardMaterial;
}

const OUTLINE = 12; // membrane outline points; +12 mids +1 center = 25 verts

function buildDragon(): Rig {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(DRAGON_SCALE);
  group.add(inner);

  const scaleBump = makeScaleBump();
  const scalesMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.18,
    bumpMap: scaleBump,
    bumpScale: 1.1,
    roughnessMap: scaleBump,
  });
  const redMat = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.55, metalness: 0.14, bumpMap: scaleBump, bumpScale: 0.7 });
  const redDarkMat = new THREE.MeshStandardMaterial({ color: RED_D, roughness: 0.6, metalness: 0.1 });
  const hornMat = new THREE.MeshStandardMaterial({ color: HORN, roughness: 0.32, metalness: 0.3 });
  const hornDarkMat = new THREE.MeshStandardMaterial({ color: HORN_D, roughness: 0.4, metalness: 0.25 });
  const clawMat = new THREE.MeshStandardMaterial({ color: CLAW, roughness: 0.35, metalness: 0.1 });
  const membraneMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#8a2c1f"),
    emissive: new THREE.Color("#38100a"),
    emissiveIntensity: 0.55,
    side: THREE.DoubleSide,
    roughness: 0.82,
    metalness: 0.05,
    transparent: true,
    opacity: 0.96,
  });
  const crestMat = new THREE.MeshStandardMaterial({
    color: HORN_D,
    side: THREE.DoubleSide,
    roughness: 0.7,
    transparent: true,
    opacity: 0.94,
  });
  const nostrilMat = new THREE.MeshStandardMaterial({
    color: "#1a0b04",
    emissive: "#ff6a1e",
    emissiveIntensity: 0.4,
  });
  const mouthGlowMat = new THREE.MeshBasicMaterial({
    color: "#ff8a2e",
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: "#1a0b04",
    emissive: "#ff9d2e",
    emissiveIntensity: 2.4,
  });

  // ── bones ──
  const bones: THREE.Bone[] = [];
  const restPos: THREE.Vector3[] = [];
  const mk = (x: number, y: number, z: number, parent: THREE.Bone | null) => {
    const b = new THREE.Bone();
    const world = new THREE.Vector3(x, y, z);
    restPos.push(world.clone());
    if (parent) {
      const pIdx = bones.indexOf(parent);
      b.position.copy(world).sub(restPos[pIdx]);
      parent.add(b);
    } else {
      b.position.copy(world);
    }
    bones.push(b);
    return b;
  };

  const root = mk(SPINE[ROOT_IDX][0], SPINE[ROOT_IDX][1], 0, null); // b0
  let prev = root;
  for (let j = ROOT_IDX - 1; j >= 0; j--) prev = mk(SPINE[j][0], SPINE[j][1], 0, prev); // b1..b11 tailward
  prev = root;
  for (let j = ROOT_IDX + 1; j < SPINE.length; j++) prev = mk(SPINE[j][0], SPINE[j][1], 0, prev); // b12..b15 neck
  const headBone = mk(HEAD_POS[0], HEAD_POS[1], 0, prev); // b16

  // ── skinned body hull ──
  const ringT: { p: THREE.Vector3; t: THREE.Vector3; r: number; segJ: number; frac: number }[] = [];
  for (let j = 0; j < SPINE.length - 1; j++) {
    const steps = j === SPINE.length - 2 ? RINGS_PER_SEG + 1 : RINGS_PER_SEG;
    for (let k = 0; k < steps; k++) {
      const f = k / RINGS_PER_SEG;
      const p0 = SPINE[j];
      const p1 = SPINE[j + 1];
      const p = new THREE.Vector3(
        THREE.MathUtils.lerp(p0[0], p1[0], f),
        THREE.MathUtils.lerp(p0[1], p1[1], f),
        0,
      );
      const jm = Math.max(0, j - 1);
      const jp = Math.min(SPINE.length - 1, j + 2);
      const t = new THREE.Vector3(SPINE[jp][0] - SPINE[jm][0], SPINE[jp][1] - SPINE[jm][1], 0).normalize();
      const r = THREE.MathUtils.lerp(RADII[j], RADII[j + 1], f);
      ringT.push({ p, t, r, segJ: j, frac: f });
    }
  }

  const nRings = ringT.length;
  const vCount = nRings * (RADIAL + 1);
  const pos = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const sIdx = new Uint16Array(vCount * 4);
  const sWgt = new Float32Array(vCount * 4);
  const up = new THREE.Vector3(0, 1, 0);
  const B = new THREE.Vector3();
  const N = new THREE.Vector3();
  const tmpC = new THREE.Color();

  let vi = 0;
  for (let ri = 0; ri < nRings; ri++) {
    const ring = ringT[ri];
    B.crossVectors(ring.t, up).normalize();
    if (B.lengthSq() < 0.01) B.set(0, 0, 1);
    N.crossVectors(B, ring.t).normalize(); // points model-up (belly at cos θ = -1)
    const bA = boneOf(ring.segJ);
    const bB = boneOf(Math.min(ring.segJ + 1, SPINE.length - 1));
    for (let a = 0; a <= RADIAL; a++) {
      const th = (a / RADIAL) * Math.PI * 2;
      const cy = Math.cos(th);
      const sy = Math.sin(th);
      const belly = THREE.MathUtils.smoothstep(-cy, 0.15, 0.75);
      // organic silhouette wobble + ventral plate ridges
      let rr = ring.r * (1 + 0.022 * Math.sin(ri * 0.7 + a * 1.3));
      rr *= 1 + 0.055 * belly * Math.sin(ri * 1.18);
      const px = ring.p.x + N.x * cy * rr * 1.12 + B.x * sy * rr;
      const py = ring.p.y - rr * 0.12 + N.y * cy * rr * 1.12 + B.y * sy * rr;
      const pz = ring.p.z + N.z * cy * rr * 1.12 + B.z * sy * rr;
      pos[vi * 3] = px;
      pos[vi * 3 + 1] = py;
      pos[vi * 3 + 2] = pz;
      // color: back darker red ridge, flanks red, belly teal
      const backD = THREE.MathUtils.smoothstep(cy, 0.55, 0.95);
      tmpC.copy(RED).lerp(RED_L, 0.35 * (1 - Math.abs(cy)));
      tmpC.lerp(RED_D, backD * 0.6);
      tmpC.lerp(TEAL, belly);
      col[vi * 3] = tmpC.r;
      col[vi * 3 + 1] = tmpC.g;
      col[vi * 3 + 2] = tmpC.b;
      uv[vi * 2] = (a / RADIAL) * 3;
      uv[vi * 2 + 1] = ri * 0.34;
      sIdx[vi * 4] = bA;
      sIdx[vi * 4 + 1] = bB;
      sIdx[vi * 4 + 2] = 0;
      sIdx[vi * 4 + 3] = 0;
      sWgt[vi * 4] = 1 - ring.frac;
      sWgt[vi * 4 + 1] = ring.frac;
      sWgt[vi * 4 + 2] = 0;
      sWgt[vi * 4 + 3] = 0;
      vi++;
    }
  }
  const idx: number[] = [];
  for (let ri = 0; ri < nRings - 1; ri++) {
    for (let a = 0; a < RADIAL; a++) {
      const a0 = ri * (RADIAL + 1) + a;
      const a1 = a0 + 1;
      const b0 = a0 + (RADIAL + 1);
      const b1 = b0 + 1;
      idx.push(a0, a1, b0, a1, b1, b0); // outward winding
    }
  }
  const tube = new THREE.BufferGeometry();
  tube.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  tube.setAttribute("color", new THREE.BufferAttribute(col, 3));
  tube.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  tube.setAttribute("skinIndex", new THREE.BufferAttribute(sIdx, 4));
  tube.setAttribute("skinWeight", new THREE.BufferAttribute(sWgt, 4));
  tube.setIndex(idx);
  tube.computeVertexNormals();

  const body = new THREE.SkinnedMesh(tube, scalesMat);
  body.castShadow = true;
  body.frustumCulled = false;
  body.add(root);
  inner.add(body);
  body.updateMatrixWorld(true);
  body.bind(new THREE.Skeleton(bones), body.matrixWorld.clone());

  // ── tail: twin-lobed spade + barbs ──
  const spadeShape = new THREE.Shape();
  spadeShape.moveTo(0.1, 0);
  spadeShape.lineTo(-0.42, 0.6);
  spadeShape.lineTo(-1.5, 0.32);
  spadeShape.lineTo(-0.95, 0.05);
  spadeShape.lineTo(-1.5, -0.32);
  spadeShape.lineTo(-0.42, -0.6);
  spadeShape.closePath();
  const spade = new THREE.Mesh(
    new THREE.ShapeGeometry(spadeShape),
    new THREE.MeshStandardMaterial({ color: RED, roughness: 0.6, side: THREE.DoubleSide }),
  );
  spade.rotation.x = -Math.PI / 2; // lie flat; shape points away (-X)
  spade.position.set(-0.05, 0, 0);
  spade.castShadow = true;
  bones[ROOT_IDX].add(spade); // b11 = tail tip
  const barbGeo = new THREE.ConeGeometry(0.05, 0.34, 5);
  for (const sb of [-1, 1]) {
    const barb = new THREE.Mesh(barbGeo, hornMat);
    barb.position.set(0.55, 0.05, sb * 0.16);
    barb.rotation.set(sb * 0.9, 0, 1.9);
    bones[ROOT_IDX].add(barb);
  }

  // ── dorsal spikes: curved, hooked, teal-tipped, alternating sizes ──
  const spikeGeo = new THREE.ConeGeometry(1, 1, 6);
  const mkSpike = (parent: THREE.Object3D, h: number, x = 0, y = 0, z = 0, tilt = -0.5) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const main = new THREE.Mesh(spikeGeo, redDarkMat);
    main.scale.set(h * 0.32, h, h * 0.2);
    main.rotation.z = tilt;
    g.add(main);
    const tip = new THREE.Mesh(spikeGeo, hornDarkMat);
    tip.scale.set(h * 0.16, h * 0.52, h * 0.11);
    tip.position.set(Math.sin(tilt) * h * -0.62 - h * 0.14, Math.cos(tilt) * h * 0.62, 0);
    tip.rotation.z = tilt - 0.75;
    g.add(tip);
    parent.add(g);
    return g;
  };
  for (let j = 2; j <= 14; j++) {
    const bIdx = boneOf(j);
    const base = j < 7 ? 0.22 + j * 0.03 : j <= 11 ? 0.62 - (j - 7) * 0.04 : 0.4 - (j - 11) * 0.07;
    const h = base * (j % 2 ? 1 : 0.72); // alternating tall/short
    const r = RADII[j] ?? 0.4;
    mkSpike(bones[bIdx], h, 0, r * 1.02 + h * 0.34, 0);
  }
  // lateral shoulder spikes
  for (const j of [9, 10, 11]) {
    const bIdx = boneOf(j);
    const r = RADII[j];
    for (const sd of [-1, 1]) {
      const sp = new THREE.Mesh(spikeGeo, redDarkMat);
      sp.scale.set(0.1, 0.3, 0.07);
      sp.position.set(0, r * 0.42, sd * r * 0.98);
      sp.rotation.x = -sd * 1.15;
      sp.rotation.z = -0.3;
      bones[bIdx].add(sp);
    }
  }

  // ── head ──
  const headGroup = new THREE.Group();
  const restNeckDir = new THREE.Vector2(HEAD_POS[0] - SPINE[15][0], HEAD_POS[1] - SPINE[15][1]);
  headGroup.rotation.z = -Math.atan2(restNeckDir.y, restNeckDir.x) - 0.06;
  headBone.add(headGroup);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 16), redMat);
  skull.scale.set(1.25, 0.85, 0.92);
  skull.position.set(0.1, 0.05, 0);
  headGroup.add(skull);

  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.52, 1.25, 12), redMat);
  snout.rotation.z = -Math.PI / 2 + 0.06;
  snout.scale.z = 0.8;
  snout.position.set(1.0, -0.05, 0);
  headGroup.add(snout);
  const snoutTip = new THREE.Mesh(new THREE.SphereGeometry(0.245, 12, 10), redMat);
  snoutTip.scale.set(1, 0.85, 0.8);
  snoutTip.position.set(1.6, -0.11, 0);
  headGroup.add(snoutTip);
  // snout ridge
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.09, 0.16), redDarkMat);
  ridge.position.set(0.95, 0.22, 0);
  ridge.rotation.z = 0.1;
  headGroup.add(ridge);

  const jawPivot = new THREE.Group();
  jawPivot.position.set(0.32, -0.28, 0);
  const jaw = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.4, 1.15, 10), redDarkMat);
  jaw.rotation.z = -Math.PI / 2 + 0.02;
  jaw.scale.z = 0.7;
  jaw.position.set(0.62, -0.16, 0);
  jawPivot.add(jaw);
  headGroup.add(jawPivot);

  // fire glow inside the maw
  const mouthGlow = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), mouthGlowMat);
  mouthGlow.position.set(0.85, -0.26, 0);
  headGroup.add(mouthGlow);

  // teeth — upper row on the head, lower row rides the jaw
  const toothGeo = new THREE.ConeGeometry(0.032, 0.13, 5);
  for (let i = 0; i < 7; i++) {
    for (const sd of [-1, 1]) {
      const tooth = new THREE.Mesh(toothGeo, clawMat);
      tooth.position.set(0.38 + i * 0.18, -0.28, sd * (0.24 - i * 0.022));
      tooth.rotation.x = Math.PI;
      tooth.scale.setScalar(1 - i * 0.06);
      headGroup.add(tooth);
    }
  }
  for (let i = 0; i < 5; i++) {
    for (const sd of [-1, 1]) {
      const tooth = new THREE.Mesh(toothGeo, clawMat);
      tooth.position.set(0.42 + i * 0.2, -0.1, sd * (0.19 - i * 0.02));
      tooth.scale.setScalar(0.8 - i * 0.06);
      jawPivot.add(tooth);
    }
  }

  // horns — swept back, two pairs + cheek studs
  const hornCurve = (len: number, lift: number, out: number) =>
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-len * 0.45, lift, out * 0.6),
      new THREE.Vector3(-len, lift * 0.7, out),
    ]);
  for (const sd of [-1, 1]) {
    const main = new THREE.Mesh(new THREE.TubeGeometry(hornCurve(1.55, 0.6, sd * 0.44), 12, 0.135, 8), hornMat);
    main.position.set(-0.15, 0.4, sd * 0.26);
    headGroup.add(main);
    const small = new THREE.Mesh(new THREE.TubeGeometry(hornCurve(0.9, 0.32, sd * 0.32), 10, 0.085, 7), hornMat);
    small.position.set(-0.3, 0.14, sd * 0.42);
    headGroup.add(small);
    // cheek studs
    const stud = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 5), hornDarkMat);
    stud.position.set(0.16, -0.12, sd * 0.52);
    stud.rotation.x = sd * 1.35;
    headGroup.add(stud);
    const stud2 = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.17, 5), hornDarkMat);
    stud2.position.set(0.42, -0.08, sd * 0.44);
    stud2.rotation.x = sd * 1.3;
    headGroup.add(stud2);
    // ear frill
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), hornMat);
    ear.position.set(-0.5, 0.05, sd * 0.5);
    ear.rotation.set(sd * 0.5, 0, 2.1);
    headGroup.add(ear);
    // brow
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.11, 0.15), redDarkMat);
    brow.position.set(0.3, 0.29, sd * 0.4);
    brow.rotation.y = -sd * 0.2;
    brow.rotation.z = 0.12;
    headGroup.add(brow);
    // eye — molten amber with slit pupil
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), eyeMat);
    eye.position.set(0.34, 0.14, sd * 0.43);
    headGroup.add(eye);
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.16, 0.02), new THREE.MeshBasicMaterial({ color: "#12060a" }));
    pupil.position.set(0.35, 0.14, sd * 0.53);
    pupil.rotation.y = sd * 0.25;
    headGroup.add(pupil);
    // nostril — glows when breathing fire
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), nostrilMat);
    nose.position.set(1.52, 0.02, sd * 0.15);
    headGroup.add(nose);
  }

  // crest fan behind the skull — spines + membrane
  {
    const crestRoot = new THREE.Group();
    crestRoot.position.set(-0.52, 0.18, 0);
    headGroup.add(crestRoot);
    const angles = [-0.15, 0.25, 0.65, 1.05, 1.4];
    const lens = [0.75, 1.0, 1.12, 1.0, 0.78];
    const tips: THREE.Vector3[] = [];
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i];
      const dir = new THREE.Vector3(-Math.cos(a), Math.sin(a), 0);
      const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.045, lens[i], 5), hornMat);
      spine.position.copy(dir).multiplyScalar(lens[i] / 2);
      spine.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      crestRoot.add(spine);
      tips.push(dir.clone().multiplyScalar(lens[i]));
    }
    const fan = new THREE.BufferGeometry();
    const fp: number[] = [0, 0, 0];
    for (const t of tips) fp.push(t.x, t.y, t.z);
    const fi: number[] = [];
    for (let i = 0; i < tips.length - 1; i++) fi.push(0, i + 1, i + 2);
    fan.setAttribute("position", new THREE.BufferAttribute(new Float32Array(fp), 3));
    fan.setIndex(fi);
    fan.computeVertexNormals();
    const fanMesh = new THREE.Mesh(fan, crestMat);
    crestRoot.add(fanMesh);
  }

  headGroup.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });

  const mouth = new THREE.Object3D();
  mouth.position.set(1.7, -0.18, 0);
  headGroup.add(mouth);
  const mouthTip = new THREE.Object3D();
  mouthTip.position.set(2.9, -0.34, 0);
  headGroup.add(mouthTip);

  // ── legs (tucked in flight) ──
  const legs: THREE.Group[] = [];
  const legGeoT = new THREE.CapsuleGeometry(0.19, 0.62, 3, 8);
  const legGeoS = new THREE.CapsuleGeometry(0.12, 0.55, 3, 8);
  const clawGeo = new THREE.ConeGeometry(0.05, 0.24, 5);
  const kneeGeo = new THREE.ConeGeometry(0.06, 0.2, 5);
  const mkLeg = (bone: THREE.Bone, x: number, z: number, tuck: number) => {
    const g = new THREE.Group();
    g.position.set(x, -0.55, z);
    const thigh = new THREE.Mesh(legGeoT, redMat);
    thigh.rotation.z = tuck;
    thigh.position.y = -0.2;
    g.add(thigh);
    const knee = new THREE.Mesh(kneeGeo, hornDarkMat);
    knee.position.set(Math.sin(tuck) * 0.55, -0.5, 0);
    knee.rotation.z = tuck + 0.6;
    g.add(knee);
    const shin = new THREE.Mesh(legGeoS, redMat);
    shin.position.set(Math.sin(tuck) * 0.7, -0.62, 0);
    shin.rotation.z = tuck - 0.9;
    g.add(shin);
    for (let c = 0; c < 3; c++) {
      const claw = new THREE.Mesh(clawGeo, clawMat);
      claw.position.set(Math.sin(tuck) * 1.0 - 0.12, -0.98, (c - 1) * 0.11);
      claw.rotation.z = 2.6;
      claw.rotation.x = (c - 1) * 0.22;
      g.add(claw);
    }
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
    bone.add(g);
    legs.push(g);
    return g;
  };
  for (const sd of [-1, 1] as const) {
    mkLeg(bones[0], 0.35, sd * 0.68, 0.85);            // front, tucked
    mkLeg(bones[boneOf(7)], 0.1, sd * 0.62, 0.35);     // hind, trailing
  }

  // ── wings ──
  const wings: WingRig[] = [];
  const rodGeo = new THREE.CylinderGeometry(1, 0.8, 1, 6);
  const wingClawGeo = new THREE.ConeGeometry(0.07, 0.42, 5);
  for (const sd of [-1, 1] as const) {
    const S = new THREE.Vector3(0.95, 0.62, sd * 0.78);
    const E = new THREE.Vector3(1.13, 1.52, sd * 2.4);
    const W = new THREE.Vector3(1.63, 1.86, sd * 4.38);
    const F = [
      W.clone().add(new THREE.Vector3(2.05, -0.06, sd * 2.52)),
      W.clone().add(new THREE.Vector3(0.66, -0.22, sd * 3.48)),
      W.clone().add(new THREE.Vector3(-0.9, -0.46, sd * 3.3)),
      W.clone().add(new THREE.Vector3(-2.1, -0.66, sd * 2.28)),
    ];
    const H = new THREE.Vector3(-3.1, 0.12, sd * 0.6);
    const L = new THREE.Vector3(1.9, 0.42, sd * 0.7);

    // membrane: 12 outline + 12 mids + center = 25 verts, 36 tris
    const mg = new THREE.BufferGeometry();
    const mpos = new Float32Array(25 * 3);
    mg.setAttribute("position", new THREE.BufferAttribute(mpos, 3));
    const mIdx: number[] = [];
    for (let i = 0; i < OUTLINE; i++) {
      const i2 = (i + 1) % OUTLINE;
      mIdx.push(12 + i, i, i2);
      mIdx.push(12 + i, i2, 12 + i2);
      mIdx.push(24, 12 + i, 12 + i2);
    }
    mg.setIndex(mIdx);
    const mesh = new THREE.Mesh(mg, membraneMat);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    inner.add(mesh);

    const bonesMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const rod = new THREE.Mesh(rodGeo, redDarkMat);
      rod.castShadow = true;
      inner.add(rod);
      bonesMeshes.push(rod);
    }
    const claws: THREE.Mesh[] = [];
    for (let i = 0; i < 2; i++) {
      const c = new THREE.Mesh(wingClawGeo, clawMat);
      c.castShadow = true;
      inner.add(c);
      claws.push(c);
    }

    wings.push({ side: sd, membrane: mg, mesh, bonesMeshes, claws, rest: { S, E, W, F, H, L } });
  }

  return {
    group,
    bones,
    headGroup,
    jaw: jawPivot,
    mouth,
    mouthTip,
    wings,
    legs,
    nostrilMat,
    mouthGlowMat,
    eyeMat,
  };
}

// asymmetric flap wave — fast downstroke, slow recovery
const wave = (p: number) => Math.sin(p + 0.45 * Math.sin(p));

const _q = new THREE.Quaternion();
const _qY = new THREE.Quaternion();
const _qP = new THREE.Quaternion();
const _qR = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _axis = new THREE.Vector3();
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const AXIS_X = new THREE.Vector3(1, 0, 0);

function rotAboutX(target: THREE.Vector3, pivot: THREE.Vector3, src: THREE.Vector3, angle: number) {
  target.copy(src).sub(pivot);
  const y = target.y;
  const z = target.z;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  target.y = y * c - z * s;
  target.z = y * s + z * c;
  target.add(pivot);
}

export function Dragon() {
  const rig = useMemo(buildDragon, []);
  const flight = useRef(createFlightState());
  const anim = useRef({
    lastWave: 0,
    flapVel: 0,
    lastFlap: 0,
    firing: 0,
  });

  useEffect(() => {
    return () => {
      rig.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mat = m.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat?.dispose();
        }
      });
    };
  }, [rig]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = game();
    const a = anim.current;
    const fs = flight.current;
    const frozen = s.phase !== "map" || !!s.region || s.contactOpen || morph.value < 0.55;

    // ── shared flight dynamics (rider controls, altitude, bank, regions) ──
    stepFlight(dt, frozen, DRAGON_TUNING, fs);
    const speed01 = fs.speed01;
    const boosting = fs.boosting;

    // ── pose the rig ──
    rig.group.position.copy(runtime.pos);
    _qY.setFromAxisAngle(AXIS_Y, -runtime.heading);
    _qP.setFromAxisAngle(AXIS_Z, runtime.pitch);
    _qR.setFromAxisAngle(AXIS_X, runtime.bank);
    _q.copy(_qY).multiply(_qP).multiply(_qR);
    rig.group.quaternion.copy(_q);
    rig.group.visible = s.phase === "map" || morph.value > 0;

    // wing phase — slow mighty beats, faster with speed, near-glide at top speed
    const glide = THREE.MathUtils.smoothstep(speed01, 0.72, 0.97) * (boosting ? 1 : 0.6);
    const flapSpeed = 2.3 + speed01 * 4.4 - glide * 2.6;
    runtime.wingPhase += dt * flapSpeed;
    const ph = runtime.wingPhase;
    const amp = (0.62 + 0.3 * speed01) * (1 - glide * 0.72) * (frozen ? 0.55 : 1);

    // wing-beat whoosh on downstroke crossing
    const wv = wave(ph);
    if (a.lastWave > 0.35 && wv <= 0.35 && !frozen && morph.value > 0.8) {
      audio.whoosh(0.25 + 0.75 * speed01);
    }
    a.lastWave = wv;

    // ── spine bones: undulation, whip, neck stabilization ──
    const bones = rig.bones;
    for (let i = 1; i <= ROOT_IDX; i++) {
      const t = i / ROOT_IDX;
      const lat = (0.028 + Math.pow(t, 1.7) * 0.16) * (0.55 + 0.45 * speed01);
      bones[i].rotation.y = Math.sin(ph * 0.95 - i * 0.52) * lat - fs.turnSmooth * 0.055 * t;
      bones[i].rotation.z = Math.sin(ph * 0.85 - i * 0.46 + 1.3) * lat * 0.5;
    }
    for (let i = 12; i <= 15; i++) {
      const k = i - 11; // 1..4
      bones[i].rotation.y = Math.sin(ph * 0.9 + k * 0.8) * 0.035 + fs.turnSmooth * 0.05 * (1 - k / 5);
      bones[i].rotation.z = Math.sin(ph * 0.8 + k * 0.7) * 0.03 - runtime.pitch * 0.16; // head stays level
    }
    rig.headGroup.rotation.x = -runtime.bank * 0.5; // counter-roll
    rig.headGroup.rotation.y = fs.turnSmooth * 0.14; // look into the turn

    // jaw + firing state + fire-light in the skull
    runtime.firing = input.fire && !frozen;
    a.firing += ((runtime.firing ? 1 : 0) - a.firing) * Math.min(1, 8 * dt);
    rig.jaw.rotation.z = 0.42 * a.firing;
    rig.nostrilMat.emissiveIntensity = 0.4 + a.firing * 4.5 + Math.sin(ph * 3) * 0.15 * a.firing;
    rig.mouthGlowMat.opacity = a.firing * (0.65 + Math.random() * 0.3);
    rig.eyeMat.emissiveIntensity = 2.4 + a.firing * 1.6;
    audio.fire(runtime.firing);

    // ── wings: hierarchical flap with tip lag + membrane billow & ripple ──
    const phi1 = wave(ph) * amp * 0.95 + 0.16 + glide * 0.3;
    const phi2 = wave(ph - 0.38) * amp * 0.55;
    const phi3 = wave(ph - 0.72) * amp * 0.5 + glide * 0.12;
    const flapNow = phi1 + phi2 + phi3;
    a.flapVel += ((flapNow - a.lastFlap) / Math.max(dt, 1e-4) - a.flapVel) * Math.min(1, 10 * dt);
    a.lastFlap = flapNow;

    for (const wing of rig.wings) {
      const sgn = wing.side;
      const { S, E, W, F, H, L } = wing.rest;
      const eP = _v.set(0, 0, 0);
      rotAboutX(eP, S, E, -sgn * phi1);
      const wP = new THREE.Vector3();
      rotAboutX(wP, S, W, -sgn * phi1);
      rotAboutX(wP, eP, wP, -sgn * phi2);
      const fP: THREE.Vector3[] = [];
      for (const f of F) {
        const p = new THREE.Vector3();
        rotAboutX(p, S, f, -sgn * phi1);
        rotAboutX(p, eP, p, -sgn * phi2);
        rotAboutX(p, wP, p, -sgn * phi3);
        fP.push(p);
      }

      // membrane outline: L,E,W,F1,m12,F2,m23,F3,m34,F4,m4H,H
      const sag = THREE.MathUtils.clamp(-a.flapVel * 0.055, -0.5, 0.5);
      const outline: THREE.Vector3[] = [];
      outline.push(L.clone(), eP.clone(), wP.clone(), fP[0].clone());
      const scallop = (p1: THREE.Vector3, p2: THREE.Vector3, pull: number) => {
        const m = p1.clone().add(p2).multiplyScalar(0.5);
        _v2.copy(S).sub(m).multiplyScalar(pull);
        m.add(_v2);
        m.y += sag * 0.7;
        return m;
      };
      outline.push(scallop(fP[0], fP[1], 0.13), fP[1].clone());
      outline.push(scallop(fP[1], fP[2], 0.15), fP[2].clone());
      outline.push(scallop(fP[2], fP[3], 0.15), fP[3].clone());
      outline.push(scallop(fP[3], H, 0.12), H.clone());
      const center = new THREE.Vector3();
      for (const p of outline) center.add(p);
      center.multiplyScalar(1 / outline.length);
      center.y += sag * 1.15;

      const posAttr = wing.membrane.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < OUTLINE; i++) posAttr.setXYZ(i, outline[i].x, outline[i].y, outline[i].z);
      // mid ring with cloth ripple
      for (let i = 0; i < OUTLINE; i++) {
        const o = outline[i];
        const mx = (o.x + center.x) / 2;
        const my = (o.y + center.y) / 2 + sag * 0.55 + Math.sin(ph * 1.7 + i * 0.95) * 0.05 * (0.5 + speed01);
        const mz = (o.z + center.z) / 2;
        posAttr.setXYZ(OUTLINE + i, mx, my, mz);
      }
      posAttr.setXYZ(24, center.x, center.y, center.z);
      posAttr.needsUpdate = true;
      wing.membrane.computeVertexNormals();

      // arm + finger rods
      const rods: [THREE.Vector3, THREE.Vector3, number][] = [
        [S, eP, 0.16],
        [eP, wP, 0.13],
        [wP, fP[0], 0.055],
        [wP, fP[1], 0.05],
        [wP, fP[2], 0.05],
        [wP, fP[3], 0.05],
      ];
      for (let i = 0; i < rods.length; i++) {
        const [p1, p2, r] = rods[i];
        const rod = wing.bonesMeshes[i];
        rod.position.copy(p1).add(p2).multiplyScalar(0.5);
        _v2.copy(p2).sub(p1);
        const L2 = _v2.length();
        rod.scale.set(r, L2, r);
        _axis.copy(_v2).normalize();
        rod.quaternion.setFromUnitVectors(AXIS_Y, _axis);
      }
      // wingtip claw (follows leading finger) + thumb claw at the wrist
      const tip = wing.claws[0];
      _v2.copy(fP[0]).sub(wP).normalize();
      tip.position.copy(fP[0]).addScaledVector(_v2, 0.12);
      tip.quaternion.setFromUnitVectors(AXIS_Y, _v2);
      const thumb = wing.claws[1];
      _v2.set(0.85, 0.12, sgn * 0.25).normalize();
      thumb.position.copy(wP).addScaledVector(_v2, 0.15);
      thumb.quaternion.setFromUnitVectors(AXIS_Y, _v2);
    }

    // legs sway gently
    for (let i = 0; i < rig.legs.length; i++) {
      rig.legs[i].rotation.x = Math.sin(ph * 1.05 + i * 1.4) * 0.1;
    }

    // ── mouth world transform for the fire system ──
    rig.group.updateMatrixWorld(true);
    rig.mouth.getWorldPosition(runtime.mouthPos);
    rig.mouthTip.getWorldPosition(_v2);
    runtime.mouthDir.copy(_v2).sub(runtime.mouthPos).normalize();

  });

  return <primitive object={rig.group} />;
}
