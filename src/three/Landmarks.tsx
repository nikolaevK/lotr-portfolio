"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { SEA_LEVEL, SITES, toWorldX, toWorldZ } from "@/data/content";
import { heightAt } from "@/three/noise";
import { morph } from "@/three/Terrain";
import { Plume } from "@/three/Particles";
import { Kit, disposeGroup, type UVScales } from "@/three/kit";
import { pbr, plain, surfaces } from "@/three/materials";
import { useGame } from "@/state/store";

/** Landmark point light — skipped on low quality (every light costs per-fragment
 *  work across the whole forward-rendered scene, terrain included). */
function Lamp(props: ThreeElements["pointLight"]) {
  const quality = useGame((s) => s.quality);
  if (quality === "low") return null;
  return <pointLight {...props} />;
}

// ── the shared palette of surfaces ──────────────────────────────────────────
// Tints multiply a greyscale albedo, so they run brighter than the colour you
// want out the other side. Everything here is merged per-key by the kit, so
// adding a material costs one draw call per landmark that uses it — keep the
// list short and lean on per-part tinting for variety.

let MATS: Record<string, THREE.Material> | null = null;

function mats() {
  if (MATS) return MATS;
  const s = surfaces();
  MATS = {
    // masonry
    stone: pbr(s.ashlar, "#b4aa9a", { metalness: 0.02 }),
    white: pbr(s.ashlar, "#efe9d8", { metalness: 0.04, envMapIntensity: 1.15 }),
    elf: pbr(s.ashlar, "#f3ecdb", { metalness: 0.1, roughness: 0.82, normalScale: 0.7, envMapIntensity: 1.3 }),
    dwarf: pbr(s.ashlar, "#8e8070", { metalness: 0.06, normalScale: 1.25 }),
    dark: pbr(s.rubble, "#6f6355", { normalScale: 1.15 }),
    ruin: pbr(s.rubble, "#a89e90"),
    rock: pbr(s.rock, "#9a8f7c"),
    black: pbr(s.ashlar, "#3a3330", { metalness: 0.4, roughness: 0.68, envMapIntensity: 1.5 }),
    obsidian: pbr(s.rock, "#241e1c", { metalness: 0.55, roughness: 0.42, normalScale: 0.6, envMapIntensity: 1.8 }),
    // carpentry & roofing
    timber: pbr(s.timber, "#c69a5e"),
    beam: pbr(s.timber, "#7a5a2e", { normalScale: 1.2 }),
    thatch: pbr(s.thatch, "#e2c07a", { normalScale: 1.3 }),
    slate: pbr(s.slate, "#a8b2bc", { metalness: 0.06, roughness: 0.9 }),
    // metals
    gold: pbr(s.metal, "#e8bb52", { metalness: 0.88, roughness: 0.42, envMapIntensity: 1.6 }),
    bronze: pbr(s.metal, "#a07a42", { metalness: 0.82, roughness: 0.5, envMapIntensity: 1.4 }),
    silver: pbr(s.metal, "#d6dae0", { metalness: 0.85, roughness: 0.34, envMapIntensity: 1.7 }),
    // organics
    turf: pbr(s.organic, "#9dbb62", { roughness: 1 }),
    earth: pbr(s.organic, "#9a7c54", { roughness: 1 }),
    bark: pbr(s.timber, "#8a6438", { normalScale: 1.4 }),
    paleBark: pbr(s.timber, "#dcd8cc", { normalScale: 0.9 }),
    leaf: pbr(s.organic, "#7d9c4c", { roughness: 1 }),
    darkLeaf: pbr(s.organic, "#4e6b3e", { roughness: 1 }),
    goldLeaf: pbr(s.organic, "#e8c05e", { roughness: 0.85, emissive: "#5a4210", emissiveIntensity: 0.4 }),
    paleLeaf: pbr(s.organic, "#eef0e2", { roughness: 0.9, emissive: "#4a4c3c", emissiveIntensity: 0.2 }),
    autumn: pbr(s.organic, "#dda45c", { roughness: 0.95 }),
    // flat props — `door` is white so per-part tints carry the colour
    door: plain("#ffffff", { roughness: 0.5, envMapIntensity: 1.2 }),
    brass: plain("#d8b04e", { roughness: 0.3, metalness: 0.8, envMapIntensity: 1.6 }),
    window: plain("#2c1f0d", { emissive: "#ffbf5e", emissiveIntensity: 1.8, roughness: 0.4 }),
    lava: plain("#2a1008", { emissive: "#ff4a12", emissiveIntensity: 2.6, roughness: 0.85 }),
    forge: plain("#241a12", { emissive: "#ff7a22", emissiveIntensity: 1.6, roughness: 0.8 }),
    water: plain("#6fa8b4", { roughness: 0.07, metalness: 0.1, envMapIntensity: 2.4 }),
    blackWater: plain("#16232a", { roughness: 0.05, metalness: 0.25, envMapIntensity: 2.6 }),
    cloth: plain("#f4efe2", { roughness: 0.85, side: THREE.DoubleSide }),
    clothGreen: plain("#3e6b34", { roughness: 0.85, side: THREE.DoubleSide }),
  };
  return MATS;
}

/** World units covered by one texture tile, per material. */
const UV: UVScales = {
  stone: 3.6, white: 3.6, elf: 4.2, dwarf: 4.4, dark: 3.2, ruin: 3.2, rock: 9,
  black: 4.6, obsidian: 7, timber: 2.6, beam: 2.2, thatch: 3.2, slate: 2.4,
  gold: 3, bronze: 3, silver: 3, turf: 7, earth: 7, bark: 1.8, paleBark: 1.8,
  leaf: 3.4, darkLeaf: 3.4, goldLeaf: 3.4, paleLeaf: 3.4, autumn: 3.4,
};

/** Build a landmark's static geometry once, merged down to a few draw calls. */
function useBuilt(build: (k: Kit) => void) {
  const group = useMemo(() => {
    const k = new Kit();
    build(k);
    return k.finish(mats(), UV);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => disposeGroup(group), [group]);
  return group;
}

const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

// beyond this the fog has mostly swallowed a landmark — skip its draw calls
const CULL_DIST_SQ = 1500 * 1500;

/** Anchors a landmark group to terrain height, rising with the morph. */
function Grounded({
  u, v, children, yOffset = 0,
}: { u: number; v: number; children: React.ReactNode; yOffset?: number }) {
  const ref = useRef<THREE.Group>(null);
  const x = toWorldX(u);
  const z = toWorldZ(v);
  const baseY = useMemo(() => heightAt(x, z), [x, z]);
  // manual matrix: once the morph settles, y stops changing and the whole
  // subtree skips its per-frame matrix recompute instead of being re-dirtied
  // 60 times a second by an unchanged position write
  useEffect(() => {
    ref.current?.updateMatrix();
  }, []);
  useFrame(({ camera }) => {
    const g = ref.current;
    if (!g) return;
    const dx = camera.position.x - x;
    const dz = camera.position.z - z;
    g.visible = morph.value > 0.02 && dx * dx + dz * dz < CULL_DIST_SQ;
    if (g.visible) {
      const y = baseY * morph.value + yOffset;
      if (y !== g.position.y) {
        g.position.y = y;
        g.updateMatrix();
      }
    }
  });
  return (
    <group ref={ref} position={[x, 0, z]} matrixAutoUpdate={false}>
      {children}
    </group>
  );
}

// ── shared props ────────────────────────────────────────────────────────────

/** A broadleaf tree: flared trunk, a few limbs, a clustered canopy. */
function tree(
  k: Kit,
  o: { x: number; z: number; s?: number; leaf?: string; bark?: string; seed?: number },
) {
  const s = o.s ?? 1;
  const leaf = o.leaf ?? "leaf";
  const bark = o.bark ?? "bark";
  const r = rng(o.seed ?? Math.round((o.x * 73 + o.z * 131 + 997) * 7) + 1);
  const trunkH = 6.4 * s;
  k.cyl(bark, 0.42 * s, 0.95 * s, trunkH, 8, { x: o.x, y: trunkH / 2, z: o.z });
  // root flare
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r();
    k.cone(bark, 0.34 * s, 1.5 * s, 5, {
      x: o.x + Math.cos(a) * 0.7 * s,
      y: 0.5 * s,
      z: o.z + Math.sin(a) * 0.7 * s,
      rx: Math.sin(a) * 0.5,
      rz: -Math.cos(a) * 0.5,
    });
  }
  // limbs
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.7;
    k.cyl(bark, 0.14 * s, 0.3 * s, 3.2 * s, 6, {
      x: o.x + Math.cos(a) * 0.9 * s,
      y: trunkH * 0.86,
      z: o.z + Math.sin(a) * 0.9 * s,
      rx: Math.sin(a) * 0.75,
      rz: -Math.cos(a) * 0.75,
    });
  }
  // canopy — several overlapping lobes read as foliage, one sphere reads as a lollipop
  const lobes: [number, number, number, number][] = [
    [0, 8.6, 0, 3.9], [1.9, 7.2, 1.0, 2.6], [-1.8, 7.6, -0.8, 2.4],
    [0.6, 10.0, -1.5, 2.2], [-1.1, 9.6, 1.6, 2.0],
  ];
  for (const [lx, ly, lz, lr] of lobes) {
    k.sphere(leaf, lr * s, 10, 8, {
      x: o.x + lx * s,
      y: ly * s,
      z: o.z + lz * s,
      s: [1, 0.82 + r() * 0.3, 1],
      shade: 0.86 + r() * 0.28,
    });
  }
}

/** A conifer — hollies of Eregion, the dead pines of Isengard. */
function conifer(k: Kit, o: { x: number; z: number; s?: number; leaf?: string; bark?: string }) {
  const s = o.s ?? 1;
  const leaf = o.leaf ?? "darkLeaf";
  k.cyl(o.bark ?? "bark", 0.26 * s, 0.55 * s, 5.4 * s, 7, { x: o.x, y: 2.7 * s, z: o.z });
  for (let i = 0; i < 4; i++) {
    k.cone(leaf, (2.7 - i * 0.6) * s, 3.0 * s, 9, {
      x: o.x, y: (5.2 + i * 1.9) * s, z: o.z, shade: 0.88 + i * 0.06,
    });
  }
}

