"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MAP_W, MAP_H, SEA_LEVEL, SITES, toWorldX, toWorldZ } from "@/data/content";
import { runtime } from "@/game/runtime";
import { useGame } from "@/state/store";
import { heightAt } from "@/three/noise";
import { solidAt } from "@/three/obstacles";
import { morph, realism } from "@/three/Terrain";
import { sampleFeature, sampleHeight, sampleUp, terrainData, type TerrainData } from "@/three/terrainData";

/**
 * Ambient life: bird flocks about the steed, sheep grazing the Shire's
 * pastures, white ships off the Gulf of Lune. One instanced draw call per
 * kind, nothing in the shadow pass, nothing allocated per frame — and all of
 * it shrinks away unless the land has come alive under the camera.
 */
export function Fauna() {
  const quality = useGame((s) => s.quality);
  return (
    <>
      <Birds quality={quality} />
      <Sheep quality={quality} />
      <Ships quality={quality} />
    </>
  );
}

type Quality = "high" | "low";

/** How alive the land is: risen from the parchment, and seen from low down. */
const alive = () => morph.value * THREE.MathUtils.smoothstep(realism.value, 0.3, 0.85);

const clamp = THREE.MathUtils.clamp;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

/**
 * Pose instance `i` of a model built +X forward, +Z the right wing (the
 * steeds' convention): `heading` as the steed's, pitch nose-up, bank
 * right-wing-down.
 */
function place(
  mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number,
  heading: number, pitch: number, bank: number, scale: number,
) {
  _e.set(bank, -heading, pitch, "YZX");
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.setScalar(scale));
  mesh.setMatrixAt(i, _m);
}

/** A flat-coloured part, ready to merge (sRGB hex in, linear vertex colour out). */
function part(geo: THREE.BufferGeometry, hex: string) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute("uv");
  const c = new THREE.Color(hex);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) c.toArray(col, i);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

function merge(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}

/** An instanced mesh whose instances roam freely (so no bounds to cull by). */
function useInstanced(geometry: THREE.BufferGeometry, material: THREE.Material, max: number, shadows = false) {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(geometry, material, max);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
    m.frustumCulled = false;
    m.receiveShadow = shadows;
    m.count = 0;
    m.visible = false;
    return m;
  }, [geometry, material, max, shadows]);
  useEffect(
    () => () => {
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
    [mesh, geometry, material],
  );
  return mesh;
}

// ── birds ───────────────────────────────────────────────────────────────────
// A few flocks always somewhere about the steed: each meanders on its own
// slow path, leashed loosely to the steed, and is re-seeded out ahead once it
// has been left far behind. Fly through one and it bursts apart and flees.

const FLOCKS = { high: 4, low: 2 };
const PER_FLOCK = { high: 14, low: 9 };
const MAX_FLOCKS = 4;
const MAX_PER_FLOCK = 14;
const BIRD_SCALE = 1.1;
const LEASH = 260; // wander freely within this of the steed…
const RESPAWN = 720; // …and beyond this, start again out ahead of it
const SCATTER_R = 42;
const ROOK = new THREE.Color("#3a332c");
const GULL = new THREE.Color("#ece8e0");

function birdGeometry() {
  const t = (...p: number[][]) => p;
  const N = [0.62, 0.02, 0], T = [-0.5, 0.03, 0], U = [0.05, 0.13, 0], B = [0.05, -0.1, 0];
  const L = [0.05, 0, -0.13], R = [0.05, 0, 0.13];
  const tris = [
    t(N, U, R), t(N, R, B), t(N, B, L), t(N, L, U), t(T, R, U), t(T, B, R), t(T, L, B), t(T, U, L),
    t([-0.42, 0.03, 0], [-0.82, 0.05, -0.2], [-0.82, 0.05, 0.2]), // tail fan
  ];
  for (const s of [1, -1]) {
    // shoulder, wrist and a swept-back tip
    const SL = [0.2, 0.04, 0.1 * s], ST = [-0.18, 0.04, 0.1 * s];
    const WL = [0.08, 0.04, 0.95 * s], WT = [-0.3, 0.04, 0.9 * s], P = [-0.38, 0.04, 1.65 * s];
    tris.push(t(SL, WL, WT), t(SL, WT, ST), t(WL, P, WT));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris.flat(2)), 3));
  g.computeVertexNormals();
  return g;
}

