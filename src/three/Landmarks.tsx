"use client";

import { useMemo, useRef } from "react";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { MAP_W, MAP_H, SEA_LEVEL, toWorldX, toWorldZ } from "@/data/content";
import { heightAt } from "@/three/noise";
import { morph } from "@/three/Terrain";
import { Plume } from "@/three/Particles";
import { useGame } from "@/state/store";

/** Landmark point light — skipped on low quality (every light costs per-fragment
 *  work across the whole forward-rendered scene, terrain included). */
function Lamp(props: ThreeElements["pointLight"]) {
  const quality = useGame((s) => s.quality);
  if (quality === "low") return null;
  return <pointLight {...props} />;
}

// shared materials
const M = {
  whiteStone: new THREE.MeshStandardMaterial({ color: "#cfc8b8", roughness: 0.85 }),
  whiteTrim: new THREE.MeshStandardMaterial({ color: "#e9e4d6", roughness: 0.7 }),
  darkStone: new THREE.MeshStandardMaterial({ color: "#4a4038", roughness: 0.95 }),
  greyStone: new THREE.MeshStandardMaterial({ color: "#8a8378", roughness: 0.95 }),
  blackTower: new THREE.MeshStandardMaterial({ color: "#17100e", roughness: 0.55, metalness: 0.4 }),
  obsidian: new THREE.MeshStandardMaterial({ color: "#0d0a09", roughness: 0.35, metalness: 0.5 }),
  wood: new THREE.MeshStandardMaterial({ color: "#6b4d1e", roughness: 0.9 }),
  woodDark: new THREE.MeshStandardMaterial({ color: "#4a3418", roughness: 0.92 }),
  thatch: new THREE.MeshStandardMaterial({ color: "#b89a52", roughness: 0.95 }),
  grass: new THREE.MeshStandardMaterial({ color: "#7f9e4e", roughness: 0.95 }),
  doorGreen: new THREE.MeshStandardMaterial({ color: "#4e7a2e", roughness: 0.6 }),
  doorYellow: new THREE.MeshStandardMaterial({ color: "#c9963c", roughness: 0.6 }),
  doorRed: new THREE.MeshStandardMaterial({ color: "#8c2e1e", roughness: 0.6 }),
  doorBlue: new THREE.MeshStandardMaterial({ color: "#3e5a7a", roughness: 0.6 }),
  brass: new THREE.MeshStandardMaterial({ color: "#d8b04e", roughness: 0.35, metalness: 0.7 }),
  trunk: new THREE.MeshStandardMaterial({ color: "#5c4222", roughness: 0.95 }),
  silverTrunk: new THREE.MeshStandardMaterial({ color: "#b8b4a8", roughness: 0.8 }),
  leaf: new THREE.MeshStandardMaterial({ color: "#5e7a38", roughness: 0.9 }),
  goldLeaf: new THREE.MeshStandardMaterial({ color: "#d8b04e", roughness: 0.75, emissive: "#6a5010", emissiveIntensity: 0.35 }),
  paleLeaf: new THREE.MeshStandardMaterial({ color: "#e8e8dc", roughness: 0.8, emissive: "#5a5a48", emissiveIntensity: 0.15 }),
  elfStone: new THREE.MeshStandardMaterial({ color: "#e8e2d2", roughness: 0.6, metalness: 0.15 }),
  gold: new THREE.MeshStandardMaterial({ color: "#caa244", roughness: 0.4, metalness: 0.65, emissive: "#4a3608", emissiveIntensity: 0.3 }),
  window: new THREE.MeshStandardMaterial({ color: "#2c1f0d", emissive: "#ffbf5e", emissiveIntensity: 1.6 }),
  lava: new THREE.MeshStandardMaterial({ color: "#2a1008", emissive: "#ff4a12", emissiveIntensity: 2.6, roughness: 0.8 }),
  lavaFlow: new THREE.MeshStandardMaterial({ color: "#1c0a06", emissive: "#ff5a16", emissiveIntensity: 2.2, roughness: 0.9, side: THREE.DoubleSide }),
  forge: new THREE.MeshStandardMaterial({ color: "#241a12", emissive: "#ff7a22", emissiveIntensity: 1.6, roughness: 0.8 }),
  sail: new THREE.MeshStandardMaterial({ color: "#f2ead2", roughness: 0.9, side: THREE.DoubleSide }),
  holly: new THREE.MeshStandardMaterial({ color: "#2e4d2a", roughness: 0.9 }),
  autumn: new THREE.MeshStandardMaterial({ color: "#b8813c", roughness: 0.9 }),
  blackWater: new THREE.MeshStandardMaterial({ color: "#0a1214", roughness: 0.08, metalness: 0.6 }),
  pond: new THREE.MeshStandardMaterial({ color: "#3f6b78", roughness: 0.15, metalness: 0.4 }),
  banner: new THREE.MeshStandardMaterial({ color: "#f4efe2", roughness: 0.85, side: THREE.DoubleSide }),
  bannerGreen: new THREE.MeshStandardMaterial({ color: "#3e6b34", roughness: 0.85, side: THREE.DoubleSide }),
  ruinStone: new THREE.MeshStandardMaterial({ color: "#7a7268", roughness: 0.95 }),
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
  useFrame(({ camera }) => {
    if (ref.current) {
      const dx = camera.position.x - x;
      const dz = camera.position.z - z;
      ref.current.visible = morph.value > 0.02 && dx * dx + dz * dz < CULL_DIST_SQ;
      if (ref.current.visible) ref.current.position.y = baseY * morph.value + yOffset;
    }
  });
  return (
    <group ref={ref} position={[x, 0, z]}>
      {children}
    </group>
  );
}

function Tree({
  x = 0, z = 0, s = 1, mat = M.leaf, trunkMat = M.trunk,
}: { x?: number; z?: number; s?: number; mat?: THREE.Material; trunkMat?: THREE.Material }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh material={trunkMat} position={[0, 3.2, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.9, 6.4, 7]} />
      </mesh>
      <mesh material={mat} position={[0, 8.2, 0]} castShadow>
        <sphereGeometry args={[3.8, 10, 8]} />
      </mesh>
      <mesh material={mat} position={[1.8, 6.2, 0.9]} castShadow>
        <sphereGeometry args={[2.3, 8, 6]} />
      </mesh>
      <mesh material={mat} position={[-1.7, 6.6, -0.7]} castShadow>
        <sphereGeometry args={[2.0, 8, 6]} />
      </mesh>
    </group>
  );
}