/** A pitched-roof dwelling. Used across Rohan, Dale and the tiers of Gondor. */
function cottage(
  k: Kit,
  o: {
    x: number; z: number; a?: number; w?: number; d?: number; h?: number; s?: number;
    wall?: string; roof?: string; lit?: boolean;
  },
) {
  const s = o.s ?? 1;
  const w = (o.w ?? 4.4) * s;
  const d = (o.d ?? 3.2) * s;
  const h = (o.h ?? 2.6) * s;
  const a = o.a ?? 0;
  const wall = o.wall ?? "timber";
  const roof = o.roof ?? "thatch";
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  // local (dx, dz) → world, rotated about the cottage centre
  const px = (dx: number, dz: number) => o.x + dx * ca - dz * sa;
  const pz = (dx: number, dz: number) => o.z + dx * sa + dz * ca;

  k.box(wall, w, h, d, { x: o.x, y: h / 2, z: o.z, ry: -a });
  // corner posts read as timber framing
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      k.box("beam", 0.22 * s, h, 0.22 * s, { x: px(sx * w * 0.48, sz * d * 0.48), y: h / 2, z: pz(sx * w * 0.48, sz * d * 0.48), ry: -a });
    }
  }
  // gable roof: two slopes plus the end triangles
  const pitch = 0.72;
  const slope = (d / 2) / Math.cos(pitch);
  for (const sz of [-1, 1]) {
    k.box(roof, w + 0.9 * s, 0.34 * s, slope * 2.05, {
      x: px(0, (sz * d) / 4),
      y: h + (Math.tan(pitch) * d) / 4,
      z: pz(0, (sz * d) / 4),
      ry: -a,
      rx: sz * pitch,
    });
  }
  for (const sx of [-1, 1]) {
    k.wedge(wall, d, Math.tan(pitch) * d, 0.3 * s, {
      x: px((sx * w) / 2, 0),
      y: h + (Math.tan(pitch) * d) / 2,
      z: pz((sx * w) / 2, 0),
      ry: -a + Math.PI / 2,
    });
  }
  // ridge
  k.box("beam", w + 0.4 * s, 0.2 * s, 0.24 * s, { x: o.x, y: h + (Math.tan(pitch) * d) / 2, z: o.z, ry: -a });
  // chimney
  k.box("stone", 0.6 * s, 2.4 * s, 0.6 * s, { x: px(w * 0.3, d * 0.2), y: h + 1.1 * s, z: pz(w * 0.3, d * 0.2), ry: -a });
  // door and a lit window
  k.box("beam", 0.9 * s, 1.6 * s, 0.14 * s, { x: px(0, d * 0.5), y: 0.8 * s, z: pz(0, d * 0.5), ry: -a });
  if (o.lit !== false) {
    k.box("window", 0.55 * s, 0.55 * s, 0.1 * s, { x: px(w * 0.28, d * 0.52), y: h * 0.62, z: pz(w * 0.28, d * 0.52), ry: -a, flat: true });
  }
}

// ── The Shire: Hobbiton on the Hill ─────────────────────────────────────────

/** A round green door set into a mound, with its windows, stoop and lamp. */
function hobbitHole(
  k: Kit,
  o: { x: number; z: number; a: number; r: number; s?: number; door: string; wins?: number },
) {
  // `door` is a colour: the door material is white so the tint does the work
  const s = o.s ?? 1;
  const dx = o.x + Math.cos(o.a) * o.r;
  const dz = o.z + Math.sin(o.a) * o.r;
  const ry = -o.a + Math.PI / 2;
  const ca = Math.cos(o.a);
  const sa = Math.sin(o.a);
  // a point `out` units further from the mound centre and `side` along the face
  const at = (side: number, out: number): [number, number] => [
    dx + ca * out - sa * side,
    dz + sa * out + ca * side,
  ];

  // recessed porch cut into the turf
  const [bx, bz] = at(0, -0.5 * s);
  k.cyl("earth", 2.9 * s, 3.1 * s, 1.2 * s, 16, { x: bx, y: 2.3 * s, z: bz, rx: Math.PI / 2, ry });
  // door frame, leaf and knob
  k.add("beam", new THREE.TorusGeometry(2.2 * s, 0.26 * s, 8, 24), { x: dx, y: 2.3 * s, z: dz, ry });
  const [px0, pz0] = at(0, 0.06 * s);
  k.cyl("door", 2.16 * s, 2.16 * s, 0.22 * s, 22, { x: px0, y: 2.3 * s, z: pz0, rx: Math.PI / 2, ry, tint: o.door });
  const [kx, kz] = at(0.72 * s, 0.24 * s);
  k.sphere("brass", 0.17 * s, 8, 6, { x: kx, y: 2.3 * s, z: kz });
  // stone step and a path away from the door
  const [sx0, sz0] = at(0, 1.5 * s);
  k.box("stone", 3.6 * s, 0.4 * s, 1.6 * s, { x: sx0, y: 0.22 * s, z: sz0, ry });
  for (let i = 0; i < 4; i++) {
    const [gx, gz] = at((i % 2 ? 0.5 : -0.5) * s, (2.6 + i * 1.5) * s);
    k.cyl("stone", 0.7 * s, 0.72 * s, 0.18 * s, 7, { x: gx, y: 0.1, z: gz, shade: 1.05 });
  }
  // round windows either side
  const n = o.wins ?? 2;
  for (let i = 0; i < n; i++) {
    const side = (i === 0 ? -1 : 1) * 4.5 * s;
    const [wx, wz] = at(side, -0.35 * s);
    k.add("beam", new THREE.TorusGeometry(0.9 * s, 0.2 * s, 6, 16), { x: wx, y: 2.6 * s, z: wz, ry });
    const [gx, gz] = at(side, -0.2 * s);
    k.cyl("window", 0.86 * s, 0.86 * s, 0.1 * s, 14, { x: gx, y: 2.6 * s, z: gz, rx: Math.PI / 2, ry, flat: true });
  }
}

function buildHobbiton(k: Kit) {
  const r = rng(4711);
  // the Hill and Bagshot Row: two turfed mounds
  k.sphere("turf", 18, 26, 16, { y: 2.0, s: [1, 0.78, 1] }, Math.PI * 2, 0, Math.PI / 2);
  k.sphere("turf", 11, 20, 12, { x: -16, y: 1.0, z: -12, s: [1, 0.82, 1] }, Math.PI * 2, 0, Math.PI / 2);

  // radii sit just proud of the mound's surface (r 18, squashed to 0.78) —
  // any less and the door is buried inside the hill it belongs to
  const doors = [
    { a: 0.1, door: "#5c8f34", r: 17.9 },
    { a: 1.25, door: "#d0a244", r: 17.8 },
    { a: 2.35, door: "#9c3624", r: 17.9 },
    { a: 3.6, door: "#46688c", r: 17.7 },
    { a: 4.9, door: "#c8a03c", r: 17.9 },
  ];
  for (const d of doors) hobbitHole(k, { x: 0, z: 0, a: d.a, r: d.r, door: d.door });
  // Bagshot Row — smaller doors in the lower mound
  const row = ["#9c3624", "#5c8f34", "#d0a244"];
  row.forEach((door, i) => {
    hobbitHole(k, { x: -16, z: -12, a: 0.5 + i, r: 10.9, s: 0.62, door, wins: 1 });
  });

  // chimney pots on the crown of the Hill
  for (const [cx, cy, cz] of [[4, 13.2, -3], [-8, 10.4, 7], [-16, 8.4, -12]] as const) {
    k.cyl("stone", 0.55, 0.75, 3.2, 8, { x: cx, y: cy, z: cz });
    k.cyl("stone", 0.68, 0.6, 0.4, 8, { x: cx, y: cy + 1.8, z: cz });
  }

  // the Water: mill pond, sluice and the arched stone bridge. The pond sits
  // slightly sunk rather than on a pad — a raised disc reads as a brown plate
  // the moment the ground beneath it is not perfectly level.
  k.cyl("water", 9, 9, 0.4, 24, { x: 30, y: 0.15, z: 24, flat: true });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    k.add("earth", new THREE.DodecahedronGeometry(0.9 + (i % 3) * 0.4, 0), {
      x: 30 + Math.cos(a) * 9.2, y: 0.2, z: 24 + Math.sin(a) * 9.2, ry: a, shade: 0.94,
    });
  }
  k.archBand("stone", 4.6, 1.1, 4.6, { x: 24, y: 0.4, z: 15, ry: 0.75 });
  k.box("stone", 12.5, 0.6, 5.0, { x: 24, y: 5.4, z: 15, ry: 0.75 });
  for (let i = 0; i < 6; i++) {
    k.cyl("stone", 0.2, 0.24, 1.1, 6, {
      x: 24 + Math.cos(0.75) * (i - 2.5) * 2.1 - Math.sin(0.75) * 2.3,
      y: 6.1,
      z: 15 + Math.sin(0.75) * (i - 2.5) * 2.1 + Math.cos(0.75) * 2.3,
    });
  }

  // the mill: stone tower, thatch cap, sluice race (the wheel spins separately)
  k.cyl("stone", 3.4, 4.2, 11, 14, { x: 26, y: 5.5, z: 14, ry: -0.7 });
  k.cone("thatch", 4.8, 4.6, 14, { x: 26, y: 12.4, z: 14 });
  k.box("window", 1.0, 1.2, 0.2, { x: 29.2, y: 7, z: 15.6, ry: -0.7, flat: true });
  k.box("beam", 1.2, 0.5, 7.2, { x: 30.2, y: 5.6, z: 14.6, ry: -0.7 });

  // garden fence and hedges
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const rad = 24 + (i % 3);
    k.box("beam", 0.24, 1.9, 0.24, { x: Math.cos(a) * rad, y: 0.95, z: Math.sin(a) * rad });
    if (i % 2 === 0) {
      const a2 = a + Math.PI / 26;
      k.box("beam", 2.0, 0.14, 0.1, {
        x: Math.cos(a2) * rad, y: 1.4, z: Math.sin(a2) * rad, ry: -a2 + Math.PI / 2,
      });
    }
  }
  // vegetable rows behind the fence
  for (let i = 0; i < 5; i++) {
    k.box("earth", 7.5, 0.35, 1.1, { x: 6 + i * 0.4, y: 0.18, z: 19 + i * 1.9, ry: 0.2, shade: 0.9 });
    k.box("leaf", 7.0, 0.5, 0.7, { x: 6 + i * 0.4, y: 0.5, z: 19 + i * 1.9, ry: 0.2, shade: 0.9 + r() * 0.2 });
  }

  tree(k, { x: -24, z: 8, s: 2.3 });
  tree(k, { x: 20, z: -14, s: 1.5 });
  tree(k, { x: 8, z: 26, s: 1.7 });
  tree(k, { x: -6, z: -24, s: 1.2 });
  tree(k, { x: -30, z: -18, s: 1.4 });
}

function Hobbiton() {
  const built = useBuilt(buildHobbiton);
  const wheel = useRef<THREE.Group>(null);
  const wheelGeo = useMemo(() => {
    const k = new Kit();
    k.aoDepth = 0;
    k.add("beam", new THREE.TorusGeometry(3.0, 0.34, 6, 18), { flat: true });
    k.add("beam", new THREE.TorusGeometry(2.2, 0.22, 6, 16), { flat: true });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      k.box("beam", 0.9, 0.7, 0.22, { x: Math.cos(a) * 2.6, y: Math.sin(a) * 2.6, z: 0, rz: a, flat: true });
      k.box("beam", 0.2, 6.0, 0.18, { rz: a, flat: true });
    }
    return k.finish(mats(), UV);
  }, []);
  useEffect(() => () => disposeGroup(wheelGeo), [wheelGeo]);
  useFrame((_, dt) => {
    if (wheel.current) wheel.current.rotation.z -= dt * 0.5;
  });

  return (
    <Grounded u={SITES.hobbiton.u} v={SITES.hobbiton.v}>
      <primitive object={built} />
      <group ref={wheel} position={[30.6, 3.4, 15.6]} rotation={[0, -0.7, 0]}>
        <primitive object={wheelGeo} />
      </group>
      {[[4, 15.4, -3], [-8, 12.6, 7], [-16, 10.6, -12]].map(([cx, cy, cz], i) => (
        <Plume key={i} position={[cx, cy, cz]} color="#c9c2b4" count={22} spread={1} height={32} size={2.4} rise={6} additive={false} opacity={0.32} />
      ))}
      <Lamp color="#ffd9a0" intensity={26} distance={54} position={[10, 6, 10]} decay={2} />
    </Grounded>
  );
}