function birdMaterial() {
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aFlap;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         // the wing hinges at the shoulder and again at the wrist, so the
         // tips lead every stroke
         float span = abs(transformed.z);
         transformed.y += aFlap * (max(span - 0.1, 0.0) * 0.75 + max(span - 0.9, 0.0) * 0.7);`,
      );
  };
  m.customProgramCacheKey = () => "fauna-bird";
  return m;
}

interface Flock {
  x: number; y: number; z: number;
  heading: number;
  agl: number;
  /** 1 the instant the steed bursts through, decaying to 0 as they regroup */
  scatter: number;
  flee: number;
  seed: number;
  age: number;
  live: boolean;
}

interface Bird {
  // a loose formation: each bird swings about its slot on three slow sines
  ax: number; ay: number; az: number;
  fx: number; fy: number; fz: number;
  px: number; py: number; pz: number;
  // which way it bolts when the flock scatters: outward and up
  sx: number; sy: number; sz: number;
  rate: number;
  flap: number;
  x: number; y: number; z: number;
  yaw: number;
  bank: number;
}

function Birds({ quality }: { quality: Quality }) {
  const { geometry, flap } = useMemo(() => {
    const geometry = birdGeometry();
    const flap = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLOCKS * MAX_PER_FLOCK), 1);
    flap.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aFlap", flap);
    return { geometry, flap };
  }, []);
  const material = useMemo(birdMaterial, []);
  const mesh = useInstanced(geometry, material, MAX_FLOCKS * MAX_PER_FLOCK);

  const sim = useMemo(() => {
    const r = rng(7331);
    const flocks: Flock[] = Array.from({ length: MAX_FLOCKS }, (_, i) => ({
      x: 0, y: 0, z: 0, heading: 0, agl: 30, scatter: 0, flee: 0, seed: i * 2.7 + 0.5, age: 0, live: false,
    }));
    const birds: Bird[] = Array.from({ length: MAX_FLOCKS * MAX_PER_FLOCK }, () => {
      const sx = r() * 2 - 1;
      const sy = 0.3 + r() * 0.7;
      const sz = r() * 2 - 1;
      const k = 1 / Math.hypot(sx, sy, sz);
      return {
        ax: 4 + r() * 9, ay: 1 + r() * 3, az: 4 + r() * 9,
        fx: 0.2 + r() * 0.35, fy: 0.3 + r() * 0.4, fz: 0.2 + r() * 0.35,
        px: r() * 6.28, py: r() * 6.28, pz: r() * 6.28,
        sx: sx * k, sy: sy * k, sz: sz * k,
        rate: 8 + r() * 3, flap: r() * 6.28,
        x: 0, y: 0, z: 0, yaw: 0, bank: 0,
      };
    });
    return { flocks, birds, clock: 0 };
  }, []);

  // a new flock size re-deals the instance slots, so start every flock afresh
  useEffect(() => {
    for (const f of sim.flocks) f.live = false;
  }, [quality, sim]);

  useFrame((_, dtRaw) => {
    const life = alive();
    mesh.visible = life > 0.01;
    if (!mesh.visible) {
      // the land is a map again — reseed round the steed when it wakes
      for (const f of sim.flocks) f.live = false;
      return;
    }
    const dt = Math.min(dtRaw, 0.05);
    if (dt <= 0) return;
    sim.clock += dt;
    const t = sim.clock;
    const per = PER_FLOCK[quality];
    const flaps = flap.array as Float32Array;
    const S = runtime.pos;
    let n = 0;
    for (let fi = 0; fi < FLOCKS[quality]; fi++) {
      const f = sim.flocks[fi];
      let dx = S.x - f.x;
      let dz = S.z - f.z;
      const fresh = !f.live || Math.hypot(dx, dz) > RESPAWN;
      if (fresh) {
        // out ahead of the steed, far enough to be a speck as it appears
        const a = runtime.heading + (Math.random() - 0.5) * 1.8;
        const r = 320 + Math.random() * 200;
        f.x = clamp(S.x + Math.cos(a) * r, 60, MAP_W - 60);
        f.z = clamp(S.z + Math.sin(a) * r, 60, MAP_H - 60);
        f.heading = Math.random() * Math.PI * 2;
        f.agl = 16 + Math.random() * 40;
        f.y = Math.max(solidAt(f.x, f.z), SEA_LEVEL) + f.agl;
        f.scatter = 0;
        f.age = 0;
        f.live = true;
        // gulls over the sea, rooks and starlings over the land
        const c = heightAt(f.x, f.z) < SEA_LEVEL ? GULL : ROOK;
        for (let j = 0; j < per; j++) mesh.setColorAt(fi * per + j, c);
        mesh.instanceColor!.needsUpdate = true;
        dx = S.x - f.x;
        dz = S.z - f.z;
      }
      const d = Math.hypot(dx, dz);

      // the steed bursts through: scatter, and flee directly away from it
      if (f.scatter < 0.3 && Math.hypot(d, S.y - f.y) < SCATTER_R) {
        f.scatter = 1;
        f.flee = Math.atan2(-dz, -dx);
      }
      f.scatter = Math.max(0, f.scatter - dt * 0.22);
      // startle fast, hold, then drift back into formation
      const p = 1 - f.scatter;
      const burst = f.scatter > 0 ? THREE.MathUtils.smoothstep(p, 0, 0.12) * (1 - THREE.MathUtils.smoothstep(p, 0.35, 1)) : 0;

      // the flock's own path: a slow meander on two incommensurate sines
      let turn = Math.sin(t * 0.11 + f.seed) * 0.3 + Math.sin(t * 0.047 + f.seed * 1.7) * 0.2;
      if (f.scatter > 0.05) turn = clamp(wrap(f.flee - f.heading), -1, 1) * 1.8;
      else if (d > LEASH) turn += clamp(wrap(Math.atan2(dz, dx) - f.heading), -1, 1) * 0.6 * Math.min(1, (d - LEASH) / 150);
      f.heading += turn * dt;
      const speed = 12 * (1 + 0.9 * burst);
      f.x = clamp(f.x + Math.cos(f.heading) * speed * dt, 40, MAP_W - 40);
      f.z = clamp(f.z + Math.sin(f.heading) * speed * dt, 40, MAP_H - 40);
      // hold height over whatever is below — canopy, tower or sea
      const ground = Math.max(solidAt(f.x, f.z), SEA_LEVEL);
      f.y += (ground + f.agl + burst * 20 - f.y) * Math.min(1, dt * 0.8);
      f.age += dt;

      const scale = BIRD_SCALE * life * Math.min(1, f.age / 1.5);
      const spread = 1 + 2.2 * burst;
      const fc = Math.cos(f.heading);
      const fs = Math.sin(f.heading);
      for (let j = 0; j < per; j++) {
        const b = sim.birds[fi * MAX_PER_FLOCK + j];
        const ox = b.ax * Math.sin(t * b.fx + b.px) * spread;
        const oy = b.ay * Math.sin(t * b.fy + b.py) * spread;
        const oz = b.az * Math.cos(t * b.fz + b.pz) * spread;
        const x = f.x + fc * ox - fs * oz + b.sx * burst * 26;
        const y = f.y + oy + b.sy * burst * 26;
        const z = f.z + fs * ox + fc * oz + b.sz * burst * 26;

        // face along its own motion, banking into its turns
        let yaw = f.heading;
        let pitch = 0;
        let climb = 0;
        if (!fresh) {
          const vx = (x - b.x) / dt;
          const vz = (z - b.z) / dt;
          const hs = Math.hypot(vx, vz);
          climb = (y - b.y) / dt;
          yaw = hs > 0.5 ? Math.atan2(vz, vx) : b.yaw;
          pitch = clamp(Math.atan2(climb, Math.max(hs, 1)), -0.6, 0.6);
          const bank = clamp((wrap(yaw - b.yaw) / dt) * 0.35, -0.9, 0.9);
          b.bank += (bank - b.bank) * Math.min(1, dt * 4);
        } else {
          b.bank = 0;
        }
        b.x = x;
        b.y = y;
        b.z = z;
        b.yaw = yaw;

        // flap, then glide on held wings; a startled or climbing bird beats hard
        const beat = Math.max(burst, THREE.MathUtils.smoothstep(Math.sin(t * 0.35 + b.px), -0.3, 0.4), climb > 3 ? 1 : 0);
        b.flap += dt * b.rate * (1 + 0.7 * burst);
        flaps[n] = Math.sin(b.flap) * beat + (1 - beat) * 0.15;
        place(mesh, n, x, y, z, yaw, pitch, b.bank, scale);
        n++;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    flap.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}

// ── sheep ───────────────────────────────────────────────────────────────────
// Herds on the open pastures round Hobbiton (no wood, road, stream or bog,
// nothing steep). Each sheep ambles to a spot in its herd's patch, grazes a
// while, and moves on; the patches themselves drift slowly over the fields.

const HERDS = { high: 5, low: 3 };
const PER_HERD = { high: 12, low: 7 };
const MAX_HERDS = 5;
const MAX_PER_HERD = 12;
const HERD_R = 18;
const SHEEP_SCALE = 0.95;
const SHIRE_VIEW = 950; // beyond this from Hobbiton a sheep is not even a speck

function sheepGeometry() {
  const WOOL = "#ece6d6";
  const FACE = "#2e2925";
  const leg = (x: number, z: number) => part(new THREE.CylinderGeometry(0.1, 0.08, 0.85, 5).translate(x, 0.42, z), FACE);
  return merge([
    // two overlapping puffs of fleece, so the body reads lumpy rather than an egg
    part(new THREE.SphereGeometry(1, 12, 8).scale(1.05, 0.68, 0.66).translate(0.1, 1.2, 0), WOOL),
    part(new THREE.SphereGeometry(0.62, 10, 7).translate(-0.55, 1.22, 0), WOOL),
    part(new THREE.SphereGeometry(1, 10, 7).scale(0.4, 0.3, 0.27).translate(1.2, 1.45, 0), FACE),
    part(new THREE.BoxGeometry(0.14, 0.06, 0.62).translate(1.02, 1.6, 0), FACE), // ears
    leg(0.55, 0.3), leg(0.55, -0.3), leg(-0.6, 0.3), leg(-0.6, -0.3),
  ]);
}

/** Open, gentle, dry grass with no wood, road or water on it. */
function pasture(td: TerrainData, x: number, z: number) {
  return (
    x > 60 && x < MAP_W - 60 && z > 60 && z < MAP_H - 60 &&
    sampleHeight(td, x, z) > SEA_LEVEL + 2 &&
    sampleFeature(td, x, z, 0) < 0.03 && // forest
    sampleFeature(td, x, z, 1) < 0.15 && // road
    sampleFeature(td, x, z, 2) < 0.03 && // river
    sampleFeature(td, x, z, 3) < 0.2 && // marsh
    sampleUp(td, x, z) > 0.94
  );
}

/** Herd homes on a golden-angle spiral out from Hobbiton, beyond the village. */
function findPastures(td: TerrainData) {
  const hx = toWorldX(SITES.hobbiton.u);
  const hz = toWorldZ(SITES.hobbiton.v);
  const homes: { x: number; z: number }[] = [];
  for (let i = 0; i < 400 && homes.length < MAX_HERDS; i++) {
    const a = i * 2.39996;
    const r = 85 + 210 * ((i * 0.618034) % 1);
    const x = hx + Math.cos(a) * r;
    const z = hz + Math.sin(a) * r;
    const R = HERD_R + 6;
    if (!pasture(td, x, z) || !pasture(td, x + R, z) || !pasture(td, x - R, z) || !pasture(td, x, z + R) || !pasture(td, x, z - R)) continue;
    if (homes.some((h) => Math.hypot(h.x - x, h.z - z) < 70)) continue;
    homes.push({ x, z });
  }
  return homes;
}

interface Sheep {
  x: number; z: number; y: number;
  heading: number;
  tx: number; tz: number;
  /** seconds left grazing before it moves on */
  wait: number;
  /** 0 walking → 1 head down */
  graze: number;
}

function Sheep({ quality }: { quality: Quality }) {
  const geometry = useMemo(sheepGeometry, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), []);
  const mesh = useInstanced(geometry, material, MAX_HERDS * MAX_PER_HERD, true);

  // a little variety in the fleece, and the odd black sheep
  useEffect(() => {
    const r = rng(1937);
    const c = new THREE.Color();
    for (let i = 0; i < MAX_HERDS * MAX_PER_HERD; i++) {
      if (i % 9 === 4) c.setRGB(0.2, 0.17, 0.15);
      else c.setScalar(0.9 + r() * 0.1);
      mesh.setColorAt(i, c);
    }
    mesh.instanceColor!.needsUpdate = true;
  }, [mesh]);

  const sim = useMemo(
    () => ({ homes: null as { x: number; z: number }[] | null, sheep: [] as Sheep[], clock: 0 }),
    [],
  );

  useFrame(({ camera }, dtRaw) => {
    const td = terrainData();
    const life = alive();
    const hx = toWorldX(SITES.hobbiton.u);
    const hz = toWorldZ(SITES.hobbiton.v);
    mesh.visible = !!td && life > 0.01 && Math.hypot(camera.position.x - hx, camera.position.z - hz) < SHIRE_VIEW;
    if (!mesh.visible || !td) return;

    if (!sim.homes) {
      sim.homes = findPastures(td);
      const r = rng(4242);
      for (let h = 0; h < sim.homes.length; h++) {
        for (let j = 0; j < MAX_PER_HERD; j++) {
          const a = r() * Math.PI * 2;
          const d = Math.sqrt(r()) * HERD_R;
          const x = sim.homes[h].x + Math.cos(a) * d;
          const z = sim.homes[h].z + Math.sin(a) * d;
          sim.sheep.push({ x, z, y: sampleHeight(td, x, z), heading: r() * 6.28, tx: x, tz: z, wait: r() * 8, graze: 1 });
        }
      }
    }

    const dt = Math.min(dtRaw, 0.05);
    sim.clock += dt;
    const herds = Math.min(HERDS[quality], sim.homes.length);
    const per = PER_HERD[quality];
    const scale = SHEEP_SCALE * life;
    let n = 0;
    for (let h = 0; h < herds; h++) {
      // the herd's patch wanders a little over the days
      const cx = sim.homes[h].x + Math.cos(sim.clock * 0.012 + h * 1.3) * 10;
      const cz = sim.homes[h].z + Math.sin(sim.clock * 0.009 + h * 2.1) * 10;
      for (let j = 0; j < per; j++) {
        const s = sim.sheep[h * MAX_PER_HERD + j];
        if (s.wait > 0) {
          s.wait -= dt;
          s.graze = Math.min(1, s.graze + dt * 1.5);
        } else {
          s.graze = Math.max(0, s.graze - dt * 3);
          const dx = s.tx - s.x;
          const dz = s.tz - s.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.5) {
            s.wait = 4 + Math.random() * 12;
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * HERD_R;
            s.tx = cx + Math.cos(a) * r;
            s.tz = cz + Math.sin(a) * r;
          } else {
            s.heading += clamp(wrap(Math.atan2(dz, dx) - s.heading), -1, 1) * 2 * dt;
            const step = Math.min(d, dt); // an amble, a unit a second
            s.x += Math.cos(s.heading) * step;
            s.z += Math.sin(s.heading) * step;
            s.y = sampleHeight(td, s.x, s.z);
          }
        }
        // head down to the grass while grazing
        place(mesh, n++, s.x, s.y * morph.value, s.z, s.heading, -0.18 * s.graze, 0, scale);
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}

// ── ships ───────────────────────────────────────────────────────────────────
// White ships of the Elves under sail off the mouth of the Gulf of Lune, on
// gently wobbled loops — each checked against heightAt to keep at least five
// units of water under every part of the hull.

const SHIP_LOOPS = [
  { u: 0.19, v: 0.298, ax: 108, az: 46, dir: 1, at: 0, speed: 4.6 },
  { u: 0.19, v: 0.298, ax: 108, az: 46, dir: 1, at: Math.PI, speed: 4.6 },
  { u: 0.145, v: 0.325, ax: 150, az: 70, dir: -1, at: 1.3, speed: 5.2 },
];
const SHIPS = { high: 3, low: 2 };
const HAVENS_VIEW = 1400;

function sailGeometry() {
  // a square sail bellied forward by the wind astern
  const g = new THREE.PlaneGeometry(4.6, 5.4, 6, 6).rotateY(Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const w = p.getZ(i) / 2.3;
    const h = p.getY(i) / 2.7;
    p.setX(i, 0.9 * (1 - w * w) * (1 - h * h));
  }
  g.computeVertexNormals();
  return g.translate(0.7, 5.6, 0);
}

function shipGeometry() {
  const HULL = "#e4dfd2";
  const WOOD = "#8a6a44";
  const SAIL = "#f6f2e6";
  const GOLD = "#d4ad52";
  return merge([
    // hull: the lower half of a long ellipsoid, decked over
    part(new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(5.6, 1.5, 1.5).translate(0, 0.6, 0), HULL),
    part(new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2).scale(5.6, 1, 1.5).translate(0, 0.6, 0), WOOD),
    // a swan-necked prow and a curled stern
    part(new THREE.CylinderGeometry(0.14, 0.26, 2.8, 6).rotateZ(-0.55).translate(5.9, 1.6, 0), HULL),
    part(new THREE.SphereGeometry(0.3, 8, 6).translate(6.6, 2.85, 0), HULL),
    part(new THREE.ConeGeometry(0.12, 0.6, 5).rotateZ(-Math.PI / 2 - 0.3).translate(7.0, 2.8, 0), GOLD),
    part(new THREE.CylinderGeometry(0.12, 0.24, 2.2, 6).rotateZ(0.7).translate(-5.8, 1.4, 0), HULL),
    // mast, yard, sail and pennant
    part(new THREE.CylinderGeometry(0.1, 0.15, 9, 6).translate(0.4, 5.1, 0), WOOD),
    part(new THREE.CylinderGeometry(0.07, 0.07, 5, 5).rotateX(Math.PI / 2).translate(0.5, 8.5, 0), WOOD),
    part(sailGeometry(), SAIL),
    part(new THREE.ConeGeometry(0.22, 1.8, 4).rotateZ(Math.PI / 2).translate(-0.5, 9.7, 0), GOLD),
  ]);
}

function Ships({ quality }: { quality: Quality }) {
  const geometry = useMemo(shipGeometry, []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }),
    [],
  );
  const mesh = useInstanced(geometry, material, SHIP_LOOPS.length, true);
  const sim = useMemo(() => ({ theta: SHIP_LOOPS.map((l) => l.at), clock: 0 }), []);

  useFrame(({ camera }, dtRaw) => {
    const life = alive();
    const mx = toWorldX(0.2);
    const mz = toWorldZ(0.3);
    mesh.visible = life > 0.01 && Math.hypot(camera.position.x - mx, camera.position.z - mz) < HAVENS_VIEW;
    if (!mesh.visible) return;
    const dt = Math.min(dtRaw, 0.05);
    sim.clock += dt;
    const t = sim.clock;
    const sea = THREE.MathUtils.lerp(-3, SEA_LEVEL, morph.value);
    const count = SHIPS[quality];
    for (let i = 0; i < count; i++) {
      const L = SHIP_LOOPS[i];
      let th = sim.theta[i];
      // step by arc length, so a ship holds its speed round the tight ends
      const dx = L.ax * (-Math.sin(th) + 0.16 * Math.cos(2 * th));
      const dz = L.az * (Math.cos(th) - 0.3 * Math.sin(3 * th));
      th += (L.dir * L.speed * dt) / Math.hypot(dx, dz);
      sim.theta[i] = th;
      const x = toWorldX(L.u) + L.ax * (Math.cos(th) + 0.08 * Math.sin(2 * th));
      const z = toWorldZ(L.v) + L.az * (Math.sin(th) + 0.1 * Math.cos(3 * th));
      const heading = Math.atan2(dz * L.dir, dx * L.dir);
      // riding the swell
      const y = sea + Math.sin(t * 0.7 + i * 2) * 0.2;
      place(mesh, i, x, y, z, heading, Math.sin(t * 0.8 + i * 1.7) * 0.02, Math.sin(t * 0.55 + i) * 0.04, life);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}
