"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { runtime } from "@/game/runtime";
import { input } from "@/input/controls";
import { game } from "@/state/store";
import { morph } from "@/three/Terrain";
import { audio } from "@/audio/engine";
import { createFlightState, stepFlight, EAGLE_TUNING } from "@/three/flight";

// ── golden-eagle palette ─────────────────────────────────────────────────────
const BODY_DK = new THREE.Color("#42301c");
const BODY = new THREE.Color("#5d4226");
const BODY_LT = new THREE.Color("#8a6a44");
const NAPE = new THREE.Color("#b8863c");

const EAGLE_SCALE = 1.6;

// wing skeleton rest pose (model space, +X forward, Y up), per side ±Z
const S0 = new THREE.Vector3(0.55, 0.5, 0.6);
const E_OFF = new THREE.Vector3(0.05, 0.3, 1.55);
const W_OFF = new THREE.Vector3(0.3, 0.05, 1.8);

// ── feather texture (procedural: shaft + barbs + rounded tip) ────────────────
function makeFeatherTexture(shaft: string, barbA: string, barbB: string, band?: string) {
  const W = 128;
  const H = 512;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  // vane
  for (let y = 6; y < H - 4; y += 5) {
    const t = y / H;
    const half = 16 + 40 * Math.min(1, t * 2.4) * (t > 0.92 ? (1 - t) * 12 : 1);
    ctx.strokeStyle = (y / 5) % 2 ? barbA : barbB;
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.moveTo(W / 2, y);
    ctx.lineTo(W / 2 - half, y + 13);
    ctx.moveTo(W / 2, y);
    ctx.lineTo(W / 2 + half, y + 13);
    ctx.stroke();
  }
  // subterminal band (tail feathers)
  if (band) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = band;
    ctx.fillRect(0, H * 0.66, W, H * 0.2);
    ctx.globalCompositeOperation = "source-over";
  }
  // shaft
  ctx.strokeStyle = shaft;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H - 8);
  ctx.stroke();
  // round the tip
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H - 60);
  ctx.quadraticCurveTo(W, H, W / 2, H);
  ctx.quadraticCurveTo(0, H, 0, H - 60);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeSpeckleBump() {
  const S = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, S, S);
  let sd = 917;
  const rand = () => {
    sd = (sd * 1664525 + 1013904223) >>> 0;
    return sd / 4294967296;
  };
  for (let i = 0; i < 900; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 2 + rand() * 5;
    const g = ctx.createRadialGradient(x, y, 0.5, x, y, r);
    g.addColorStop(0, "#8e8e8e");
    g.addColorStop(1, "#787878");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.55, rand(), 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

interface Feather {
  mesh: THREE.Mesh;
  fan: number; // base fan angle (positive = trailing)
  ratio: number; // 0 root … 1 outermost (dynamics scale)
  width: number;
  len: number;
}

interface WingSide {
  sd: 1 | -1;
  hum: THREE.Group;
  fore: THREE.Group;
  hand: THREE.Group;
  humRest: THREE.Vector3;
  foreRest: THREE.Vector3;
  primaries: Feather[];
  secondaries: Feather[];
  coverts: Feather[];
  alula: Feather;
  armMeshes: THREE.Mesh[];
  E0: THREE.Vector3;
  W0: THREE.Vector3;
}

interface EagleRig {
  group: THREE.Group;
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  mandible: THREE.Group;
  tailPivot: THREE.Group;
  tailFeathers: Feather[];
  wings: WingSide[];
  legs: THREE.Group[];
  eyeMat: THREE.MeshStandardMaterial;
}

function buildEagle(): EagleRig {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(EAGLE_SCALE);
  group.add(inner);
  const bodyGroup = new THREE.Group();
  inner.add(bodyGroup);

  const speckle = makeSpeckleBump();
  const bodyMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.04,
    bumpMap: speckle,
    bumpScale: 0.5,
  });
  const wingTex = makeFeatherTexture("#241708", "#4a3018", "#5d4226");
  const wingMat = new THREE.MeshStandardMaterial({
    map: wingTex,
    transparent: true,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0.03,
  });
  const goldTex = makeFeatherTexture("#5d3f1a", "#b8863c", "#9a6f30");
  const goldMat = new THREE.MeshStandardMaterial({
    map: goldTex,
    transparent: true,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.88,
  });
  const tailTex = makeFeatherTexture("#8a7a5c", "#e8e0cc", "#d6cdb8", "#3a2c1a");
  const tailMat = new THREE.MeshStandardMaterial({
    map: tailTex,
    transparent: true,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.9,
  });
  const beakMat = new THREE.MeshStandardMaterial({ color: "#d8a83c", roughness: 0.45, metalness: 0.15 });
  const beakTipMat = new THREE.MeshStandardMaterial({ color: "#35281a", roughness: 0.4 });
  const tarsusMat = new THREE.MeshStandardMaterial({ color: "#e8c04a", roughness: 0.7 });
  const clawMat = new THREE.MeshStandardMaterial({ color: "#241c12", roughness: 0.35 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: "#1c1006", emissive: "#ffb733", emissiveIntensity: 1.5 });

  // ── body hull (ring-lofted, vertex-colored) ──
  const SP: [number, number][] = [
    [-2.6, 0.14], [-1.9, 0.2], [-1.0, 0.3], [-0.1, 0.32], [0.8, 0.24], [1.5, 0.14], [2.15, 0.1],
  ];
  const RAD = [0.26, 0.5, 0.74, 0.84, 0.76, 0.56, 0.4];
  const RADIAL = 14;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const tmpC = new THREE.Color();
  for (let j = 0; j < SP.length; j++) {
    for (let a = 0; a <= RADIAL; a++) {
      const th = (a / RADIAL) * Math.PI * 2;
      const cy = Math.cos(th);
      const sy = Math.sin(th);
      const r = RAD[j] * (1 + 0.03 * Math.sin(j * 2.1 + a));
      pos.push(SP[j][0], SP[j][1] + cy * r * 1.05, sy * r);
      const belly = THREE.MathUtils.smoothstep(-cy, 0.1, 0.8);
      const napeAmt = j >= 4 ? THREE.MathUtils.smoothstep(cy, 0.15, 0.9) * (j - 3) * 0.3 : 0;
      tmpC.copy(BODY).lerp(BODY_DK, THREE.MathUtils.smoothstep(cy, 0.4, 0.95) * 0.8);
      tmpC.lerp(BODY_LT, belly * 0.85);
      tmpC.lerp(NAPE, Math.min(1, napeAmt));
      col.push(tmpC.r, tmpC.g, tmpC.b);
    }
  }
  for (let j = 0; j < SP.length - 1; j++) {
    for (let a = 0; a < RADIAL; a++) {
      const a0 = j * (RADIAL + 1) + a;
      const a1 = a0 + 1;
      const b0 = a0 + RADIAL + 1;
      const b1 = b0 + 1;
      idx.push(a0, a1, b0, a1, b1, b0);
    }
  }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  hull.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
  hull.setIndex(idx);
  hull.computeVertexNormals();
  const hullMesh = new THREE.Mesh(hull, bodyMat);
  hullMesh.castShadow = true;
  bodyGroup.add(hullMesh);
  // nose & tail caps
  const capF = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), bodyMat);
  capF.position.set(2.15, 0.1, 0);
  const capB = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), bodyMat);
  capB.position.set(-2.6, 0.14, 0);
  bodyGroup.add(capF, capB);
  // shoulder fairings
  for (const sd of [-1, 1]) {
    const fair = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), bodyMat);
    fair.position.set(0.5, 0.42, sd * 0.55);
    fair.scale.set(1.4, 0.8, 1.0);
    bodyGroup.add(fair);
  }

  // ── head ──
  const headGroup = new THREE.Group();
  headGroup.position.set(2.45, 0.62, 0);
  bodyGroup.add(headGroup);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), bodyMat);
  skull.scale.set(1.18, 0.95, 0.88);
  // paint the skull golden: cheap trick — separate gold-tinted material
  const headMat = new THREE.MeshStandardMaterial({ color: "#8a6432", roughness: 0.85, bumpMap: speckle, bumpScale: 0.35 });
  skull.material = headMat;
  headGroup.add(skull);
  // golden nape crest — small feathers sweeping back
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.66), goldMat);
    const a = -0.5 + i * 0.25;
    f.position.set(-0.32 - Math.abs(a) * 0.1, 0.18 + Math.cos(a) * 0.12, Math.sin(a) * 0.3);
    f.rotation.set(a * 0.6, a * 0.5, 2.15);
    headGroup.add(f);
  }
  // beak — hooked
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.52, 8), beakMat);
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.56, 0.02, 0);
  beak.scale.z = 0.82;
  headGroup.add(beak);
  const hook = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 7), beakTipMat);
  hook.position.set(0.8, -0.05, 0);
  hook.rotation.z = -2.15;
  headGroup.add(hook);
  // lower mandible — opens with the cry
  const mandible = new THREE.Group();
  mandible.position.set(0.34, -0.1, 0);
  const mand = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 7), beakTipMat);
  mand.rotation.z = -Math.PI / 2;
  mand.position.set(0.2, 0, 0);
  mand.scale.y = 0.7;
  mandible.add(mand);
  headGroup.add(mandible);
  // fierce brows + amber eyes with pupils
  for (const sd of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.12), headMat);
    brow.position.set(0.22, 0.19, sd * 0.26);
    brow.rotation.y = -sd * 0.25;
    brow.rotation.z = 0.16;
    headGroup.add(brow);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), eyeMat);
    eye.position.set(0.23, 0.1, sd * 0.29);
    headGroup.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), new THREE.MeshBasicMaterial({ color: "#100801" }));
    pupil.position.set(0.28, 0.1, sd * 0.34);
    headGroup.add(pupil);
  }
  headGroup.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });

  // ── shared feather unit geometry: root at origin, blade along +Z ──
  const featherGeo = new THREE.PlaneGeometry(1, 1);
  featherGeo.rotateX(-Math.PI / 2);
  featherGeo.translate(0, 0, 0.5);

  const mkFeather = (
    parent: THREE.Object3D, mat: THREE.Material, sd: number,
    width: number, len: number, fan: number, ratio: number,
    px: number, py: number, pz: number,
  ): Feather => {
    const mesh = new THREE.Mesh(featherGeo, mat);
    mesh.castShadow = true;
    mesh.scale.set(width, 1, len * sd);
    mesh.position.set(px, py, pz * sd);
    mesh.rotation.order = "YXZ";
    mesh.rotation.y = -fan;
    parent.add(mesh);
    return { mesh, fan, ratio, width, len };
  };

  // ── wings ──
  const wings: WingSide[] = [];
  const armGeo = new THREE.CapsuleGeometry(0.16, 1, 3, 7);
  for (const sd of [-1, 1] as const) {
    const S = new THREE.Vector3(S0.x, S0.y, S0.z * sd);
    const E0 = S.clone().add(new THREE.Vector3(E_OFF.x, E_OFF.y, E_OFF.z * sd));
    const W0 = E0.clone().add(new THREE.Vector3(W_OFF.x, W_OFF.y, W_OFF.z * sd));
    const humRest = E0.clone().sub(S).normalize();
    const foreRest = W0.clone().sub(E0).normalize();

    const hum = new THREE.Group();
    hum.position.copy(S);
    inner.add(hum);
    const fore = new THREE.Group();
    fore.position.copy(E0);
    inner.add(fore);
    const hand = new THREE.Group();
    hand.position.copy(W0);
    inner.add(hand);

    // arm volumes ride the bone groups
    const armMeshes: THREE.Mesh[] = [];
    const upper = new THREE.Mesh(armGeo, bodyMat);
    upper.castShadow = true;
    hum.add(upper);
    const lower = new THREE.Mesh(armGeo, bodyMat);
    lower.castShadow = true;
    fore.add(lower);
    armMeshes.push(upper, lower);
    // orient capsules along their rest dirs (they inherit group rotation later)
    upper.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), humRest);
    upper.position.copy(humRest.clone().multiplyScalar(E0.distanceTo(S) / 2));
    upper.scale.set(1, E0.distanceTo(S) / 1.3, 1);
    lower.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), foreRest);
    lower.position.copy(foreRest.clone().multiplyScalar(W0.distanceTo(E0) / 2));
    lower.scale.set(0.75, W0.distanceTo(E0) / 1.3, 0.75);

    // primaries — the great slotted flight feathers, fanned from the hand
    const primaries: Feather[] = [];
    const PRI_LEN = [2.6, 2.9, 3.05, 3.1, 3.0, 2.8, 2.5, 2.15, 1.8];
    for (let i = 0; i < PRI_LEN.length; i++) {
      const fan = -0.12 + (i / (PRI_LEN.length - 1)) * 1.42;
      primaries.push(
        mkFeather(hand, wingMat, sd, 0.42, PRI_LEN[i], fan, i / (PRI_LEN.length - 1), 0, -0.012 * i, 0.05 * i),
      );
    }
    // secondaries — along the forearm, trailing
    const secondaries: Feather[] = [];
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      secondaries.push(
        mkFeather(fore, wingMat, sd, 0.44, 1.9 - t * 0.35, 1.08 + t * 0.14, t, 0.02, -0.015 * i - 0.01, 0.22 + t * 1.4),
      );
    }
    // coverts — broad golden shoulder feathers hiding the bases
    const coverts: Feather[] = [];
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      coverts.push(mkFeather(hum, goldMat, sd, 0.62, 1.2, 0.95, t, 0.05, 0.03, 0.3 + t * 0.85));
    }
    // alula — the little thumb-tuft at the wrist
    const alula = mkFeather(hand, goldMat, sd, 0.26, 0.85, -0.42, 0, 0.02, 0.02, 0);

    wings.push({ sd, hum, fore, hand, humRest, foreRest, primaries, secondaries, coverts, alula, armMeshes, E0, W0 });
  }

  // ── tail fan ──
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-2.45, 0.16, 0);
  bodyGroup.add(tailPivot);
  const tailInner = new THREE.Group();
  tailInner.rotation.y = -Math.PI / 2; // feathers' +Z → model -X (sweep back)
  tailPivot.add(tailInner);
  const tailFeathers: Feather[] = [];
  for (let i = 0; i < 7; i++) {
    const k = i - 3;
    const f = mkFeather(tailInner, tailMat, 1, 0.5, 2.35 - Math.abs(k) * 0.16, 0, Math.abs(k) / 3, 0, -0.012 * Math.abs(k), 0);
    f.fan = k * 0.3; // symmetric fan, re-scaled each frame
    f.mesh.rotation.x = 0.045 * k; // slight cupping so the fan reads as one surface
    tailFeathers.push(f);
  }
  // tail coverts — gold above, pale below, hiding the quill roots
  for (let i = -1; i <= 1; i++) {
    const upper = new THREE.Mesh(featherGeo, goldMat);
    upper.scale.set(0.55, 1, 1.15);
    upper.position.set(0, 0.055, 0.06);
    upper.rotation.set(0.06 * i, i * 0.3, 0);
    upper.castShadow = true;
    tailInner.add(upper);
    const under = new THREE.Mesh(featherGeo, tailMat);
    under.scale.set(0.5, 1, 0.9);
    under.position.set(0, -0.05, 0.05);
    under.rotation.set(-0.05 * i, i * 0.34, 0);
    tailInner.add(under);
  }

  // ── tucked legs & talons ──
  const thighMat = new THREE.MeshStandardMaterial({ color: "#4e3820", roughness: 0.95, bumpMap: speckle, bumpScale: 0.4 });
  const legs: THREE.Group[] = [];
  for (const sd of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(-0.7, -0.62, sd * 0.34);
    // feathered thigh — the golden eagle's "boots"
    const thigh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), thighMat);
    thigh.position.set(0.12, 0.3, 0);
    thigh.scale.set(1.45, 1.15, 0.85);
    leg.add(thigh);
    const tarsus = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 3, 7), tarsusMat);
    tarsus.rotation.z = 1.15;
    tarsus.castShadow = true;
    leg.add(tarsus);
    for (let c = 0; c < 3; c++) {
      const toe = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.3, 2, 6), tarsusMat);
      toe.position.set(-0.4, -0.12, (c - 1) * 0.11);
      toe.rotation.z = 1.7 + (c - 1) * 0.06;
      leg.add(toe);
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 5), clawMat);
      claw.position.set(-0.58, -0.2, (c - 1) * 0.11);
      claw.rotation.z = 2.4;
      leg.add(claw);
    }
    leg.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
    bodyGroup.add(leg);
    legs.push(leg);
  }

  return { group, bodyGroup, headGroup, mandible, tailPivot, tailFeathers, wings, legs, eyeMat };
}