// ── Rivendell & Lothlórien ──────────────────────────────────────────────────

/** An elven hall: arcaded ground floor, deep-eaved roof, gilded ridge. */
function elfHall(
  k: Kit,
  o: { x: number; z: number; y?: number; w: number; d: number; h: number; a?: number },
) {
  const y = o.y ?? 0;
  const a = o.a ?? 0;
  k.box("elf", o.w, o.h, o.d, { x: o.x, y: y + o.h / 2, z: o.z, ry: -a });
  // arcade along the sunward face
  const n = Math.max(3, Math.round(o.w / 2.4));
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const face = o.d / 2 + 0.9;
  k.colonnade("elf", {
    from: [o.x + (-o.w / 2 + 1.1) * ca - face * sa, o.z + (-o.w / 2 + 1.1) * sa + face * ca],
    to: [o.x + (o.w / 2 - 1.1) * ca - face * sa, o.z + (o.w / 2 - 1.1) * sa + face * ca],
    count: n,
    y,
    h: o.h,
    r: 0.26,
  });
  // eaves + steep slate roof with a gilded ridge
  k.box("beam", o.w + 3.0, 0.5, o.d + 3.2, { x: o.x, y: y + o.h + 0.25, z: o.z, ry: -a });
  const pitch = 0.82;
  const rise = Math.tan(pitch) * (o.d / 2 + 1.4);
  for (const sz of [-1, 1]) {
    k.box("slate", o.w + 2.6, 0.3, ((o.d / 2 + 1.6) / Math.cos(pitch)) * 2.0, {
      x: o.x - sz * ((o.d / 4 + 0.7) * sa),
      y: y + o.h + 0.5 + rise / 2,
      z: o.z + sz * ((o.d / 4 + 0.7) * ca),
      ry: -a,
      rx: sz * pitch,
    });
  }
  k.box("gold", o.w + 2.4, 0.22, 0.3, { x: o.x, y: y + o.h + 0.5 + rise, z: o.z, ry: -a });
  for (const sx of [-1, 1]) {
    k.wedge("elf", o.d + 2.8, rise, 0.35, {
      x: o.x + ((sx * o.w) / 2) * ca, y: y + o.h + 0.5 + rise / 2, z: o.z + ((sx * o.w) / 2) * sa,
      ry: -a + Math.PI / 2,
    });
  }
  // lit windows on the upper storey
  for (let i = 0; i < n - 1; i++) {
    const t = (i + 0.5) / (n - 1) - 0.5;
    k.box("window", 0.5, 1.1, 0.12, {
      x: o.x + t * (o.w - 2) * ca - (o.d / 2 + 0.05) * sa,
      y: y + o.h * 0.62,
      z: o.z + t * (o.w - 2) * sa + (o.d / 2 + 0.05) * ca,
      ry: -a,
      flat: true,
    });
  }
}

/** A slender elven spire with a conical cap. */
function elfSpire(k: Kit, o: { x: number; z: number; h: number; s?: number }) {
  const s = o.s ?? 1;
  k.cyl("elf", 1.3 * s, 2.2 * s, o.h, 10, { x: o.x, y: o.h / 2, z: o.z });
  k.cyl("elf", 2.0 * s, 2.0 * s, 0.6 * s, 10, { x: o.x, y: o.h * 0.6, z: o.z });
  k.add("gold", new THREE.TorusGeometry(1.75 * s, 0.13 * s, 6, 18), { x: o.x, y: o.h - 1.4 * s, z: o.z, rx: Math.PI / 2 });
  k.cone("slate", 2.3 * s, 6.4 * s, 10, { x: o.x, y: o.h + 3.0 * s, z: o.z });
  k.cone("gold", 0.28 * s, 1.5 * s, 6, { x: o.x, y: o.h + 6.6 * s, z: o.z });
  for (const f of [0.3, 0.55, 0.8]) {
    k.box("window", 0.42 * s, 0.95 * s, 0.12 * s, { x: o.x, y: o.h * f, z: o.z + 1.9 * s, flat: true });
  }
}

function buildRivendell(k: Kit) {
  // the Last Homely House — terraced halls stepping up the valley side
  elfHall(k, { x: 0, z: 0, w: 17, d: 10, h: 5.0 });
  elfHall(k, { x: -3.5, z: -3, y: 6.6, w: 12, d: 7.5, h: 4.2, a: 0.1 });
  elfHall(k, { x: -6, z: 1.5, y: 12.0, w: 8, d: 5.6, h: 3.6, a: -0.15 });
  elfSpire(k, { x: 10, z: -6, h: 17, s: 0.8 });
  elfSpire(k, { x: -12, z: 7, h: 13, s: 0.68 });
  // terrace balustrade
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    k.cyl("elf", 0.13, 0.16, 1.0, 6, { x: -9 + t * 20, y: 0.5, z: 8.4 });
  }
  k.box("elf", 20.4, 0.24, 0.5, { x: 1, y: 1.1, z: 8.4 });
  k.box("elf", 21, 1.0, 3.0, { x: 1, y: -0.5, z: 7.2 });
  // arched bridge over the Bruinen
  k.archBand("elf", 8.4, 1.0, 3.6, { x: 15, y: 1.4, z: 11, ry: 0.6 });
  k.box("elf", 18, 0.5, 3.8, { x: 15, y: 10.0, z: 11, ry: 0.6 });
  // autumn beeches of the valley
  tree(k, { x: -17, z: -9, s: 1.4, leaf: "autumn" });
  tree(k, { x: 19, z: 3, s: 1.2, leaf: "autumn" });
  tree(k, { x: 7, z: 15, s: 1.1, leaf: "autumn" });
  tree(k, { x: -20, z: 12, s: 1.0, leaf: "autumn" });
}

function Waterfall() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            float stripe = sin((vUv.y * 26.0 + uTime * 3.2) + sin(vUv.x * 20.0) * 1.4) * 0.5 + 0.5;
            float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
            float a = (0.35 + stripe * 0.4) * edge;
            vec3 col = mix(vec3(0.75, 0.85, 0.88), vec3(0.95, 0.99, 1.0), stripe);
            gl_FragColor = vec4(col, a * 0.8);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt;
  });
  return (
    <group>
      <mesh material={mat} position={[-10, 11, 10]} rotation={[0, 0.9, 0]}>
        <planeGeometry args={[7, 24, 1, 1]} />
      </mesh>
      <Plume position={[-12, 0.5, 13]} color="#eef4f4" count={26} spread={3.4} height={9} size={4} rise={3} additive={false} opacity={0.3} />
    </group>
  );
}

function buildLorien(k: Kit) {
  // mallorns: silver trunks, golden canopies, talan platforms among the boughs
  const trees: [number, number, number][] = [
    [0, 0, 4.6], [16, 9, 3.4], [-14, 12, 3.6], [4, -16, 3.0], [-9, -11, 2.6], [18, -7, 2.3], [-20, -3, 2.0],
  ];
  for (const [x, z, s] of trees) {
    tree(k, { x, z, s, leaf: "goldLeaf", bark: "paleBark" });
    if (s > 3) {
      const flet = s * 4.4;
      k.cyl("paleBark", s * 0.85, s * 0.85, 0.34, 12, { x, y: flet, z });
      // railing round the flet
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        k.cyl("paleBark", 0.08, 0.1, 0.9, 5, { x: x + Math.cos(a) * s * 0.78, y: flet + 0.6, z: z + Math.sin(a) * s * 0.78 });
      }
      k.add("paleBark", new THREE.TorusGeometry(s * 0.78, 0.07, 5, 18), { x, y: flet + 1.05, z, rx: Math.PI / 2 });
      // a winding stair round the trunk
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2.4;
        k.box("paleBark", 1.5, 0.16, 0.6, {
          x: x + Math.cos(a) * s * 0.85, y: (i / 14) * flet, z: z + Math.sin(a) * s * 0.85, ry: -a,
        });
      }
    }
    k.sphere("window", 0.34, 7, 6, { x: x + 1.5, y: s * 6.4, z: z + 1, flat: true });
  }
}

function Rivendell() {
  const rivendell = useBuilt(buildRivendell);
  const lorien = useBuilt(buildLorien);
  return (
    <>
      <Grounded u={SITES.rivendell.u} v={SITES.rivendell.v}>
        <primitive object={rivendell} />
        <Waterfall />
        <Lamp color="#ffe9b0" intensity={70} distance={78} position={[0, 16, 0]} decay={2} />
      </Grounded>
      <Grounded u={SITES.lorien.u} v={SITES.lorien.v}>
        <primitive object={lorien} />
        <Lamp color="#ffd76a" intensity={90} distance={96} position={[0, 22, 0]} decay={2} />
      </Grounded>
    </>
  );
}

// ── Erebor: the Front Gate under the Lonely Mountain ────────────────────────