// ── The Shire: Hobbiton with mill ────────────────────────────────────────────
function HobbitDoor({ a, r, mat, mound }: { a: number; r: number; mat: THREE.Material; mound: number }) {
  const dx = Math.cos(a) * r;
  const dz = Math.sin(a) * r;
  const ry = -a + Math.PI / 2;
  return (
    <group position={[dx, 2.3, dz]} rotation={[0, ry, 0]}>
      <mesh material={M.wood}>
        <torusGeometry args={[2.2, 0.45, 8, 22]} />
      </mesh>
      <mesh material={mat} position={[0, 0, -0.12]}>
        <circleGeometry args={[2.2, 22]} />
      </mesh>
      <mesh material={M.brass} position={[0.75, 0, 0.18]}>
        <sphereGeometry args={[0.17, 7, 6]} />
      </mesh>
      {/* round windows either side */}
      {[-1, 1].map((s2) => (
        <group key={s2} position={[s2 * 4.6 * (mound ? 1 : 0.9), 0.3, -0.5]}>
          <mesh material={M.wood}>
            <torusGeometry args={[0.85, 0.2, 6, 14]} />
          </mesh>
          <mesh material={M.window} position={[0, 0, -0.06]}>
            <circleGeometry args={[0.85, 14]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Mill() {
  const wheel = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (wheel.current) wheel.current.rotation.z -= dt * 0.5;
  });
  return (
    <group position={[26, 0, 14]} rotation={[0, -0.7, 0]}>
      <mesh material={M.greyStone} position={[0, 5.5, 0]} castShadow>
        <cylinderGeometry args={[3.4, 4.0, 11, 10]} />
      </mesh>
      <mesh material={M.thatch} position={[0, 12.3, 0]} castShadow>
        <coneGeometry args={[4.4, 4.4, 10]} />
      </mesh>
      <mesh material={M.window} position={[0, 7, 3.3]}>
        <circleGeometry args={[0.6, 10]} />
      </mesh>
      {/* waterwheel */}
      <mesh ref={wheel} material={M.woodDark} position={[4.6, 3.2, 0]} rotation={[0, 0, 0]} castShadow>
        <torusGeometry args={[3.0, 0.5, 6, 14]} />
      </mesh>
    </group>
  );
}

function Hobbiton() {
  const doors = [
    { a: 0.1, mat: M.doorGreen, r: 15, mound: 1 },
    { a: 1.25, mat: M.doorYellow, r: 16, mound: 1 },
    { a: 2.35, mat: M.doorRed, r: 14.5, mound: 1 },
    { a: 3.6, mat: M.doorBlue, r: 15.5, mound: 1 },
    { a: 4.9, mat: M.doorYellow, r: 15, mound: 1 },
  ];
  const fencePosts = useMemo(
    () => Array.from({ length: 14 }, (_, i) => ({ a: (i / 14) * Math.PI * 2, r: 24 + (i % 3) })),
    [],
  );
  return (
    <Grounded u={0.352} v={0.258}>
      {/* twin grassy mounds — Hobbiton hill & Bagshot Row */}
      <mesh material={M.grass} position={[0, 2.2, 0]} castShadow receiveShadow>
        <sphereGeometry args={[18, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh material={M.grass} position={[-16, 1.2, -12]} castShadow receiveShadow>
        <sphereGeometry args={[11, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {/* Bagshot Row — a terrace of little doors in the second mound */}
      {[{ a: 0.5, mat: M.doorRed }, { a: 1.5, mat: M.doorGreen }, { a: 2.5, mat: M.doorYellow }].map((d, i) => (
        <group key={"bag" + i} position={[-16, -0.9, -12]} scale={0.62}>
          <HobbitDoor a={d.a} r={10.5} mat={d.mat} mound={0} />
        </group>
      ))}
      {/* the Water — mill pond with an arched stone bridge */}
      <mesh material={M.pond} position={[30, 0.35, 24]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[12, 20]} />
      </mesh>
      <mesh material={M.greyStone} position={[24, 1.5, 15]} rotation={[0, 0.75, 0]} castShadow>
        <torusGeometry args={[5.5, 0.75, 7, 18, Math.PI]} />
      </mesh>
      {doors.map((d, i) => (
        <HobbitDoor key={i} {...d} />
      ))}
      {/* chimneys with hearth-smoke */}
      {[
        [4, 13.5, -3],
        [-8, 10.5, 7],
      ].map(([cx, cy, cz], i) => (
        <group key={i}>
          <mesh material={M.darkStone} position={[cx, cy, cz]} castShadow>
            <cylinderGeometry args={[0.55, 0.7, 3, 7]} />
          </mesh>
          <Plume position={[cx, cy + 1.8, cz]} color="#c9c2b4" count={24} spread={1} height={34} size={2.4} rise={6} additive={false} opacity={0.35} />
        </group>
      ))}
      {/* garden fence */}
      {fencePosts.map((p, i) => (
        <mesh key={i} material={M.wood} position={[Math.cos(p.a) * p.r, 1, Math.sin(p.a) * p.r]} castShadow>
          <boxGeometry args={[0.28, 2, 0.28]} />
        </mesh>
      ))}
      <Mill />
      {/* the Party Tree and friends */}
      <Tree x={-24} z={8} s={2.2} />
      <Tree x={20} z={-14} s={1.5} />
      <Tree x={8} z={26} s={1.7} />
      <Tree x={-6} z={-24} s={1.2} />
    </Grounded>
  );
}

// ── Elf refuges: Rivendell (waterfall) + Lothlórien (lantern mallorns) ──────
function ElfSpire({ x = 0, z = 0, h = 22, s = 1 }: { x?: number; z?: number; h?: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh material={M.elfStone} position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[1.3, 2.1, h, 9]} />
      </mesh>
      <mesh material={M.whiteTrim} position={[0, h + 2.4, 0]} castShadow>
        <coneGeometry args={[2.2, 6.2, 9]} />
      </mesh>
      <mesh material={M.whiteTrim} position={[0, h * 0.62, 0]} castShadow>
        <cylinderGeometry args={[1.9, 1.9, 0.7, 9]} />
      </mesh>
      <mesh material={M.gold} position={[0, h - 1.6, 0]}>
        <torusGeometry args={[1.7, 0.16, 6, 18]} />
      </mesh>
      {/* lit windows */}
      {[0.3, 0.55, 0.8].map((f, i) => (
        <mesh key={i} material={M.window} position={[0, h * f, 1.75]}>
          <boxGeometry args={[0.5, 1, 0.1]} />
        </mesh>
      ))}
    </group>
  );
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
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt;
  });
  return (
    <group>
      <mesh material={mat} position={[-9, 11, 9]} rotation={[0, 0.9, 0]}>
        <planeGeometry args={[7, 24, 1, 1]} />
      </mesh>
      {/* mist at the plunge pool */}
      <Plume position={[-11, 0.5, 12]} color="#eef4f4" count={26} spread={3.4} height={9} size={4} rise={3} additive={false} opacity={0.3} />
    </group>
  );
}

function Rivendell() {
  return (
    <>
      <Grounded u={0.502} v={0.252}>
        {/* the Last Homely House — terraced halls with open colonnades */}
        {[
          { x: 0, z: 0, w: 16, d: 10, y: 0, h: 4.5 },
          { x: -3, z: -2, w: 11, d: 7.5, y: 4.5, h: 3.8 },
          { x: -5, z: 1, w: 7, d: 5.5, y: 8.3, h: 3.2 },
        ].map((t, i) => (
          <group key={i} position={[t.x, t.y, t.z]}>
            <mesh material={M.elfStone} position={[0, t.h / 2, 0]} castShadow>
              <boxGeometry args={[t.w, t.h, t.d]} />
            </mesh>
            {/* colonnade along the south face */}
            {Array.from({ length: Math.floor(t.w / 2.2) }, (_, k) => (
              <mesh key={k} material={M.whiteTrim} position={[-t.w / 2 + 1.2 + k * 2.2, t.h / 2, t.d / 2 + 0.6]} castShadow>
                <cylinderGeometry args={[0.22, 0.26, t.h, 6]} />
              </mesh>
            ))}
            {/* swept eaves */}
            <mesh material={M.wood} position={[0, t.h + 0.5, 0]} castShadow>
              <boxGeometry args={[t.w + 2.4, 1, t.d + 2.6]} />
            </mesh>
            <mesh material={M.window} position={[t.w / 2 + 0.06, t.h * 0.55, 0]}>
              <boxGeometry args={[0.1, 1.2, 2.2]} />
            </mesh>
          </group>
        ))}
        <ElfSpire x={9} z={-5} h={17} s={0.8} />
        <ElfSpire x={-11} z={6} h={14} s={0.7} />
        {/* arched bridge over the Bruinen */}
        <mesh material={M.elfStone} position={[14, 2.6, 10]} rotation={[0, 0.6, 0]} castShadow>
          <torusGeometry args={[9, 0.7, 8, 24, Math.PI]} />
        </mesh>
        {/* autumn beeches of the valley */}
        <Tree x={-16} z={-8} s={1.3} mat={M.autumn} />
        <Tree x={18} z={2} s={1.1} mat={M.autumn} />
        <Tree x={6} z={14} s={1.0} mat={M.autumn} />
        <Waterfall />
        <Lamp color="#ffe9b0" intensity={60} distance={70} position={[0, 16, 0]} decay={2} />
      </Grounded>
      {/* Lothlórien — golden mallorn wood with flets and elf-lanterns */}
      <Grounded u={0.548} v={0.372}>
        {[
          [0, 0, 4.6], [16, 9, 3.4], [-14, 12, 3.6], [4, -16, 3.0], [-9, -11, 2.6], [18, -7, 2.3],
        ].map(([x, z, s], i) => (
          <group key={i}>
            <Tree x={x} z={z} s={s as number} mat={M.goldLeaf} trunkMat={M.silverTrunk} />
            {/* flet — a talan platform ringing the trunk */}
            {(s as number) > 3 && (
              <mesh material={M.silverTrunk} position={[x as number, (s as number) * 4.6, z as number]}>
                <cylinderGeometry args={[(s as number) * 0.75, (s as number) * 0.75, 0.3, 9]} />
              </mesh>
            )}
            <mesh material={M.window} position={[(x as number) + 1.5, (s as number) * 6.5, (z as number) + 1]}>
              <sphereGeometry args={[0.35, 6, 5]} />
            </mesh>
          </group>
        ))}
        <Lamp color="#ffd76a" intensity={80} distance={90} position={[0, 22, 0]} decay={2} />
      </Grounded>
    </>
  );
}

// ── Erebor: the great gate under the Lonely Mountain ────────────────────────
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
  let sd = 77;
  const rand = () => {
    sd = (sd * 1664525 + 1013904223) >>> 0;
    return sd / 4294967296;
  };
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

function DwarfStatue({ x, s }: { x: number; s: number }) {
  return (
    <group position={[x, 0, 3]} scale={s}>
      <mesh material={M.darkStone} position={[0, 2, 0]} castShadow>
        <boxGeometry args={[3.6, 4, 3.2]} />
      </mesh>
      <mesh material={M.darkStone} position={[0, 8, 0]} castShadow>
        <boxGeometry args={[3.0, 8.4, 2.6]} />
      </mesh>
      <mesh material={M.darkStone} position={[0, 13.6, 0]} castShadow>
        <boxGeometry args={[2.0, 2.4, 2.0]} />
      </mesh>
      {/* crossed arms holding the axe */}
      <mesh material={M.darkStone} position={[0, 9.6, 1.5]} rotation={[0, 0, 0.5]} castShadow>
        <boxGeometry args={[2.8, 0.9, 0.9]} />
      </mesh>
      <mesh material={M.greyStone} position={[0, 10.5, 2.1]} castShadow>
        <boxGeometry args={[0.5, 6.5, 0.5]} />
      </mesh>
      <mesh material={M.greyStone} position={[0, 13.4, 2.1]} castShadow>
        <boxGeometry args={[2.6, 1.5, 0.4]} />
      </mesh>
    </group>
  );
}

function Erebor() {
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
  return (
    <>
      <Grounded u={0.664} v={0.240}>
       <group scale={1.35}>
        {/* stepped gate */}
        <mesh material={M.darkStone} position={[-7.5, 10, 0]} castShadow>
          <boxGeometry args={[4.5, 20, 5.5]} />
        </mesh>
        <mesh material={M.darkStone} position={[7.5, 10, 0]} castShadow>
          <boxGeometry args={[4.5, 20, 5.5]} />
        </mesh>
        <mesh material={M.darkStone} position={[0, 21.4, 0]} castShadow>
          <boxGeometry args={[21, 4.2, 6]} />
        </mesh>
        <mesh material={M.darkStone} position={[0, 25, 0]} castShadow>
          <boxGeometry args={[15, 3.4, 5]} />
        </mesh>
        {/* rune lintel */}
        <mesh material={runeMat} position={[0, 21.4, 3.06]}>
          <planeGeometry args={[19, 3.4]} />
        </mesh>
        {/* the doors with the glowing forge seam */}
        <mesh material={M.greyStone} position={[0, 8.2, 0.6]} castShadow>
          <boxGeometry args={[10.6, 16.4, 3.6]} />
        </mesh>
        <mesh material={M.forge} position={[0, 8.2, 2.5]}>
          <boxGeometry args={[1.2, 15.6, 0.6]} />
        </mesh>
        {/* causeway + braziers */}
        <mesh material={M.greyStone} position={[0, 0.7, 15]} receiveShadow>
          <boxGeometry args={[9, 1.4, 26]} />
        </mesh>
        {[-1, 1].map((s2) => (
          <group key={s2} position={[s2 * 6.2, 0, 10]}>
            <mesh material={M.darkStone} position={[0, 2.2, 0]} castShadow>
              <cylinderGeometry args={[0.8, 1.1, 4.4, 7]} />
            </mesh>
            <Plume position={[0, 4.6, 0]} color="#ffa63e" count={30} spread={0.9} height={9} size={2.6} rise={9} opacity={0.8} />
          </group>
        ))}
        <DwarfStatue x={-15.5} s={1.15} />
        <DwarfStatue x={15.5} s={1.15} />
        <Lamp color="#ff8a2e" intensity={140} distance={70} position={[0, 8, 8]} decay={1.8} />
       </group>
      </Grounded>
      {/* smoke from the mountain's chimneys */}
      <Grounded u={0.670} v={0.200}>
        <Plume position={[0, 0, 0]} color="#8a8178" count={70} spread={6} height={110} size={4.4} rise={11} additive={false} opacity={0.4} />
      </Grounded>
      {/* the ruins of Dale in the mountain's shadow */}
      <Grounded u={0.6625} v={0.2505}>
        {[
          { x: 0, z: 0, h: 7, r: 2.2, broken: 0.6 },
          { x: 9, z: 4, h: 4.5, r: 1.7, broken: 0.35 },
          { x: -7, z: 6, h: 5.5, r: 1.9, broken: 0.5 },
        ].map((t, i) => (
          <group key={i} position={[t.x, 0, t.z]}>
            <mesh material={M.ruinStone} position={[0, t.h / 2, 0]} rotation={[0, i, t.broken * 0.16]} castShadow>
              <cylinderGeometry args={[t.r * 0.82, t.r, t.h, 9, 1, true]} />
            </mesh>
            <mesh material={M.ruinStone} position={[t.r + 0.8, 0.5, 1]} rotation={[0.3, i * 2, 0.5]} castShadow>
              <boxGeometry args={[1.6, 1, 1.2]} />
            </mesh>
          </group>
        ))}
        {/* tumbled walls */}
        {[
          [-4, -5, 0.5], [4, -3, -0.3], [12, 0, 0.8], [-11, 2, -0.6],
        ].map(([wx, wz, wr], i) => (
          <mesh key={"w" + i} material={M.ruinStone} position={[wx, 0.8, wz]} rotation={[0, wr, 0]} castShadow>
            <boxGeometry args={[5.5, 1.6, 0.9]} />
          </mesh>
        ))}
      </Grounded>
    </>
  );
}

// ── Minas Tirith: seven white tiers with parapets & turrets ──────────────────
function MinasTirith() {
  const tiers = [21, 18, 15.4, 12.9, 10.5, 8.2, 6.1];
  const turrets = useMemo(() => {
    const list: { x: number; z: number; y: number; s: number }[] = [];
    let sd = 31;
    const rand = () => {
      sd = (sd * 1664525 + 1013904223) >>> 0;
      return sd / 4294967296;
    };
    tiers.forEach((r, i) => {
      const n = i % 2 === 0 ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const a = rand() * Math.PI * 2;
        list.push({ x: Math.cos(a) * (r - 1.2), z: Math.sin(a) * (r - 1.2), y: i * 4.6 + 4.6, s: 0.8 + rand() * 0.7 });
      }
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Grounded u={0.607} v={0.607}>
      {/* banners of the White Tree on the tiers */}
      {[1, 3, 5].map((i) => (
        <group key={"bn" + i} position={[Math.cos(i * 1.8) * (tiers[i] - 0.6), i * 4.6 + 6.2, Math.sin(i * 1.8) * (tiers[i] - 0.6)]}>
          <mesh material={M.silverTrunk}>
            <cylinderGeometry args={[0.09, 0.12, 3.6, 5]} />
          </mesh>
          <mesh material={M.banner} position={[0, 1.0, 0.62]}>
            <planeGeometry args={[0.35, 1.5]} />
          </mesh>
        </group>
      ))}
      {/* foundation skirt into the hillside */}
      <mesh material={M.whiteStone} position={[0, -5, 0]}>
        <cylinderGeometry args={[21.8, 25, 14, 26]} />
      </mesh>
      {tiers.map((r, i) => (
        <group key={i}>
          <mesh material={M.whiteStone} position={[0, i * 4.6 + 2.4, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[r, r + 0.8, 4.8, 26]} />
          </mesh>
          {/* parapet */}
          <mesh material={M.whiteTrim} position={[0, i * 4.6 + 5.0, 0]}>
            <torusGeometry args={[r + 0.35, 0.35, 6, 30]} />
          </mesh>
          {/* gate notch, alternating sides */}
          <mesh material={M.darkStone} position={[Math.cos(i * 2.4) * r, i * 4.6 + 1.8, Math.sin(i * 2.4) * r]}>
            <boxGeometry args={[2.4, 3.6, 2.4]} />
          </mesh>
        </group>
      ))}
      {turrets.map((t, i) => (
        <group key={i} position={[t.x, t.y, t.z]} scale={t.s}>
          <mesh material={M.whiteTrim} castShadow>
            <cylinderGeometry args={[0.9, 1.1, 4.4, 8]} />
          </mesh>
          <mesh material={M.whiteStone} position={[0, 3.2, 0]} castShadow>
            <coneGeometry args={[1.15, 2.2, 8]} />
          </mesh>
        </group>
      ))}
      {/* the prow */}
      <mesh material={M.whiteStone} position={[10, 18, 0]} rotation={[0, 0, -0.14]} castShadow>
        <boxGeometry args={[15, 26, 3.4]} />
      </mesh>
      {/* citadel plaza with the White Tree */}
      <group position={[0, 32.6, 0]}>
        <mesh material={M.silverTrunk} position={[3.4, 1.4, 0]} castShadow>
          <cylinderGeometry args={[0.22, 0.4, 2.8, 6]} />
        </mesh>
        <mesh material={M.paleLeaf} position={[3.4, 3.4, 0]} castShadow>
          <sphereGeometry args={[1.5, 8, 6]} />
        </mesh>
      </group>
      {/* Tower of Ecthelion with corner turrets */}
      <mesh material={M.whiteTrim} position={[0, 39, 0]} castShadow>
        <cylinderGeometry args={[2.0, 2.9, 13, 12]} />
      </mesh>
      {[0, 1, 2, 3].map((k) => (
        <mesh
          key={k}
          material={M.whiteTrim}
          position={[Math.cos((k * Math.PI) / 2) * 2.5, 45, Math.sin((k * Math.PI) / 2) * 2.5]}
          castShadow
        >
          <cylinderGeometry args={[0.4, 0.5, 3.4, 6]} />
        </mesh>
      ))}
      <mesh material={M.whiteTrim} position={[0, 48.2, 0]} castShadow>
        <coneGeometry args={[2.5, 5.4, 12]} />
      </mesh>
      <Lamp color="#fff2d8" intensity={90} distance={100} position={[0, 36, 12]} decay={2} />
    </Grounded>
  );
}

// ── Mordor: Barad-dûr and Mount Doom's living lava ───────────────────────────
function BaradDur() {
  const eyeRef = useRef<THREE.Group>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const eyeTex = useMemo(() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const ctx = cv.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, "rgba(255,240,180,1)");
    g.addColorStop(0.28, "rgba(255,140,40,0.9)");
    g.addColorStop(0.62, "rgba(200,50,10,0.45)");
    g.addColorStop(1, "rgba(120,20,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.ellipse(64, 64, 5, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  useFrame(({ clock }) => {
    if (eyeRef.current) eyeRef.current.rotation.y = clock.elapsedTime * 0.35;
    if (beamRef.current) {
      (beamRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.16 + Math.sin(clock.elapsedTime * 2.2) * 0.05;
    }
  });

  return (
    <Grounded u={0.727} v={0.583}>
      {/* tapering black tower with buttress fins */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} material={M.blackTower} position={[0, 10 + i * 17, 0]} castShadow>
          <cylinderGeometry args={[5.2 - i * 0.85, 6.6 - i * 0.85, 18, 6]} />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((k) => (
        <mesh
          key={k}
          material={M.obsidian}
          position={[Math.cos((k * Math.PI) / 2 + 0.5) * 6.5, 14, Math.sin((k * Math.PI) / 2 + 0.5) * 6.5]}
          rotation={[0, -((k * Math.PI) / 2 + 0.5), 0.22]}
          castShadow
        >
          <coneGeometry args={[1.6, 26, 4]} />
        </mesh>
      ))}
      {/* lava seams at the base */}
      {[0, 1, 2].map((k) => (
        <mesh key={k} material={M.lava} position={[Math.cos(k * 2.1) * 5.8, 4 + k * 2, Math.sin(k * 2.1) * 5.8]} rotation={[0, k, 0.3]}>
          <boxGeometry args={[0.5, 8, 0.5]} />
        </mesh>
      ))}
      {/* spiked crown */}
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <mesh
          key={k}
          material={M.obsidian}
          position={[Math.cos((k * Math.PI) / 3) * 2.6, 89, Math.sin((k * Math.PI) / 3) * 2.6]}
          rotation={[Math.cos((k * Math.PI) / 3) * 0.25, 0, -Math.sin((k * Math.PI) / 3) * 0.25]}
          castShadow
        >
          <coneGeometry args={[0.7, 9, 4]} />
        </mesh>
      ))}
      {/* twin horns */}
      {[-1, 1].map((s2) => (
        <mesh key={s2} material={M.blackTower} position={[s2 * 3.2, 96, 0]} rotation={[0, 0, -s2 * 0.22]} castShadow>
          <coneGeometry args={[1.5, 17, 5]} />
        </mesh>
      ))}
      {/* the Eye */}
      <group ref={eyeRef} position={[0, 91, 0]}>
        <sprite scale={[19, 19, 1]}>
          <spriteMaterial map={eyeTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
        <mesh ref={beamRef} position={[0, -8, 70]} rotation={[Math.PI / 2.3, 0, 0]}>
          <coneGeometry args={[24, 170, 12, 1, true]} />
          <meshBasicMaterial
            color="#ff7a22"
            transparent
            opacity={0.18}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>
      <Lamp color="#ff5a1e" intensity={420} distance={210} position={[0, 91, 0]} decay={1.9} />
    </Grounded>
  );
}

function MountDoom() {
  const cx = toWorldX(0.700);
  const cz = toWorldZ(0.585);
  const lavaGroup = useRef<THREE.Group>(null);

  // lava rivulets draped over the real terrain shape (world coords, y scaled by morph)
  const lavaGeo = useMemo(() => {
    const positions: number[] = [];
    const indices: number[] = [];
    let sd = 5150;
    const rand = () => {
      sd = (sd * 1664525 + 1013904223) >>> 0;
      return sd / 4294967296;
    };
    const dirs = [0.4, 1.7, 3.1, 4.4, 5.5];
    for (const baseA of dirs) {
      const start = positions.length / 3;
      const steps = 14;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const a = baseA + Math.sin(t * 5 + baseA * 3) * 0.14;
        const dist = 8 + t * 88;
        const px = cx + Math.cos(a) * dist;
        const pz = cz + Math.sin(a) * dist;
        const py = heightAt(px, pz) + 0.6;
        const w = (1 - t * 0.6) * (1.6 + rand() * 0.8);
        const nx = -Math.sin(a) * w;
        const nz = Math.cos(a) * w;
        positions.push(px + nx, py, pz + nz, px - nx, py, pz - nz);
        if (i > 0) {
          const b0 = start + (i - 1) * 2;
          indices.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [cx, cz]);

  useFrame(({ clock }) => {
    if (lavaGroup.current) {
      lavaGroup.current.scale.y = Math.max(morph.value, 0.001);
      lavaGroup.current.visible = morph.value > 0.05;
    }
    M.lavaFlow.emissiveIntensity = 2.0 + Math.sin(clock.elapsedTime * 1.7) * 0.5;
    M.lava.emissiveIntensity = 2.4 + Math.sin(clock.elapsedTime * 2.3) * 0.6;
  });

  return (
    <>
      <group ref={lavaGroup}>
        <mesh geometry={lavaGeo} material={M.lavaFlow} />
      </group>
      <Grounded u={0.700} v={0.585}>
        {/* crater glow (Grounded anchors at the crater floor) */}
        <mesh material={M.lava} position={[0, 1.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[9, 18]} />
        </mesh>
        <Plume position={[0, 3, 0]} color="#ff6a1a" count={130} spread={6.5} height={120} size={4} rise={18} opacity={0.7} />
        <Plume position={[0, 6, 0]} color="#40342c" count={80} spread={10} height={180} size={7} rise={10} additive={false} opacity={0.4} />
        <Lamp color="#ff4a12" intensity={520} distance={190} position={[0, 9, 0]} decay={1.9} />
      </Grounded>
    </>
  );
}

// ── Rohan: Edoras, the Golden Hall on its hill ───────────────────────────────
function RohanHouse({ x, z, a, s = 1 }: { x: number; z: number; a: number; s?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, a, 0]} scale={s}>
      <mesh material={M.wood} position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[4.2, 2.4, 3.0]} />
      </mesh>
      <mesh material={M.thatch} position={[0, 3.1, 0]} rotation={[0, 0, 0]} castShadow>
        <coneGeometry args={[2.9, 2.2, 4]} />
      </mesh>
      <mesh material={M.window} position={[2.15, 1.2, 0]}>
        <boxGeometry args={[0.08, 0.8, 0.8]} />
      </mesh>
    </group>
  );
}

function Edoras() {
  return (
    <Grounded u={0.512} v={0.542}>
      {/* Meduseld, the Golden Hall */}
      <group position={[0, 4.5, 0]} rotation={[0, 0.4, 0]}>
        {/* carved plinth and stair */}
        <mesh material={M.greyStone} position={[0, -3.6, 0]} receiveShadow>
          <boxGeometry args={[17, 2.2, 12]} />
        </mesh>
        <mesh material={M.greyStone} position={[8.2, -4.4, 0]} rotation={[0, 0, -0.35]} castShadow>
          <boxGeometry args={[6, 1.4, 4.5]} />
        </mesh>
        <mesh material={M.wood} position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[13, 6, 8.5]} />
        </mesh>
        {/* carved gold door-pillars */}
        {[-1, 1].map((s2) => (
          <mesh key={s2} material={M.gold} position={[6.6, 0.4, s2 * 1.9]} castShadow>
            <cylinderGeometry args={[0.32, 0.4, 5.6, 7]} />
          </mesh>
        ))}
        {/* pitched golden roof */}
        <mesh material={M.gold} position={[0, 5.1, 2.2]} rotation={[0.62, 0, 0]} castShadow>
          <boxGeometry args={[14, 0.5, 6.1]} />
        </mesh>
        <mesh material={M.gold} position={[0, 5.1, -2.2]} rotation={[-0.62, 0, 0]} castShadow>
          <boxGeometry args={[14, 0.5, 6.1]} />
        </mesh>
        <mesh material={M.window} position={[6.55, 0.7, 0]}>
          <boxGeometry args={[0.12, 2.4, 2.4]} />
        </mesh>
        {/* crossed horse-head gables at both ends */}
        {[-1, 1].map((s2) => (
          <group key={s2} position={[s2 * 7.2, 6.7, 0]}>
            <mesh material={M.gold} rotation={[0, 0, s2 * 0.5]} castShadow>
              <boxGeometry args={[0.35, 2.6, 0.35]} />
            </mesh>
            <mesh material={M.gold} rotation={[0, 0, -s2 * 0.5]} castShadow>
              <boxGeometry args={[0.35, 2.6, 0.35]} />
            </mesh>
          </group>
        ))}
        {/* the banner of the Mark */}
        <mesh material={M.bannerGreen} position={[7.4, 4.4, 2.8]}>
          <planeGeometry args={[1.1, 2.0]} />
        </mesh>
      </group>
      {/* the village winding down the hill */}
      <RohanHouse x={12} z={7} a={0.7} s={0.9} />
      <RohanHouse x={16} z={-4} a={-0.4} s={0.8} />
      <RohanHouse x={7} z={-11} a={1.9} s={0.85} />
      <RohanHouse x={-9} z={10} a={2.6} s={0.8} />
      <RohanHouse x={-13} z={-6} a={-1.2} s={0.75} />
      {/* the way up to the hall */}
      <mesh material={M.woodDark} position={[14, 0.25, 2]} rotation={[-Math.PI / 2, 0, 0.5]}>
        <planeGeometry args={[2.6, 16]} />
      </mesh>
      {/* palisade with gate-towers */}
      {Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2;
        if (Math.abs(a - 0.35) < 0.16) return null; // the gate gap, facing the road
        return (
          <mesh key={i} material={M.woodDark} position={[Math.cos(a) * 21, 1.7, Math.sin(a) * 17]} castShadow>
            <boxGeometry args={[0.7, 3.4, 0.7]} />
          </mesh>
        );
      })}
      {[-0.55, 1.25].map((za, i) => (
        <mesh key={"gt" + i} material={M.wood} position={[Math.cos(0.35) * 21, 2.6, Math.sin(0.35) * 17 + (i === 0 ? -3 : 3)]} castShadow>
          <boxGeometry args={[1.4, 5.2, 1.4]} />
        </mesh>
      ))}
    </Grounded>
  );
}

// ── Isengard: the tower of Orthanc in its ring ───────────────────────────────
function Orthanc() {
  return (
    <Grounded u={0.489} v={0.489}>
      <mesh material={M.obsidian} position={[0, 23, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <cylinderGeometry args={[3.2, 5.0, 46, 4]} />
      </mesh>
      {/* glinting facets */}
      <mesh material={M.blackTower} position={[0, 12, 0]} rotation={[0, Math.PI / 4, 0]}>
        <cylinderGeometry args={[4.4, 5.4, 9, 4]} />
      </mesh>
      {/* four prongs of the pinnacle */}
      {[0, 1, 2, 3].map((k) => (
        <mesh
          key={k}
          material={M.obsidian}
          position={[Math.cos((k * Math.PI) / 2 + Math.PI / 4) * 2.4, 50.5, Math.sin((k * Math.PI) / 2 + Math.PI / 4) * 2.4]}
          castShadow
        >
          <boxGeometry args={[1.1, 9.5, 1.1]} />
        </mesh>
      ))}
      {/* the balcony above the door */}
      <mesh material={M.blackTower} position={[3.6, 8, 0]} castShadow>
        <boxGeometry args={[2.2, 0.5, 3.2]} />
      </mesh>
      <mesh material={M.window} position={[4.4, 9.2, 0]}>
        <boxGeometry args={[0.12, 1.4, 1.2]} />
      </mesh>
      {/* the ring-wall of Isengard, gate open to the south */}
      {Array.from({ length: 20 }, (_, i) => {
        const a = (i / 20) * Math.PI * 2;
        if (Math.abs(a - Math.PI / 2) < 0.22) return null; // south gate
        return (
          <mesh key={i} material={M.darkStone} position={[Math.cos(a) * 26, 1.8, Math.sin(a) * 26]} rotation={[0, -a, 0]} castShadow>
            <boxGeometry args={[1.6, 3.6, 8.6]} />
          </mesh>
        );
      })}
      {/* gate pylons */}
      {[-1, 1].map((s2) => (
        <mesh key={s2} material={M.darkStone} position={[s2 * 6.4, 3.2, 25.4]} castShadow>
          <boxGeometry args={[2.2, 6.4, 2.6]} />
        </mesh>
      ))}
      {/* the pits and engines of Saruman */}
      {[
        [12, 8], [-10, 12], [-15, -8], [9, -14],
      ].map(([px, pz], i) => (
        <group key={"pit" + i}>
          <mesh material={M.forge} position={[px, 0.35, pz]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[2.6, 10]} />
          </mesh>
          <Plume position={[px, 1, pz]} color="#5a5148" count={16} spread={1.4} height={26} size={2.8} rise={5} additive={false} opacity={0.35} />
        </group>
      ))}
      {/* dead trees at the wall's foot */}
      {[
        [20, -12, 0.6], [-21, 4, 0.5], [16, 16, 0.55],
      ].map(([tx, tz, ts], i) => (
        <group key={"dt" + i} position={[tx, 0, tz]} scale={ts}>
          <mesh material={M.woodDark} position={[0, 2.4, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.5, 4.8, 5]} />
          </mesh>
          <mesh material={M.woodDark} position={[0.8, 4.6, 0]} rotation={[0, 0, -0.7]} castShadow>
            <cylinderGeometry args={[0.1, 0.18, 2.6, 4]} />
          </mesh>
        </group>
      ))}
    </Grounded>
  );
}

// ── Weathertop: the ruined watchtower of Amon Sûl ────────────────────────────
function Weathertop() {
  const cols = useMemo(() => {
    let sd = 421;
    const rand = () => {
      sd = (sd * 1664525 + 1013904223) >>> 0;
      return sd / 4294967296;
    };
    return Array.from({ length: 8 }, (_, i) => ({
      a: (i / 8) * Math.PI * 2 + rand() * 0.2,
      h: 2.5 + rand() * 4.5,
      lean: (rand() - 0.5) * 0.16,
    }));
  }, []);
  return (
    <Grounded u={0.452} v={0.261}>
      {cols.map((c, i) => (
        <mesh
          key={i}
          material={M.greyStone}
          position={[Math.cos(c.a) * 7.5, c.h / 2, Math.sin(c.a) * 7.5]}
          rotation={[c.lean, 0, c.lean * 1.4]}
          castShadow
        >
          <cylinderGeometry args={[0.75, 0.9, c.h, 7]} />
        </mesh>
      ))}
      {/* the broken ring-wall of Amon Sûl */}
      {[0.3, 1.5, 2.8, 4.1, 5.3].map((a, i) => (
        <mesh
          key={"rw" + i}
          material={M.ruinStone}
          position={[Math.cos(a) * 11.5, 0.9 + (i % 2) * 0.4, Math.sin(a) * 11.5]}
          rotation={[0, -a, (i % 2 ? -1 : 1) * 0.06]}
          castShadow
        >
          <boxGeometry args={[1.2, 1.8 + (i % 3) * 0.8, 7 + (i % 2) * 3]} />
        </mesh>
      ))}
      {/* fallen lintel and tumbled blocks */}
      <mesh material={M.greyStone} position={[2.5, 0.5, -3]} rotation={[0, 0.7, 0.1]} castShadow>
        <boxGeometry args={[6, 1, 1.3]} />
      </mesh>
      {[
        [6, 4, 0.9], [-5, 6, 0.7], [-8, -4, 1.1], [3, 9, 0.6],
      ].map(([bx, bz, bs], i) => (
        <mesh key={"bl" + i} material={M.ruinStone} position={[bx, bs * 0.5, bz]} rotation={[bx, bz, 0]} castShadow>
          <boxGeometry args={[bs * 1.6, bs, bs * 1.2]} />
        </mesh>
      ))}
      <mesh material={M.greyStone} position={[0, 0.35, 0]} receiveShadow>
        <cylinderGeometry args={[9.5, 10.2, 0.7, 14]} />
      </mesh>
    </Grounded>
  );
}

// ── The Grey Havens: a swan-ship at the quay ─────────────────────────────────
function GreyHavens() {
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
        {/* hull */}
        <mesh material={M.whiteTrim} position={[0, 0.6, 0]} castShadow>
          <sphereGeometry args={[1.6, 12, 8]} />
        </mesh>
        <mesh material={M.whiteTrim} position={[0, 1.0, 0]} scale={[4.4, 0.55, 1]} castShadow>
          <sphereGeometry args={[1.6, 12, 8]} />
        </mesh>
        {/* swan prow */}
        <mesh material={M.whiteTrim} position={[6.4, 2.6, 0]} rotation={[0, 0, 1.0]} castShadow>
          <cylinderGeometry args={[0.22, 0.42, 4.4, 7]} />
        </mesh>
        <mesh material={M.whiteTrim} position={[7.3, 4.3, 0]} castShadow>
          <sphereGeometry args={[0.5, 8, 6]} />
        </mesh>
        <mesh material={M.gold} position={[7.9, 4.2, 0]} rotation={[0, 0, -0.5]}>
          <coneGeometry args={[0.16, 0.8, 5]} />
        </mesh>
        {/* mast + sail */}
        <mesh material={M.wood} position={[0, 5, 0]}>
          <cylinderGeometry args={[0.14, 0.2, 8, 6]} />
        </mesh>
        <mesh material={M.sail} position={[-1.4, 5.4, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[5.4, 4.6]} />
        </mesh>
      </group>
      {/* Mithlond — the quays at the head of the Gulf */}
      <Grounded u={0.288} v={0.278}>
        <mesh material={M.whiteStone} position={[0, 1.2, 0]} rotation={[0, -0.35, 0]} castShadow>
          <boxGeometry args={[24, 2.4, 6]} />
        </mesh>
        <mesh material={M.whiteStone} position={[-8, 1.0, 8]} rotation={[0, 0.9, 0]} castShadow>
          <boxGeometry args={[14, 2, 4.5]} />
        </mesh>
        {/* twin lamp-towers of the haven */}
        {[
          [-4, 0], [7, -3],
        ].map(([tx, tz], i) => (
          <group key={i} position={[tx, 0, tz]}>
            <mesh material={M.whiteTrim} position={[0, 4.9, 0]} castShadow>
              <cylinderGeometry args={[1.0, 1.5, 7.5, 8]} />
            </mesh>
            <mesh material={M.whiteTrim} position={[0, 9.4, 0]} castShadow>
              <coneGeometry args={[1.35, 2.8, 8]} />
            </mesh>
            <mesh material={M.window} position={[0, 7.4, 1.15]}>
              <boxGeometry args={[0.5, 0.9, 0.1]} />
            </mesh>
          </group>
        ))}
        {/* lamps along the quay edge */}
        {[-9, -3, 3, 9].map((lx, i) => (
          <group key={"l" + i} position={[lx, 2.4, 2.6]}>
            <mesh material={M.silverTrunk}>
              <cylinderGeometry args={[0.08, 0.1, 2.6, 5]} />
            </mesh>
            <mesh material={M.window} position={[0, 1.5, 0]}>
              <sphereGeometry args={[0.24, 6, 5]} />
            </mesh>
          </group>
        ))}
        <Lamp color="#dfe8ff" intensity={30} distance={50} position={[0, 9, 0]} decay={2} />
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

  // the two pillars
  for (const x of [46, W - 46]) {
    ctx.beginPath();
    ctx.moveTo(x, H - 20);
    ctx.lineTo(x, 96);
    ctx.stroke();
  }
  // arch over the pillars (the tengwar inscription band)
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

  // the hollies — trunks entwining the pillars, crowned with leaves
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

  // crown and anvil of Durin
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

  // seven stars above the crown
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

  // the Star of Fëanor, many-rayed, at the meeting of the doors
  star(W / 2, 196, 26, 8);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(W / 2, 196, 32, 0, Math.PI * 2);
  ctx.stroke();

  // the seam of the two doors
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

function HollyTree({ x = 0, z = 0, s = 1 }: { x?: number; z?: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh material={M.trunk} position={[0, 2.6, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.55, 5.2, 6]} />
      </mesh>
      {[0, 1, 2].map((k) => (
        <mesh key={k} material={M.holly} position={[0, 5.6 + k * 2.0, 0]} castShadow>
          <coneGeometry args={[2.6 - k * 0.7, 3.0, 8]} />
        </mesh>
      ))}
    </group>
  );
}

function MoriaGate() {
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
  const glowRef = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const breathe = 0.9 + Math.sin(clock.elapsedTime * 0.8) * 0.25;
    glowMat.emissiveIntensity = breathe;
    if (glowRef.current) glowRef.current.intensity = 26 * breathe;
  });
  return (
    <Grounded u={0.507} v={0.352}>
      {/* the sheer cliff-wall of the Silvertine, gate face looking west */}
      <mesh material={M.darkStone} position={[10, 16, 0]} castShadow>
        <boxGeometry args={[16, 44, 46]} />
      </mesh>
      <mesh material={M.greyStone} position={[6, 26, -17]} rotation={[0, 0, 0.18]} castShadow>
        <boxGeometry args={[10, 30, 12]} />
      </mesh>
      <mesh material={M.greyStone} position={[6, 24, 17]} rotation={[0, 0, 0.15]} castShadow>
        <boxGeometry args={[10, 26, 12]} />
      </mesh>
      {/* door recess and the stone doors */}
      <mesh material={M.obsidian} position={[1.6, 7.5, 0]}>
        <boxGeometry args={[1.6, 15, 12.5]} />
      </mesh>
      {/* the ithildin design, glowing faintly */}
      <mesh material={glowMat} position={[0.7, 7.6, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[12, 15]} />
      </mesh>
      {/* threshold steps */}
      <mesh material={M.greyStone} position={[-1.6, 0.7, 0]} receiveShadow>
        <boxGeometry args={[5, 1.4, 15]} />
      </mesh>
      <mesh material={M.greyStone} position={[-4.4, 0.25, 0]} receiveShadow>
        <boxGeometry args={[3.4, 0.5, 17]} />
      </mesh>
      {/* the dark pool of the Watcher before the gate */}
      <mesh material={M.blackWater} position={[-16, 0.42, 3]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[13, 22]} />
      </mesh>
      {/* the two hollies of Eregion */}
      <HollyTree x={-3} z={-10.5} s={1.35} />
      <HollyTree x={-3} z={10.5} s={1.2} />
      {/* fallen rubble of the old road */}
      {[
        [-9, -5, 1.4], [-12, 7.5, 1.1], [-6, 6, 0.8], [-20, -6, 1.0],
      ].map(([bx, bz, bs], i) => (
        <mesh key={i} material={M.greyStone} position={[bx, bs * 0.6, bz]} rotation={[bx * 0.3, bz * 0.7, 0.2]} castShadow>
          <dodecahedronGeometry args={[bs, 0]} />
        </mesh>
      ))}
      <Lamp ref={glowRef} color="#9fd8ff" intensity={26} distance={44} position={[-4, 9, 0]} decay={2} />
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