// asymmetric flap wave — fast downstroke, slow recovery
const wave = (p: number) => Math.sin(p + 0.45 * Math.sin(p));

const _q = new THREE.Quaternion();
const _qY = new THREE.Quaternion();
const _qP = new THREE.Quaternion();
const _qR = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
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

export function Eagle() {
  const rig = useMemo(buildEagle, []);
  const flight = useRef(createFlightState());
  const anim = useRef({ lastWave: 0, flapVel: 0, lastFlap: 0, cry: 0 });

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

    // ── shared flight dynamics ──
    stepFlight(dt, frozen, EAGLE_TUNING, fs);
    const speed01 = fs.speed01;

    // the eagle carries no fire
    runtime.firing = false;
    audio.fire(false);

    // ── pose ──
    rig.group.position.copy(runtime.pos);
    _qY.setFromAxisAngle(AXIS_Y, -runtime.heading);
    _qP.setFromAxisAngle(AXIS_Z, runtime.pitch);
    _qR.setFromAxisAngle(AXIS_X, runtime.bank);
    _q.copy(_qY).multiply(_qP).multiply(_qR);
    rig.group.quaternion.copy(_q);
    rig.group.visible = s.phase === "map" || morph.value > 0;

    // ── wing beat: quicker than the dragon, long soaring glides ──
    const glide = THREE.MathUtils.smoothstep(speed01, 0.55, 0.85) * (fs.boosting ? 1 : 0.75);
    const flapSpeed = 2.8 + speed01 * 4.8 - glide * 3.4;
    runtime.wingPhase += dt * flapSpeed;
    const ph = runtime.wingPhase;
    const amp = (0.5 + 0.22 * speed01) * (1 - glide * 0.85) * (frozen ? 0.5 : 1);

    const wv = wave(ph);
    if (a.lastWave > 0.35 && wv <= 0.35 && !frozen && morph.value > 0.8) {
      audio.whoosh(0.15 + 0.5 * speed01);
    }
    a.lastWave = wv;

    const phi1 = wave(ph) * amp * 0.9 + 0.12 + glide * 0.22;
    const phi2 = wave(ph - 0.35) * amp * 0.5;
    const phi3 = wave(ph - 0.65) * amp * 0.45 + glide * 0.1;
    const flapNow = phi1 + phi2 + phi3;
    a.flapVel += ((flapNow - a.lastFlap) / Math.max(dt, 1e-4) - a.flapVel) * Math.min(1, 10 * dt);
    a.lastFlap = flapNow;

    // feather dynamics inputs
    const spread01 = THREE.MathUtils.clamp(glide + fs.brakeSmooth * 0.8 + speed01 * 0.15, 0, 1);
    const upstroke = THREE.MathUtils.clamp(a.flapVel * 0.25, 0, 1); // wing rising → slots open
    const loadBend = THREE.MathUtils.clamp(-a.flapVel * 0.1, -0.3, 0.45) + 0.1 + speed01 * 0.12;

    for (const wing of rig.wings) {
      const sd = wing.sd;
      const S = new THREE.Vector3(S0.x, S0.y, S0.z * sd);
      const eP = _v.set(0, 0, 0);
      rotAboutX(eP, S, wing.E0, -sd * phi1);
      const wP = new THREE.Vector3();
      rotAboutX(wP, S, wing.W0, -sd * phi1);
      rotAboutX(wP, eP, wP, -sd * phi2);

      wing.hum.position.copy(S);
      _v2.copy(eP).sub(S).normalize();
      wing.hum.quaternion.setFromUnitVectors(wing.humRest, _v2);
      wing.fore.position.copy(eP);
      _v2.copy(wP).sub(eP).normalize();
      wing.fore.quaternion.setFromUnitVectors(wing.foreRest, _v2);
      wing.hand.position.copy(wP);
      wing.hand.quaternion.copy(wing.fore.quaternion);
      // wingtip lag twist
      _qR.setFromAxisAngle(AXIS_X, -sd * phi3 * 0.55);
      wing.hand.quaternion.premultiply(_qR);

      const fanScale = 0.82 + 0.3 * spread01;
      const sweep = Math.sin(ph - 0.5) * 0.05;
      for (const f of wing.primaries) {
        f.mesh.rotation.y = -(f.fan * fanScale + sweep);
        f.mesh.rotation.z = upstroke * (0.25 + 0.5 * f.ratio); // slotting
        f.mesh.rotation.x = -sd * loadBend * (0.25 + 0.75 * f.ratio);
      }
      for (const f of wing.secondaries) {
        f.mesh.rotation.y = -(f.fan * (0.9 + 0.12 * spread01));
        f.mesh.rotation.x = -sd * loadBend * 0.3 * (1 - f.ratio * 0.4);
      }
      for (const f of wing.coverts) {
        f.mesh.rotation.x = -sd * (0.06 + loadBend * 0.12);
      }
      wing.alula.mesh.rotation.y = -(wing.alula.fan - fs.brakeSmooth * 0.35); // alula pops on brake
    }

    // ── tail: fans wide when braking or carving, tilts as a rudder ──
    const tailFan = 0.42 + fs.brakeSmooth * 0.85 + Math.abs(fs.turnSmooth) * 0.22;
    for (const f of rig.tailFeathers) {
      f.mesh.rotation.y = -f.fan * tailFan;
    }
    rig.tailPivot.rotation.z = 0.1 + fs.brakeSmooth * 0.42 - speed01 * 0.06;
    rig.tailPivot.rotation.x = fs.turnSmooth * 0.22;

    // ── head: fierce stabilization (eagles keep a level gaze) ──
    rig.headGroup.rotation.z = -runtime.pitch * 0.85;
    rig.headGroup.rotation.x = -runtime.bank * 0.75;
    rig.headGroup.rotation.y = fs.turnSmooth * 0.2;
    // beak opens for the cry
    const crying = input.fire && !frozen;
    a.cry += ((crying ? 1 : 0) - a.cry) * Math.min(1, 9 * dt);
    rig.mandible.rotation.z = -0.5 * a.cry;
    rig.eyeMat.emissiveIntensity = 1.5 + a.cry * 1.2;

    // body breathes, legs sway
    rig.bodyGroup.rotation.x = Math.sin(ph * 0.9) * 0.015;
    rig.bodyGroup.position.y = Math.sin(ph) * 0.05;
    for (let i = 0; i < rig.legs.length; i++) {
      rig.legs[i].rotation.x = Math.sin(ph * 1.05 + i * 2) * 0.06;
    }

    // beak world position for the cry ring
    rig.group.updateMatrixWorld(true);
    rig.headGroup.getWorldPosition(runtime.mouthPos);
    _v2.set(Math.cos(runtime.heading), 0, Math.sin(runtime.heading));
    runtime.mouthDir.copy(_v2);
  });

  return <primitive object={rig.group} />;
}