function makeRuneTexture() {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 64;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 512, 64);
  ctx.strokeStyle = "#ffb45e";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  const rand = rng(77);
  for (let i = 0; i < 16; i++) {
    const x0 = 18 + i * 30;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const x1 = x0 + rand() * 18 - 4;
      const y1 = 10 + rand() * 44;
      const x2 = x0 + rand() * 18 - 4;
      const y2 = 10 + rand() * 44;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A colossal dwarf-king hewn from the mountain, axe grounded before him. */
function dwarfColossus(k: Kit, o: { x: number; z: number; s: number; a?: number }) {
  const s = o.s;
  const a = o.a ?? 0;
  const g = (dx: number, dy: number, dz: number, extra: Partial<{ ry: number }> = {}) => ({
    x: o.x + dx * s * Math.cos(a) - dz * s * Math.sin(a),
    y: dy * s,
    z: o.z + dx * s * Math.sin(a) + dz * s * Math.cos(a),
    ry: -a + (extra.ry ?? 0),
  });
  // plinth and boots
  k.box("dwarf", 5.4 * s, 2.0 * s, 4.6 * s, g(0, 1.0, 0));
  k.box("dwarf", 4.6 * s, 1.0 * s, 3.9 * s, g(0, 2.5, 0));
  for (const sx of [-1, 1]) k.box("dark", 1.5 * s, 1.6 * s, 2.4 * s, g(sx * 1.05, 3.8, 0.2));
  // legs, belted tunic, chest
  for (const sx of [-1, 1]) k.cyl("dark", 0.85 * s, 1.0 * s, 3.6 * s, 8, g(sx * 1.0, 6.4, 0));
  k.box("dwarf", 4.3 * s, 4.4 * s, 3.0 * s, g(0, 10.2, 0));
  k.box("bronze", 4.5 * s, 0.7 * s, 3.2 * s, g(0, 8.4, 0));
  k.box("dwarf", 5.0 * s, 3.6 * s, 3.2 * s, g(0, 13.6, 0));
  // pauldrons and arms
  for (const sx of [-1, 1]) {
    k.sphere("bronze", 1.35 * s, 10, 8, g(sx * 2.4, 14.8, 0));
    k.cyl("dark", 0.72 * s, 0.86 * s, 4.6 * s, 8, g(sx * 2.5, 12.2, 0.35));
  }
  // beard, face, helm
  k.cone("dwarf", 1.9 * s, 3.6 * s, 8, { ...g(0, 14.6, 1.0), rx: Math.PI });
  k.box("dwarf", 2.2 * s, 2.0 * s, 2.0 * s, g(0, 16.4, 0));
  k.box("bronze", 2.7 * s, 1.2 * s, 2.5 * s, g(0, 17.7, 0));
  k.cone("bronze", 1.5 * s, 1.9 * s, 8, g(0, 18.9, 0));
  for (const sx of [-1, 1]) k.cone("bronze", 0.42 * s, 1.9 * s, 6, { ...g(sx * 1.4, 18.0, 0), rz: sx * 1.5 });
  // the great axe, hafted and grounded
  k.cyl("beam", 0.28 * s, 0.32 * s, 15.5 * s, 7, g(0, 7.8, 2.4));
  k.box("silver", 0.4 * s, 2.6 * s, 3.4 * s, g(0, 14.6, 2.4));
  k.cone("silver", 1.7 * s, 2.2 * s, 4, { ...g(0, 15.9, 3.5), rx: Math.PI / 2, rz: Math.PI / 2 });
}

function buildErebor(k: Kit) {
  const S = 1.35;
  // Erebor is anchored on the shoulder of a steep peak, so everything needs a
  // foundation that runs well below the anchor — otherwise the gate hangs in
  // the air over ground that has already fallen away toward Dale.
  k.box("dwarf", 33 * S, 48 * S, 22 * S, { y: -24 * S + 1, z: 2 * S, shade: 0.8 });
  k.box("rock", 46 * S, 40 * S, 14 * S, { y: -21 * S, z: -5 * S, shade: 0.85 });
  // the mountain's shoulders framing the gate
  k.box("rock", 16 * S, 60 * S, 12 * S, { x: -20 * S, y: 8 * S, z: -8 * S, ry: 0.2, shade: 0.92 });
  k.box("rock", 15 * S, 56 * S, 12 * S, { x: 21 * S, y: 6 * S, z: -9 * S, ry: -0.16, shade: 0.95 });
  // the gate front: a carved cliff face with a great arched mouth
  k.archWall("dwarf", 34 * S, 30 * S, 7 * S, 13 * S, 20 * S, 0, { y: 15 * S });
  k.archBand("dwarf", 6.6 * S, 1.9 * S, 8.4 * S, { y: 13.4 * S, z: 0.4 * S });
  // stepped battlement crown, each course narrower
  k.box("dwarf", 30 * S, 3.0 * S, 8.2 * S, { y: 31.4 * S });
  k.box("dwarf", 24 * S, 2.6 * S, 7.4 * S, { y: 34.4 * S });
  k.box("dwarf", 17 * S, 2.2 * S, 6.6 * S, { y: 37.0 * S });
  k.merlonLine("dwarf", { from: [-14 * S, 3.6 * S], to: [14 * S, 3.6 * S], y: 32.9 * S, count: 13, w: 1.5 * S, h: 1.8 * S, d: 1.2 * S });
  // fluted pilasters flanking the mouth
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      k.cyl("dwarf", 1.05 * S, 1.25 * S, 26 * S, 8, { x: sx * (9.4 + i * 2.3) * S, y: 13 * S, z: 3.4 * S });
      k.box("bronze", 2.8 * S, 0.7 * S, 2.8 * S, { x: sx * (9.4 + i * 2.3) * S, y: 26.4 * S, z: 3.4 * S });
    }
  }
  // the doors themselves, seamed with forge-light
  k.box("dark", 11.4 * S, 17.4 * S, 2.2 * S, { y: 8.7 * S, z: 1.2 * S });
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      k.box("bronze", 0.5 * S, 16.0 * S, 0.4 * S, { x: sx * (1.6 + i * 1.5) * S, y: 8.7 * S, z: 2.4 * S });
    }
  }
  k.box("forge", 1.1 * S, 16.4 * S, 0.5 * S, { y: 8.7 * S, z: 2.5 * S, flat: true });
  // causeway with balustrade and brazier plinths — carried on a deep viaduct
  // wall so it lands on the slope instead of ending in mid-air
  k.box("dwarf", 11 * S, 1.6 * S, 22 * S, { y: 0.8 * S, z: 13 * S });
  k.box("dwarf", 7.5 * S, 40 * S, 17 * S, { y: -20 * S, z: 12 * S, shade: 0.82 });
  k.box("dwarf", 9.5 * S, 6 * S, 19 * S, { y: -3 * S, z: 12.5 * S, shade: 0.88 });
  for (const sx of [-1, 1]) {
    k.box("dwarf", 0.9 * S, 1.5 * S, 22 * S, { x: sx * 5.4 * S, y: 2.3 * S, z: 13 * S });
    for (let i = 0; i < 6; i++) {
      k.box("dwarf", 1.5 * S, 0.5 * S, 1.5 * S, { x: sx * 5.4 * S, y: 3.3 * S, z: (4 + i * 4.0) * S });
    }
    k.cyl("dark", 0.9 * S, 1.3 * S, 4.8 * S, 8, { x: sx * 6.6 * S, y: 2.4 * S, z: 10 * S });
    k.cyl("bronze", 1.5 * S, 1.0 * S, 1.3 * S, 10, { x: sx * 6.6 * S, y: 5.4 * S, z: 10 * S });
  }
  // the guardians stand clear of the gate face, out on the causeway shoulders,
  // or they merge into the cliff behind them and read as pilasters
  dwarfColossus(k, { x: -21 * S, z: 13 * S, s: 1.45 * S, a: 0.3 });
  dwarfColossus(k, { x: 21 * S, z: 13 * S, s: 1.45 * S, a: -0.3 });
}

function buildDale(k: Kit) {
  const r = rng(1919);
  // broken towers and roofless halls in the mountain's shadow
  const towers: [number, number, number, number][] = [
    [0, 0, 8.5, 2.4], [9, 4, 5.4, 1.9], [-7, 6, 6.4, 2.1], [4, -9, 4.2, 1.7], [-12, -4, 3.4, 1.5],
  ];
  for (const [x, z, h, rad] of towers) {
    const lean = (r() - 0.5) * 0.14;
    k.cyl("ruin", rad * 0.84, rad, h, 10, { x, y: h / 2, z, rz: lean }, true);
    // a jagged crown of broken courses
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      if (r() < 0.3) continue;
      k.box("ruin", 0.7, 0.5 + r() * 1.4, 1.2, {
        x: x + Math.cos(a) * rad * 0.9, y: h + 0.4, z: z + Math.sin(a) * rad * 0.9, ry: -a, rz: lean,
      });
    }
    if (r() > 0.4) k.archWall("ruin", rad * 1.9, h * 0.6, 0.7, rad * 0.8, h * 0.4, 0, { x, y: h * 0.3, z: z + rad * 0.9 });
  }
  for (const [wx, wz, wr] of [[-4, -5, 0.5], [4, -3, -0.3], [12, 0, 0.8], [-11, 2, -0.6], [7, 9, 0.25]] as const) {
    k.box("ruin", 6.5, 1.7 + r() * 1.4, 1.0, { x: wx, y: 0.9, z: wz, ry: wr });
    k.box("ruin", 1.4, 0.9, 1.2, { x: wx + Math.cos(wr) * 3.6, y: 0.45, z: wz + Math.sin(wr) * 3.6, ry: r() * 3 });
  }
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const d = 8 + r() * 14;
    k.add("ruin", new THREE.DodecahedronGeometry(0.5 + r() * 1.1, 0), {
      x: Math.cos(a) * d, y: 0.5, z: Math.sin(a) * d, rx: r() * 3, ry: r() * 3,
    });
  }
}

function Erebor() {
  const gate = useBuilt(buildErebor);
  const dale = useBuilt(buildDale);
  const runeTex = useMemo(makeRuneTexture, []);
  const runeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#241a12",
        emissive: "#ff9a3e",
        emissiveIntensity: 1.4,
        emissiveMap: runeTex,
        roughness: 0.8,
      }),
    [runeTex],
  );
  useEffect(() => () => { runeMat.dispose(); runeTex.dispose(); }, [runeMat, runeTex]);

  return (
    <>
      <Grounded u={SITES.erebor.u} v={SITES.erebor.v}>
        <primitive object={gate} />
        <mesh material={runeMat} position={[0, 33.5, 4.8]}>
          <planeGeometry args={[24, 3.4]} />
        </mesh>
        {[-1, 1].map((s2) => (
          <Plume key={s2} position={[s2 * 8.9, 7.9, 13.5]} color="#ffa63e" count={30} spread={0.9} height={9} size={2.6} rise={9} opacity={0.8} />
        ))}
        <Lamp color="#ff8a2e" intensity={160} distance={80} position={[0, 11, 10]} decay={1.8} />
      </Grounded>
      <Grounded u={0.670} v={0.200}>
        <Plume position={[0, 0, 0]} color="#8a8178" count={70} spread={6} height={110} size={4.4} rise={11} additive={false} opacity={0.4} />
      </Grounded>
      {/* Dale stands down the valley, clear of the gate's apron */}
      <Grounded u={0.6605} v={0.2665}>
        <primitive object={dale} />
      </Grounded>
    </>
  );
}

// ── Minas Tirith: seven circles of white stone ──────────────────────────────

const MT_TIERS = [26, 22.4, 19.0, 15.8, 12.8, 10.0, 7.4];
const MT_RISE = 5.2;

function buildMinasTirith(k: Kit) {
  const r = rng(3107);
  // The hill the city is built on. It has to run deep — a shallow flared drum
  // shows its underside as a dark saucer the moment the ground falls away —
  // and it has to be coarsely faceted with crags at its foot, or the exposed
  // part reads as a concrete dam rather than the spur of Mindolluin.
  k.cyl("rock", 26.6, 38, 54, 11, { y: -26, shade: 0.92 });
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + r() * 0.3;
    const s = 3.5 + r() * 7;
    const drop = r() * 22;
    k.add("rock", new THREE.DodecahedronGeometry(s, 0), {
      x: Math.cos(a) * (28 + r() * 6),
      y: -2 - drop,
      z: Math.sin(a) * (28 + r() * 6),
      rx: r() * 3, ry: r() * 3, rz: r() * 3,
      shade: 0.82 + r() * 0.42,
    });
  }

  MT_TIERS.forEach((rad, i) => {
    const y = i * MT_RISE;
    const gate = i * 2.4 + 0.35; // gates alternate round the circuit
    // wall drum with a battered base
    k.cyl("white", rad, rad + 0.85, MT_RISE, 44, { y: y + MT_RISE / 2 });
    k.cyl("white", rad + 1.0, rad + 1.5, 0.9, 44, { y: y + 0.45, shade: 0.94 });
    // string course + crenellated parapet
    k.add("white", new THREE.TorusGeometry(rad + 0.3, 0.3, 6, 40), { y: y + MT_RISE, rx: Math.PI / 2 });
    k.merlonRing("white", {
      r: rad - 0.2, y: y + MT_RISE, count: Math.round(rad * 2.4), w: 1.0, h: 1.15, d: 0.85,
      gapAt: gate, gapArc: 0.26,
    });
    // buttresses
    for (let b = 0; b < 8; b++) {
      const a = (b / 8) * Math.PI * 2 + i * 0.3;
      if (Math.abs(Math.atan2(Math.sin(a - gate), Math.cos(a - gate))) < 0.3) continue;
      k.box("white", 1.1, MT_RISE * 0.92, 1.6, {
        x: Math.cos(a) * (rad + 0.6), y: y + MT_RISE * 0.46, z: Math.sin(a) * (rad + 0.6), ry: -a,
        shade: 0.96,
      });
    }
    // the tier's gate, with a tower to either side
    k.archWall("white", 5.4, MT_RISE + 1.2, 2.2, 2.4, 3.4, 0, {
      x: Math.cos(gate) * rad, y: y + (MT_RISE + 1.2) / 2, z: Math.sin(gate) * rad, ry: -gate + Math.PI / 2,
    });
    for (const sg of [-1, 1]) {
      const ga = gate + (sg * 3.4) / rad;
      k.cyl("white", 1.5, 1.75, MT_RISE + 3.0, 10, {
        x: Math.cos(ga) * rad, y: y + (MT_RISE + 3.0) / 2, z: Math.sin(ga) * rad,
      });
      k.cone("slate", 1.9, 2.6, 10, { x: Math.cos(ga) * rad, y: y + MT_RISE + 4.3, z: Math.sin(ga) * rad });
    }
    // the city itself: houses crowding the terrace behind each wall
    const inner = MT_TIERS[i + 1] ?? 5.5;
    const houses = Math.max(4, Math.round(rad * 0.7));
    for (let h = 0; h < houses; h++) {
      const a = (h / houses) * Math.PI * 2 + i * 0.7 + 0.2;
      if (Math.abs(Math.atan2(Math.sin(a - gate), Math.cos(a - gate))) < 0.35) continue;
      const hr = (rad + inner) / 2 + (r() - 0.5) * (rad - inner) * 0.35;
      const scale = 0.55 + r() * 0.3;
      cottage(k, {
        x: Math.cos(a) * hr,
        z: Math.sin(a) * hr,
        a: -a + Math.PI / 2,
        s: scale,
        w: 4.6, d: 3.4, h: 3.2,
        wall: "white",
        roof: "slate",
      });
      // the terrace floor under them
      if (h % 3 === 0) {
        k.box("white", 5.5, 0.4, 4.0, {
          x: Math.cos(a) * hr, y: y + MT_RISE - 0.2, z: Math.sin(a) * hr, ry: -a, shade: 0.98,
        });
      }
    }
    // banners on the odd tiers
    if (i % 2 === 1) {
      const ba = gate + 1.1;
      k.cyl("silver", 0.09, 0.12, 4.2, 5, { x: Math.cos(ba) * (rad - 0.5), y: y + MT_RISE + 2.1, z: Math.sin(ba) * (rad - 0.5) });
      k.plane("cloth", 1.5, 2.4, {
        x: Math.cos(ba) * (rad - 0.5) + 0.75, y: y + MT_RISE + 2.6, z: Math.sin(ba) * (rad - 0.5), flat: true,
      });
    }
  });

  // the spur of rock that splits the city, and the Great Gate at its foot
  // (the city's own pale stone — in dark rock it read as a black slab)
  k.box("white", 4.6, 28, 30, { x: 10, y: 14, z: 0, rz: -0.09, shade: 0.86 });
  // a prow of bare rock thrusting east, apex laid over toward +X
  k.wedge("white", 13, 26, 9.0, { x: 20, y: 8, z: 0, rz: -Math.PI / 2, shade: 0.84 });
  k.archWall("white", 13, 13, 4.5, 5.0, 8.0, 0, { x: 26.2, y: 6.5, z: 0, ry: Math.PI / 2 });
  for (const sz of [-1, 1]) {
    k.cyl("white", 2.4, 3.0, 15, 12, { x: 25.6, y: 7.5, z: sz * 7.6 });
    k.merlonRing("white", { cx: 25.6, cz: sz * 7.6, r: 2.4, y: 15, count: 9, w: 0.9, h: 1.0, d: 0.7 });
    k.cone("slate", 3.1, 4.0, 12, { x: 25.6, y: 17.6, z: sz * 7.6 });
  }
  // the causeway climbing to the gate
  k.box("white", 9, 1.2, 16, { x: 33, y: 0.6, z: 0, shade: 1.02 });

  // ── the Citadel ──
  const topY = MT_TIERS.length * MT_RISE;
  k.cyl("white", 7.2, 7.6, 1.2, 28, { y: topY + 0.6, shade: 1.04 });
  // court of the fountain and the White Tree
  k.cyl("white", 2.2, 2.6, 0.9, 16, { x: 3.6, y: topY + 1.6, z: 0.4 });
  k.cyl("water", 1.8, 1.8, 0.5, 16, { x: 3.6, y: topY + 2.0, z: 0.4, flat: true });
  k.cyl("paleBark", 0.22, 0.5, 3.4, 7, { x: 3.6, y: topY + 3.6, z: 0.4 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    k.cyl("paleBark", 0.08, 0.16, 1.9, 5, {
      x: 3.6 + Math.cos(a) * 0.5, y: topY + 5.2, z: 0.4 + Math.sin(a) * 0.5, rx: Math.sin(a) * 0.6, rz: -Math.cos(a) * 0.6,
    });
  }
  k.sphere("paleLeaf", 1.6, 10, 8, { x: 3.6, y: topY + 6.2, z: 0.4, s: [1, 0.8, 1] });
  k.sphere("paleLeaf", 1.0, 8, 6, { x: 4.6, y: topY + 5.6, z: 1.0 });
  k.sphere("paleLeaf", 0.9, 8, 6, { x: 2.7, y: topY + 5.5, z: -0.7 });
  // guard colonnade around the court
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    k.cyl("white", 0.3, 0.36, 3.6, 8, { x: Math.cos(a) * 6.4, y: topY + 3.0, z: Math.sin(a) * 6.4 });
  }

  // the Tower of Ecthelion
  const tY = topY + 1.2;
  k.cyl("white", 2.9, 3.6, 3.0, 16, { y: tY + 1.5 });
  k.cyl("white", 2.15, 2.6, 15, 16, { y: tY + 10.5 });
  // flutes up the shaft
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    k.box("white", 0.34, 15, 0.34, { x: Math.cos(a) * 2.4, y: tY + 10.5, z: Math.sin(a) * 2.4, ry: -a, shade: 1.03 });
  }
  k.cyl("white", 3.0, 2.6, 1.2, 16, { y: tY + 18.4 });
  k.merlonRing("white", { r: 2.7, y: tY + 19.0, count: 12, w: 0.65, h: 0.8, d: 0.6 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    k.cyl("white", 0.5, 0.62, 4.2, 8, { x: Math.cos(a) * 2.5, y: tY + 21.0, z: Math.sin(a) * 2.5 });
    k.cone("silver", 0.7, 1.6, 8, { x: Math.cos(a) * 2.5, y: tY + 23.9, z: Math.sin(a) * 2.5 });
  }
  k.cyl("white", 1.5, 2.4, 4.2, 16, { y: tY + 21.5 });
  k.cone("silver", 2.0, 6.0, 16, { y: tY + 26.6 });
  k.cone("silver", 0.22, 2.2, 6, { y: tY + 30.5 });
  for (let i = 0; i < 3; i++) {
    k.box("window", 0.5, 1.3, 0.12, { y: tY + 6 + i * 4.2, z: 2.62, flat: true });
  }
}

function MinasTirith() {
  const built = useBuilt(buildMinasTirith);
  const topY = MT_TIERS.length * MT_RISE;
  return (
    <Grounded u={SITES.minastirith.u} v={SITES.minastirith.v}>
      <primitive object={built} />
      <Lamp color="#fff2d8" intensity={110} distance={120} position={[0, topY + 8, 10]} decay={2} />
      <Lamp color="#ffd8a0" intensity={40} distance={60} position={[28, 6, 0]} decay={2} />
    </Grounded>
  );
}

// ── Mordor: Barad-dûr and the fires of Orodruin ─────────────────────────────

function buildBaradDur(k: Kit) {
  // a tapering stack of drums, each ringed with iron galleries
  const drums = [
    { y: 0, h: 22, rb: 8.4, rt: 7.4 },
    { y: 22, h: 20, rb: 7.0, rt: 6.0 },
    { y: 42, h: 18, rb: 5.6, rt: 4.7 },
    { y: 60, h: 16, rb: 4.4, rt: 3.6 },
    { y: 76, h: 13, rb: 3.4, rt: 2.9 },
  ];
  for (const d of drums) {
    k.cyl("black", d.rt, d.rb, d.h, 8, { y: d.y + d.h / 2 });
    k.cyl("obsidian", d.rb + 0.7, d.rb + 0.9, 1.0, 8, { y: d.y + 0.5 });
    // gallery ring with a rail of spikes
    k.cyl("obsidian", d.rt + 1.1, d.rt + 1.1, 0.5, 8, { y: d.y + d.h - 0.6 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      k.cone("obsidian", 0.16, 1.5, 4, {
        x: Math.cos(a) * (d.rt + 0.95), y: d.y + d.h + 0.2, z: Math.sin(a) * (d.rt + 0.95),
      });
    }
  }
  // buttress fins climbing the lower tower
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.5;
    k.cone("obsidian", 1.9, 34, 4, {
      x: Math.cos(a) * 8.2, y: 17, z: Math.sin(a) * 8.2, ry: -a, rz: 0.16,
    });
    k.cone("obsidian", 1.2, 22, 4, {
      x: Math.cos(a + 0.35) * 6.4, y: 44, z: Math.sin(a + 0.35) * 6.4, ry: -a, rz: 0.12,
    });
  }
  // lava seams bleeding through the base
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    k.box("lava", 0.45, 9 + i, 0.45, {
      x: Math.cos(a) * 7.9, y: 5 + i * 1.6, z: Math.sin(a) * 7.9, ry: -a, rz: 0.28, flat: true,
    });
  }
  // the crown: a ring of horns around the Eye's socket
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.cone("obsidian", 0.7, 11, 4, { x: Math.cos(a) * 3.0, y: 93, z: Math.sin(a) * 3.0, ry: a, rz: -0.24 });
  }
  for (const sx of [-1, 1]) {
    k.cone("black", 1.6, 20, 5, { x: sx * 3.4, y: 99, z: 0, rz: -sx * 0.22 });
  }
  k.cyl("obsidian", 3.0, 3.6, 4.0, 8, { y: 91 });
}

// ── the Eye ──────────────────────────────────────────────────────────────────
// A lidless eye wreathed in flame: an elliptical blaze around a black slit,
// its rim licked by animated fire. Drawn as a camera-facing billboard with
// additive light far above 1, so bloom carries it as the brightest thing in
// Mordor.

const EYE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const EYE_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
    return s;
  }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    // a wide almond, as a cat's eye is; flames rise off its rim
    vec2 q = vec2(p.x * 1.0, p.y * 1.75);
    float r = length(q);
    float a = atan(q.y, q.x + 1e-6); // atan(0, 0) is undefined, and one NaN pixel blacks out the bloom
    float flick = fbm(vec2(a * 2.2 + uTime * 0.4, r * 3.0 - uTime * 1.9));
    float rim = 0.62 + flick * 0.42 + max(p.y, 0.0) * 0.25;
    float body = smoothstep(rim, rim * 0.55, r);
    // iris: molten gold to white heat at the centre, streaked
    float streak = fbm(vec2(a * 6.0, r * 8.0 - uTime * 0.7));
    vec3 col = mix(vec3(0.95, 0.16, 0.02), vec3(1.0, 0.5, 0.1), smoothstep(0.8, 0.3, r));
    col = mix(col, vec3(1.0, 0.82, 0.45), smoothstep(0.28, 0.08, r) * 0.6);
    col *= 0.75 + streak * 0.5;
    // the pupil: a black vertical slit that never blinks
    float slit = smoothstep(0.1, 0.055, abs(p.x) * (1.0 + p.y * p.y * 6.0)) * smoothstep(0.5, 0.32, abs(p.y));
    col *= 1.0 - slit * 0.97;
    // a faint corona of heat haze beyond the flames
    float corona = smoothstep(1.0, 0.45, r) * 0.25 * (0.6 + flick * 0.6);
    float alpha = clamp(body + corona, 0.0, 1.0);
    gl_FragColor = vec4(col * (body * 3.2 + corona * 1.4), alpha);
  }`;

// The searchlight: brightest down its core, fading at its edges (by how
// squarely the cone's skin faces the viewer) and along its length, so it
// reads as light in smoky air rather than a solid wedge.
const BEAM_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vAlong;
  void main() {
    vAlong = uv.y;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const BEAM_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vAlong;
  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    float facing = abs(dot(normalize(vNormalW), V));
    float core = pow(facing, 2.2);
    float along = smoothstep(0.0, 0.55, vAlong) * (0.35 + 0.65 * vAlong);
    float smoke = 0.75 + 0.25 * sin(vWorld.x * 0.05 + vWorld.z * 0.04 - uTime * 1.3);
    float dist = length(cameraPosition - vWorld);
    float a = core * along * smoke * uStrength * exp(-dist * 0.0011);
    // additive: alpha 1 so the light adds linearly (alpha-weighted it squared)
    gl_FragColor = vec4(vec3(1.0, 0.42, 0.12) * a, 1.0);
  }`;

const BEAM_LEN = 420;

function BaradDur() {
  const built = useBuilt(buildBaradDur);
  const eyeRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Group>(null);

  const eyeMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: EYE_VERT,
        fragmentShader: EYE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  );
  const beam = useMemo(() => {
    // apex at the origin, opening down -Y; the group aims it
    const geo = new THREE.ConeGeometry(52, BEAM_LEN, 40, 1, true).translate(0, -BEAM_LEN / 2, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uStrength: { value: 0.3 } },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    return { geo, mat };
  }, []);
  useEffect(
    () => () => {
      eyeMat.dispose();
      beam.geo.dispose();
      beam.mat.dispose();
    },
    [eyeMat, beam],
  );

  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime;
    eyeMat.uniforms.uTime.value = t;
    beam.mat.uniforms.uTime.value = t;
    beam.mat.uniforms.uStrength.value = 0.28 + Math.sin(t * 1.7) * 0.04;
    if (eyeRef.current) eyeRef.current.quaternion.copy(camera.quaternion);
    // the gaze sweeps slowly round the Black Land, raking the plain below
    if (beamRef.current) {
      const a = t * 0.16;
      beamRef.current.rotation.set(0, -a, 0);
    }
  });

  return (
    <Grounded u={SITES.baraddur.u} v={SITES.baraddur.v}>
      <primitive object={built} />
      <mesh ref={eyeRef} position={[0, 99, 0]} material={eyeMat}>
        <planeGeometry args={[26, 17]} />
      </mesh>
      <group ref={beamRef} position={[0, 99, 0]}>
        {/* tipped from straight down to just below the horizon */}
        <mesh geometry={beam.geo} material={beam.mat} rotation={[0, 0, Math.PI / 2 - 0.2]} />
      </group>
      <Lamp color="#ff5a1e" intensity={460} distance={230} position={[0, 95, 0]} decay={1.9} />
    </Grounded>
  );
}

function MountDoom() {
  // the lava that runs down the flanks is painted into the ground itself
  // (Terrain.tsx), so it follows every crag; this is the crater and its fire
  const lavaMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#1c0a06",
        emissive: "#ff5a16",
        emissiveIntensity: 2.2,
        roughness: 0.9,
        side: THREE.DoubleSide,
      }),
    [],
  );
  useEffect(() => () => lavaMat.dispose(), [lavaMat]);
  useFrame(({ clock }) => {
    lavaMat.emissiveIntensity = 2.0 + Math.sin(clock.elapsedTime * 1.7) * 0.5;
  });

  return (
    <Grounded u={SITES.mountdoom.u} v={SITES.mountdoom.v}>
      <mesh material={lavaMat} position={[0, 1.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[9, 20]} />
      </mesh>
      <Plume position={[0, 3, 0]} color="#ff6a1a" count={130} spread={6.5} height={120} size={4} rise={18} opacity={0.7} />
      <Plume position={[0, 6, 0]} color="#40342c" count={80} spread={10} height={180} size={7} rise={10} additive={false} opacity={0.4} />
      <Lamp color="#ff4a12" intensity={520} distance={190} position={[0, 9, 0]} decay={1.9} />
    </Grounded>
  );
}

// ── Rohan: Edoras and the Golden Hall ───────────────────────────────────────

function buildEdoras(k: Kit) {
  const r = rng(6161);
  // the hill's crown, terraced
  k.cyl("turf", 23, 26, 3.0, 30, { y: -1.0, shade: 0.95 });

  // Meduseld on its plinth
  const hall = { w: 15, d: 9.5, h: 6.4, a: 0.4 };
  const hy = 4.6;
  k.box("stone", 19, 2.4, 14, { y: hy - 3.2, ry: -hall.a });
  k.box("stone", 21, 2.2, 16, { y: hy - 5.3, ry: -hall.a, shade: 0.96 });
  // the stair up to the hall's doors — starts out on the hill, climbs inward
  k.stairs("stone", {
    steps: 8, w: 6.5, rise: 0.34, run: 1.0,
    x: Math.cos(hall.a) * 17.5, z: Math.sin(hall.a) * 17.5, a: hall.a + Math.PI,
  });
  const ca = Math.cos(hall.a);
  const sa = Math.sin(hall.a);
  const P = (dx: number, dz: number): [number, number] => [dx * ca - dz * sa, dx * sa + dz * ca];

  k.box("timber", hall.w, hall.h, hall.d, { ...pt(P(0, 0), hy + hall.h / 2), ry: -hall.a });
  // carved posts down the long walls
  for (let i = 0; i < 7; i++) {
    const t = (i / 6 - 0.5) * (hall.w - 1.2);
    for (const sz of [-1, 1]) {
      k.box("beam", 0.5, hall.h, 0.4, { ...pt(P(t, (sz * hall.d) / 2), hy + hall.h / 2), ry: -hall.a });
    }
  }
  // golden thatch roof, steeply pitched, with a gilded ridge
  const pitch = 0.78;
  const rise = Math.tan(pitch) * (hall.d / 2 + 1.5);
  for (const sz of [-1, 1]) {
    k.box("gold", hall.w + 2.4, 0.4, ((hall.d / 2 + 1.6) / Math.cos(pitch)) * 2.05, {
      ...pt(P(0, (sz * (hall.d / 2 + 1.5)) / 2), hy + hall.h + rise / 2),
      ry: -hall.a,
      rx: sz * pitch,
    });
  }
  k.box("gold", hall.w + 2.0, 0.5, 0.6, { ...pt(P(0, 0), hy + hall.h + rise), ry: -hall.a });
  for (const sx of [-1, 1]) {
    k.wedge("timber", hall.d + 3.0, rise, 0.5, {
      ...pt(P((sx * hall.w) / 2, 0), hy + hall.h + rise / 2),
      ry: -hall.a + Math.PI / 2,
    });
    // crossed horse-head gables
    for (const sr of [-1, 1]) {
      k.box("gold", 0.4, 3.4, 0.4, {
        ...pt(P((sx * hall.w) / 2, 0), hy + hall.h + rise + 1.3),
        ry: -hall.a,
        rz: sr * 0.5,
      });
    }
    k.cone("gold", 0.45, 1.4, 6, {
      ...pt(P((sx * hall.w) / 2, 0), hy + hall.h + rise + 3.1),
      rz: sx * 0.5,
    });
  }
  // the great doors, framed by gilded pillars
  for (const sz of [-1, 1]) {
    k.cyl("gold", 0.36, 0.46, hall.h, 8, { ...pt(P(hall.w / 2 - 0.2, sz * 2.1), hy + hall.h / 2), ry: -hall.a });
  }
  k.archWall("beam", 4.4, hall.h * 0.8, 0.4, 2.4, 3.6, 0, {
    ...pt(P(hall.w / 2 + 0.1, 0), hy + (hall.h * 0.8) / 2),
    ry: -hall.a + Math.PI / 2,
  });
  k.box("window", 2.3, 3.2, 0.15, { ...pt(P(hall.w / 2 - 0.1, 0), hy + 1.9), ry: -hall.a + Math.PI / 2, flat: true });
  // the banners of the Mark either side of the doors
  for (const sz of [-1, 1]) {
    k.cyl("beam", 0.12, 0.15, 7.0, 5, { ...pt(P(hall.w / 2 + 1.6, sz * 3.6), hy + 3.5), ry: -hall.a });
    k.plane("clothGreen", 1.5, 2.8, { ...pt(P(hall.w / 2 + 1.6, sz * 3.6), hy + 5.6), ry: -hall.a + Math.PI / 2, flat: true });
  }

  // the village winding down the hill
  const houses: [number, number, number, number][] = [
    [12, 7, 0.7, 0.95], [17, -4, -0.4, 0.85], [7, -12, 1.9, 0.9], [-9, 11, 2.6, 0.85],
    [-14, -6, -1.2, 0.8], [-4, -17, 0.8, 0.75], [15, 13, 2.2, 0.8], [-18, 4, 1.1, 0.7],
  ];
  for (const [x, z, a, s] of houses) {
    cottage(k, { x, z, a, s, wall: "timber", roof: "thatch" });
    // a stack of firewood or a hay rick beside each
    if (r() > 0.4) k.cone("thatch", 1.5 * s, 3.0 * s, 8, { x: x + 3.2 * s, y: 1.5 * s, z: z + 2.4 * s });
  }
  // the way up to the hall
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    k.box("earth", 3.2, 0.24, 2.4, { x: 22 - t * 8, y: t * 1.2 + 0.1, z: 7 - t * 5, ry: 0.55, shade: 1.02 });
  }
  // palisade with gate towers
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - 0.35), Math.cos(a - 0.35))) < 0.16) continue;
    k.cyl("beam", 0.34, 0.42, 4.0, 6, { x: Math.cos(a) * 22, y: 2.0, z: Math.sin(a) * 18 });
    k.cone("beam", 0.36, 0.6, 6, { x: Math.cos(a) * 22, y: 4.3, z: Math.sin(a) * 18 });
  }
  for (const sg of [-1, 1]) {
    k.box("timber", 2.2, 6.4, 2.2, { x: Math.cos(0.35) * 22, y: 3.2, z: Math.sin(0.35) * 18 + sg * 3.2 });
    k.cone("thatch", 2.0, 2.2, 4, { x: Math.cos(0.35) * 22, y: 7.4, z: Math.sin(0.35) * 18 + sg * 3.2, ry: 0.79 });
  }
}

/** helper: spread a rotated local offset into a kit transform */
function pt(p: [number, number], y: number) {
  return { x: p[0], y, z: p[1] };
}

function Edoras() {
  const built = useBuilt(buildEdoras);
  return (
    <Grounded u={SITES.edoras.u} v={SITES.edoras.v}>
      <primitive object={built} />
      <Plume position={[0, 16, 0]} color="#c9c2b4" count={18} spread={1.4} height={26} size={2.2} rise={5} additive={false} opacity={0.28} />
      <Lamp color="#ffd07a" intensity={70} distance={70} position={[8, 9, 0]} decay={2} />
    </Grounded>
  );
}

// ── Isengard: Orthanc in the ring of Nan Curunír ────────────────────────────

function buildOrthanc(k: Kit) {
  const r = rng(4949);
  // the plinth
  k.cyl("obsidian", 7.0, 8.6, 2.4, 8, { y: 1.2 });
  // the shaft: four welded piers around a core, tapering to the horns
  k.cyl("obsidian", 3.4, 5.6, 44, 4, { y: 22, ry: Math.PI / 4 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.cyl("black", 1.15, 2.1, 50, 4, { x: Math.cos(a) * 3.1, y: 25, z: Math.sin(a) * 3.1, ry: Math.PI / 4 });
    // the horn: the pier continues past the shaft and leans outward.
    // ry runs last, so a plain rz lean gets carried round to face outward.
    k.cyl("obsidian", 0.35, 1.1, 11, 4, {
      x: Math.cos(a) * 4.3, y: 55.0, z: Math.sin(a) * 4.3,
      ry: a, rz: -0.15,
    });
  }
  // string courses give the tower its scale
  for (let i = 1; i <= 5; i++) {
    const y = i * 7.6;
    const t = 1 - y / 62;
    k.cyl("black", 4.2 * t + 1.4, 4.4 * t + 1.5, 0.6, 4, { y, ry: Math.PI / 4 });
  }
  // the stair and the door at its head
  for (let i = 0; i < 12; i++) {
    k.box("obsidian", 1.0, 0.42, 4.4 - i * 0.12, { x: 8.6 - i * 0.42, y: 0.2 + i * 0.42, z: 0 });
  }
  k.archWall("black", 5.0, 6.4, 1.0, 2.0, 3.2, 0, { x: 4.4, y: 8.4, z: 0, ry: Math.PI / 2 });
  k.box("obsidian", 3.0, 0.5, 4.0, { x: 5.4, y: 5.2, z: 0 });
  for (const sz of [-1, 1]) {
    k.cyl("obsidian", 0.16, 0.16, 1.4, 5, { x: 6.6, y: 5.9, z: sz * 1.8 });
  }
  k.box("window", 0.16, 1.6, 1.2, { x: 4.9, y: 9.6, z: 0, flat: true });
  // higher windows up the shaft
  for (let i = 0; i < 4; i++) {
    k.box("window", 0.16, 1.2, 0.8, { x: 3.9 - i * 0.35, y: 18 + i * 8, z: 0, flat: true });
  }

  // the ring-wall of Isengard, gate open to the south
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.2) continue;
    k.box("dark", 2.0, 5.0, 5.4, { x: Math.cos(a) * 27, y: 2.5, z: Math.sin(a) * 27, ry: -a });
    k.box("dark", 2.4, 0.7, 5.6, { x: Math.cos(a) * 27, y: 5.2, z: Math.sin(a) * 27, ry: -a, shade: 0.95 });
  }
  k.merlonRing("dark", { r: 27, y: 5.5, count: 46, w: 1.4, h: 1.2, d: 1.0, gapAt: Math.PI / 2, gapArc: 0.24 });
  for (const sx of [-1, 1]) {
    k.cyl("dark", 2.6, 3.2, 9.5, 10, { x: sx * 6.2, y: 4.75, z: 26.2 });
    k.merlonRing("dark", { cx: sx * 6.2, cz: 26.2, r: 2.6, y: 9.5, count: 10, w: 0.8, h: 0.9, d: 0.7 });
  }
  // the pits and engines of Saruman
  for (const [px, pz] of [[12, 8], [-10, 12], [-15, -8], [9, -14], [17, -3]] as const) {
    k.cyl("dark", 3.4, 2.6, 1.6, 12, { x: px, y: -0.4, z: pz, shade: 0.85 });
    k.cyl("forge", 2.5, 2.5, 0.4, 12, { x: px, y: 0.3, z: pz, flat: true });
    // spoil heaps and a windlass
    k.cone("dark", 2.2, 1.8, 7, { x: px + 4.2, y: 0.9, z: pz + 1.6, shade: 0.9 });
    k.box("beam", 0.3, 3.2, 0.3, { x: px + 2.8, y: 1.6, z: pz - 2.4, rz: 0.2 });
  }
  // felled and dead trees at the wall's foot
  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI * 2;
    const d = 19 + r() * 5;
    conifer(k, { x: Math.cos(a) * d, z: Math.sin(a) * d, s: 0.55 + r() * 0.3, leaf: "dark", bark: "beam" });
  }
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    const d = 12 + r() * 12;
    k.cyl("beam", 0.35, 0.5, 5.5, 6, { x: Math.cos(a) * d, y: 0.4, z: Math.sin(a) * d, rz: Math.PI / 2, ry: r() * 3 });
  }
}

function Orthanc() {
  const built = useBuilt(buildOrthanc);
  return (
    <Grounded u={SITES.orthanc.u} v={SITES.orthanc.v}>
      <primitive object={built} />
      {[[12, 8], [-10, 12], [-15, -8], [9, -14], [17, -3]].map(([px, pz], i) => (
        <Plume key={i} position={[px, 1, pz]} color="#5a5148" count={16} spread={1.6} height={28} size={3.0} rise={5} additive={false} opacity={0.34} />
      ))}
      <Lamp color="#ff8a3a" intensity={44} distance={70} position={[0, 3, 6]} decay={2} />
    </Grounded>
  );
}

// ── Weathertop: Amon Sûl in ruin ────────────────────────────────────────────

function buildWeathertop(k: Kit) {
  const r = rng(421);
  // the levelled crown
  k.cyl("stone", 10.0, 11.0, 1.0, 20, { y: 0.5, shade: 1.03 });
  // the broken ring wall — courses of masonry, higher on the north
  const segs = 22;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const keep = Math.sin(a * 1.7 + 0.6) * 0.5 + 0.5;
    if (keep < 0.28) continue;
    const h = 1.2 + keep * 4.4;
    k.box("ruin", 1.5, h, 3.4, { x: Math.cos(a) * 10.5, y: h / 2, z: Math.sin(a) * 10.5, ry: -a, rz: (r() - 0.5) * 0.07 });
    if (keep > 0.75) {
      k.box("ruin", 1.7, 0.6, 3.6, { x: Math.cos(a) * 10.5, y: h + 0.3, z: Math.sin(a) * 10.5, ry: -a, shade: 0.94 });
    }
  }
  // the ring of fallen columns
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    const h = 2.4 + r() * 5.0;
    const fallen = r() < 0.28;
    if (fallen) {
      k.cyl("stone", 0.7, 0.82, h, 9, { x: Math.cos(a) * 6.8, y: 0.75, z: Math.sin(a) * 6.8, rz: Math.PI / 2, ry: a * 1.7 });
    } else {
      k.cyl("stone", 0.72, 0.88, h, 9, { x: Math.cos(a) * 6.8, y: h / 2, z: Math.sin(a) * 6.8, rz: (r() - 0.5) * 0.12 });
      k.box("stone", 1.9, 0.45, 1.9, { x: Math.cos(a) * 6.8, y: h + 0.2, z: Math.sin(a) * 6.8, ry: -a });
    }
  }
  // fallen lintels and tumbled blocks
  k.box("stone", 6.4, 1.1, 1.4, { x: 2.5, y: 0.55, z: -3, ry: 0.7, rz: 0.08 });
  k.box("stone", 4.8, 1.0, 1.3, { x: -3.6, y: 0.5, z: 4.4, ry: -1.1 });
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2;
    const d = 3 + r() * 9;
    const s = 0.6 + r() * 1.1;
    k.add("ruin", new THREE.DodecahedronGeometry(s, 0), {
      x: Math.cos(a) * d, y: s * 0.55, z: Math.sin(a) * d, rx: r() * 3, ry: r() * 3, rz: r() * 3,
    });
  }
  // the scorched hollow where the fire was kindled
  k.cyl("dark", 2.2, 2.5, 0.35, 14, { y: 1.1, shade: 0.75 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    k.cyl("beam", 0.1, 0.16, 1.6, 5, { x: Math.cos(a) * 0.7, y: 1.7, z: Math.sin(a) * 0.7, rx: Math.sin(a) * 0.5, rz: -Math.cos(a) * 0.5 });
  }
  // the stair up the south side
  for (let i = 0; i < 8; i++) {
    k.box("ruin", 3.2, 0.4, 1.0, { x: 0, y: -0.2 + i * 0.4, z: 14.5 - i * 0.9, shade: 1.0 });
  }
}

function Weathertop() {
  const built = useBuilt(buildWeathertop);
  return (
    <Grounded u={SITES.weathertop.u} v={SITES.weathertop.v}>
      <primitive object={built} />
    </Grounded>
  );
}

// ── The Grey Havens: Mithlond and a swan-ship at the quay ───────────────────

function buildHavens(k: Kit) {
  // quays
  k.box("elf", 26, 2.6, 7, { y: 1.3, ry: -0.35 });
  k.box("elf", 15, 2.2, 5, { x: -8, y: 1.1, z: 8.4, ry: 0.9 });
  k.cyl("elf", 14, 15, 1.0, 26, { y: 0.2, shade: 0.96 });
  // mooring bollards along the edge
  for (let i = 0; i < 6; i++) {
    const t = i / 5 - 0.5;
    k.cyl("silver", 0.28, 0.36, 1.0, 8, {
      x: t * 22 * Math.cos(-0.35) - 3.0 * Math.sin(-0.35),
      y: 3.0,
      z: t * 22 * Math.sin(-0.35) + 3.0 * Math.cos(-0.35),
    });
  }
  // twin lamp-towers of the haven
  for (const [tx, tz] of [[-5, 0], [8, -3]] as const) {
    k.cyl("elf", 1.05, 1.7, 9.0, 10, { x: tx, y: 7.1, z: tz });
    k.cyl("elf", 1.9, 1.9, 0.5, 10, { x: tx, y: 11.8, z: tz });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.cyl("silver", 0.09, 0.11, 1.8, 5, { x: tx + Math.cos(a) * 1.05, y: 12.9, z: tz + Math.sin(a) * 1.05 });
    }
    k.sphere("window", 0.85, 10, 8, { x: tx, y: 13.0, z: tz, flat: true });
    k.cone("silver", 1.5, 2.6, 10, { x: tx, y: 15.1, z: tz });
    k.cone("silver", 0.16, 1.2, 6, { x: tx, y: 17.0, z: tz });
  }
  // an arcaded hall above the water stair
  k.box("elf", 12, 5.0, 8, { x: -12, y: 5.1, z: -6, ry: 0.35 });
  k.colonnade("elf", { from: [-17, -1.6], to: [-7.6, -5.2], count: 5, y: 2.6, h: 5.0, r: 0.28 });
  k.box("slate", 14, 0.5, 10, { x: -12, y: 7.8, z: -6, ry: 0.35 });
  k.cone("slate", 8.4, 4.2, 4, { x: -12, y: 9.8, z: -6, ry: 0.35 + Math.PI / 4 });
  // lamps along the quay edge
  for (const lx of [-10, -3.5, 3, 9.5]) {
    k.cyl("silver", 0.09, 0.12, 3.0, 6, { x: lx, y: 4.1, z: 2.6 });
    k.sphere("window", 0.26, 8, 6, { x: lx, y: 5.8, z: 2.6, flat: true });
  }
}

function buildSwanShip(k: Kit) {
  k.aoDepth = 0;
  // hull: a lifted, tapered shell
  k.sphere("elf", 1.7, 16, 10, { y: 0.6, s: [4.6, 0.62, 1.05], flat: true });
  k.sphere("elf", 1.5, 14, 10, { y: 1.25, s: [4.2, 0.5, 0.98], flat: true });
  k.box("elf", 13.2, 0.34, 2.6, { y: 1.5, flat: true });
  // the swan's breast and neck at the prow
  k.sphere("elf", 1.3, 12, 10, { x: 5.6, y: 1.9, z: 0, s: [1.2, 1.0, 0.9], flat: true });
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    k.cyl("elf", 0.3 - t * 0.1, 0.42 - t * 0.1, 0.9, 8, {
      x: 6.3 + Math.sin(t * 1.5) * 1.5,
      y: 2.6 + t * 2.4,
      z: 0,
      rz: -0.5 + t * 0.9,
      flat: true,
    });
  }
  k.sphere("elf", 0.46, 10, 8, { x: 7.5, y: 5.5, z: 0, flat: true });
  k.cone("gold", 0.17, 0.9, 6, { x: 8.1, y: 5.35, z: 0, rz: -1.3, flat: true });
  // folded wings along the sides
  for (const sz of [-1, 1]) {
    k.sphere("elf", 1.6, 12, 8, { x: 2.4, y: 2.2, z: sz * 1.35, s: [1.9, 0.85, 0.42], rz: 0.12, flat: true });
  }
  // stern
  k.cyl("elf", 0.24, 0.5, 3.4, 8, { x: -6.2, y: 2.8, z: 0, rz: 0.6, flat: true });
  k.cone("gold", 0.2, 0.8, 6, { x: -7.3, y: 4.3, z: 0, rz: 0.5, flat: true });
  // mast, yard and rigging
  k.cyl("beam", 0.14, 0.22, 9.0, 8, { y: 6.0, flat: true });
  k.cyl("beam", 0.1, 0.1, 5.6, 6, { y: 9.4, rx: Math.PI / 2, flat: true });
  for (const sz of [-1, 1]) {
    k.cyl("silver", 0.035, 0.035, 7.4, 4, { x: -2.6 * 0.5, y: 6.4, z: sz * 1.3, rz: 0.42, rx: sz * 0.2, flat: true });
  }
  k.plane("cloth", 5.4, 5.0, { y: 7.0, ry: Math.PI / 2, flat: true });
  k.plane("cloth", 3.0, 2.6, { x: 3.4, y: 5.4, ry: Math.PI / 2, rz: 0.25, flat: true });
}

function GreyHavens() {
  const quay = useBuilt(buildHavens);
  const shipGeo = useBuilt(buildSwanShip);
  const ship = useRef<THREE.Group>(null);
  const x = toWorldX(0.272);
  const z = toWorldZ(0.291);
  useFrame(({ clock }) => {
    if (!ship.current) return;
    const y = THREE.MathUtils.lerp(-3, SEA_LEVEL, morph.value);
    ship.current.position.set(x, y + Math.sin(clock.elapsedTime * 0.7) * 0.25, z);
    ship.current.rotation.z = Math.sin(clock.elapsedTime * 0.55) * 0.03;
    ship.current.visible = morph.value > 0.4;
  });
  return (
    <>
      <group ref={ship} rotation={[0, 0.6, 0]}>
        <primitive object={shipGeo} />
      </group>
      <Grounded u={SITES.havens.u} v={SITES.havens.v}>
        <primitive object={quay} />
        <Lamp color="#dfe8ff" intensity={44} distance={64} position={[0, 11, 0]} decay={2} />
      </Grounded>
    </>
  );
}

// ── Moria: the West-gate, the Doors of Durin ────────────────────────────────

/** Ithildin design: two pillars & arch, hollies, crown, seven stars, Star of Fëanor. */
function makeDurinDoorTexture() {
  const W = 256;
  const H = 320;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#cfeaff";
  ctx.fillStyle = "#cfeaff";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  for (const x of [46, W - 46]) {
    ctx.beginPath();
    ctx.moveTo(x, H - 20);
    ctx.lineTo(x, 96);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(W / 2, 128, 84, Math.PI, 0);
  ctx.stroke();
  ctx.save();
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 13; i++) {
    const a = Math.PI + ((i + 0.75) / 14) * Math.PI;
    const r0 = 90;
    const x = W / 2 + Math.cos(a) * r0;
    const y = 128 + Math.sin(a) * r0;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10);
    if (i % 3 !== 2) {
      ctx.moveTo(x + Math.cos(a) * 5 - 3, y + Math.sin(a) * 5);
      ctx.lineTo(x + Math.cos(a) * 5 + 3, y + Math.sin(a) * 5);
    }
    ctx.stroke();
  }
  ctx.restore();

  ctx.lineWidth = 2.2;
  for (const [x, sx] of [
    [46, 1],
    [W - 46, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x, H - 24);
    ctx.bezierCurveTo(x + 14 * sx, H - 70, x - 10 * sx, 150, x + 6 * sx, 100);
    ctx.stroke();
    for (let k = 0; k < 5; k++) {
      const y = 96 - k * 7;
      ctx.beginPath();
      ctx.ellipse(x + sx * (6 + k * 3), y, 8 - k, 3.4, sx * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 22, 96);
  ctx.lineTo(W / 2 - 22, 82);
  ctx.lineTo(W / 2 - 11, 92);
  ctx.lineTo(W / 2, 78);
  ctx.lineTo(W / 2 + 11, 92);
  ctx.lineTo(W / 2 + 22, 82);
  ctx.lineTo(W / 2 + 22, 96);
  ctx.closePath();
  ctx.stroke();
  ctx.strokeRect(W / 2 - 14, 104, 28, 10);

  const star = (cx: number, cy: number, r: number, points = 4) => {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.42;
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  };
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + ((i + 0.5) / 7) * Math.PI;
    star(W / 2 + Math.cos(a) * 62, 118 + Math.sin(a) * 56, 5.5);
  }
  star(W / 2, 196, 26, 8);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(W / 2, 196, 32, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(W / 2, 230);
  ctx.lineTo(W / 2, H - 16);
  ctx.moveTo(W / 2, 96);
  ctx.lineTo(W / 2, 162);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildMoria(k: Kit) {
  const r = rng(507);
  // The wall of the Silvertine. A single big box reads as a grey slab dropped
  // on the mountain, so the face is built from tilted, differently-shaded
  // buttresses over a buried core, and broken up with a scatter of crags.
  k.box("rock", 22, 60, 52, { x: 15, y: 8, z: 0, shade: 0.86 });
  for (let i = 0; i < 14; i++) {
    const h = 16 + r() * 34;
    const w = 4 + r() * 7;
    k.box("rock", w, h, 7 + r() * 10, {
      x: 2.2 + r() * 6,
      y: h / 2 - 4 + r() * 10,
      z: -24 + i * 3.6 + (r() - 0.5) * 3,
      ry: (r() - 0.5) * 0.7,
      rz: (r() - 0.5) * 0.22,
      shade: 0.82 + r() * 0.4,
    });
  }
  // crags shouldering over the gate
  for (let i = 0; i < 7; i++) {
    const s = 2.5 + r() * 5;
    k.add("rock", new THREE.DodecahedronGeometry(s, 0), {
      x: 1 + r() * 8, y: 18 + r() * 28, z: -22 + r() * 44,
      rx: r() * 3, ry: r() * 3, rz: r() * 3, shade: 0.85 + r() * 0.35,
    });
  }
  k.box("rock", 13, 44, 14, { x: 9, y: 24, z: -18, rz: 0.2, ry: 0.3, shade: 0.94 });
  k.box("rock", 13, 38, 14, { x: 9, y: 21, z: 18, rz: 0.16, ry: -0.25, shade: 1.02 });
  // the door recess and its dressed jambs
  k.box("obsidian", 1.8, 16, 13.0, { x: 1.6, y: 8.0, z: 0 });
  for (const sz of [-1, 1]) {
    k.box("dwarf", 2.2, 17, 1.5, { x: 1.4, y: 8.5, z: sz * 6.9 });
  }
  k.archBand("dwarf", 6.2, 1.1, 2.2, { x: 1.4, y: 12.6, z: 0, ry: Math.PI / 2 });
  // threshold steps down to the water
  k.box("dwarf", 5, 1.4, 15, { x: -1.6, y: 0.7, z: 0 });
  k.box("dwarf", 3.4, 0.5, 17, { x: -4.4, y: 0.25, z: 0 });
  // the dark pool of the Watcher
  k.cyl("blackWater", 13, 13, 0.4, 26, { x: -16, y: 0.4, z: 3, flat: true });
  k.cyl("rock", 13.8, 14.6, 1.0, 26, { x: -16, y: 0.1, z: 3, shade: 0.88 });
  // the two hollies of Eregion
  conifer(k, { x: -3, z: -10.5, s: 1.5, leaf: "darkLeaf" });
  conifer(k, { x: -3, z: 10.5, s: 1.3, leaf: "darkLeaf" });
  // rubble of the old road
  for (let i = 0; i < 14; i++) {
    const s = 0.6 + r() * 1.6;
    k.add("rock", new THREE.DodecahedronGeometry(s, 0), {
      x: -6 - r() * 18, y: s * 0.6, z: (r() - 0.5) * 22, rx: r() * 3, ry: r() * 3, rz: r() * 3,
    });
  }
}

function MoriaGate() {
  const built = useBuilt(buildMoria);
  const doorTex = useMemo(makeDurinDoorTexture, []);
  const glowMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#0c0f14",
        emissive: "#9fd8ff",
        emissiveIntensity: 1.1,
        emissiveMap: doorTex,
        transparent: true,
        opacity: 0.96,
        roughness: 0.7,
      }),
    [doorTex],
  );
  useEffect(() => () => { glowMat.dispose(); doorTex.dispose(); }, [glowMat, doorTex]);
  const glowRef = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const breathe = 0.9 + Math.sin(clock.elapsedTime * 0.8) * 0.25;
    glowMat.emissiveIntensity = breathe;
    if (glowRef.current) glowRef.current.intensity = 26 * breathe;
  });
  return (
    <Grounded u={SITES.moria.u} v={SITES.moria.v}>
      <primitive object={built} />
      <mesh material={glowMat} position={[0.62, 8.0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[12, 15]} />
      </mesh>
      <Lamp ref={glowRef} color="#9fd8ff" intensity={26} distance={48} position={[-4, 9, 0]} decay={2} />
    </Grounded>
  );
}

export function Landmarks() {
  return (
    <group>
      <Hobbiton />
      <Rivendell />
      <Erebor />
      <MinasTirith />
      <BaradDur />
      <MountDoom />
      <Edoras />
      <Orthanc />
      <Weathertop />
      <GreyHavens />
      <MoriaGate />
    </group>
  );
}
