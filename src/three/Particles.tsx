"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { runtime } from "@/game/runtime";
import { morph } from "@/three/Terrain";
import { useGame } from "@/state/store";

/**
 * GPU zone particles — one Points cloud per weather zone, wrapped in a box
 * that follows the dragon. Motion runs fully in the vertex shader.
 * Motion types: 0 rise (embers) · 1 fall+flutter (leaves) · 2 twinkle
 * (elf-light) · 3 slow ash-fall · 4 drifting motes (Gondor silver).
 */
interface ZoneDef {
  zone: string;
  count: number;
  color: string;
  size: number;
  motion: 0 | 1 | 2 | 3 | 4;
  additive: boolean;
  glow: number;
}

const ZONES: ZoneDef[] = [
  { zone: "mordor", count: 380, color: "#ff7a22", size: 2.6, motion: 0, additive: true, glow: 1.0 },
  { zone: "shire", count: 220, color: "#9fbe5e", size: 2.8, motion: 1, additive: false, glow: 0.15 },
  { zone: "elf", count: 260, color: "#ffe9a8", size: 2.4, motion: 2, additive: true, glow: 0.9 },
  { zone: "dwarf", count: 260, color: "#d9cfc0", size: 2.0, motion: 3, additive: false, glow: 0.1 },
  { zone: "gondor", count: 210, color: "#eef4ff", size: 2.0, motion: 4, additive: true, glow: 0.7 },
];

const BOX = new THREE.Vector3(680, 180, 680);

function ZoneCloud({ def }: { def: ZoneDef }) {
  const quality = useGame((s) => s.quality);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const { geo, mat } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(def.count * 3);
    const seed = new Float32Array(def.count * 4);
    let sd = 1234 + def.motion * 999;
    const rand = () => {
      sd = (sd * 1664525 + 1013904223) >>> 0;
      return sd / 4294967296;
    };
    for (let i = 0; i < def.count; i++) {
      pos[i * 3] = rand() * BOX.x;
      pos[i * 3 + 1] = rand() * BOX.y;
      pos[i * 3 + 2] = rand() * BOX.z;
      seed[i * 4] = rand();
      seed[i * 4 + 1] = rand();
      seed[i * 4 + 2] = rand();
      seed[i * 4 + 3] = 0.5 + rand();
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: def.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color(def.color) },
        uSize: { value: def.size },
        uGlow: { value: def.glow },
        uWind: { value: new THREE.Vector2(1, 0) },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform vec3 uCenter;
        uniform vec2 uWind;
        uniform float uSize;
        varying float vTw;
        const vec3 BOX = vec3(${BOX.x.toFixed(1)}, ${BOX.y.toFixed(1)}, ${BOX.z.toFixed(1)});
        void main() {
          vec3 p = position;
          float t = uTime * aSeed.w;
          #if MOTION == 0
            p.y += t * 26.0;                       // embers rise
            p.x += sin(t * 2.1 + aSeed.x * 40.0) * 6.0 + uWind.x * t * 6.0;
            p.z += cos(t * 1.7 + aSeed.y * 40.0) * 6.0 + uWind.y * t * 6.0;
            vTw = 0.75 + 0.25 * sin(t * 9.0 + aSeed.z * 50.0);
          #elif MOTION == 1
            p.y -= t * 9.0;                        // leaves flutter down
            p.x += sin(t * 2.4 + aSeed.x * 30.0) * 9.0 + uWind.x * t * 12.0;
            p.z += cos(t * 1.9 + aSeed.y * 30.0) * 7.0 + uWind.y * t * 12.0;
            vTw = 0.7 + 0.3 * sin(t * 5.0 + aSeed.z * 20.0);
          #elif MOTION == 2
            p.y += sin(t * 0.8 + aSeed.x * 20.0) * 4.0;  // hovering elf-light
            p.x += sin(t * 0.5 + aSeed.y * 25.0) * 5.0;
            vTw = pow(0.5 + 0.5 * sin(t * 2.4 + aSeed.z * 60.0), 2.0);
          #elif MOTION == 3
            p.y -= t * 5.5;                        // ash sifts down
            p.x += uWind.x * t * 9.0 + sin(t + aSeed.x * 20.0) * 3.0;
            p.z += uWind.y * t * 9.0;
            vTw = 0.8;
          #else
            p.y += t * 3.5;                        // silver motes drift up
            p.x += sin(t * 0.7 + aSeed.x * 30.0) * 4.0;
            vTw = pow(0.5 + 0.5 * sin(t * 1.8 + aSeed.z * 40.0), 1.5);
          #endif
          vec3 rel = mod(p, BOX) - BOX * 0.5;
          vec3 world = uCenter + rel;
          vec4 mv = viewMatrix * vec4(world, 1.0);
          gl_PointSize = uSize * aSeed.w * (170.0 / max(1.0, -mv.z)) * (0.6 + 0.4 * vTw);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uGlow;
        varying float vTw;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float m = smoothstep(0.5, 0.08, d);
          vec3 col = uColor * (1.0 + uGlow * vTw);
          gl_FragColor = vec4(col, m * uOpacity * vTw);
        }`,
      defines: { MOTION: def.motion },
    });
    return { geo: g, mat: m };
  }, [def]);

  useFrame((_, dt) => {
    const m = matRef.current ?? mat;
    m.uniforms.uTime.value += Math.min(dt, 0.05);
    m.uniforms.uCenter.value.copy(runtime.pos);
    m.uniforms.uWind.value.set(runtime.wind.x, runtime.wind.y);
    const w = (runtime.zoneWeights[def.zone] ?? 0) * morph.value;
    m.uniforms.uOpacity.value = w * (def.additive ? 0.9 : 0.75);
  });

  const drawCount = quality === "high" ? def.count : Math.floor(def.count * 0.5);
  geo.setDrawRange(0, drawCount);

  return <points geometry={geo} material={mat} ref={(p) => { if (p) matRef.current = p.material as THREE.ShaderMaterial; }} frustumCulled={false} />;
}

export function ZoneParticles() {
  return (
    <group>
      {ZONES.map((z) => (
        <ZoneCloud key={z.zone} def={z} />
      ))}
    </group>
  );
}

/** Always-on plume (Mount Doom embers / Erebor forge-smoke / beacon smoke). */
export function Plume({
  position,
  color = "#ff7a22",
  count = 90,
  spread = 10,
  height = 90,
  size = 3,
  rise = 16,
  additive = true,
  opacity = 0.55,
}: {
  position: [number, number, number];
  color?: string;
  count?: number;
  spread?: number;
  height?: number;
  size?: number;
  rise?: number;
  additive?: boolean;
  opacity?: number;
}) {
  const { geo, mat } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    let sd = 777 + count;
    const rand = () => {
      sd = (sd * 1664525 + 1013904223) >>> 0;
      return sd / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * spread;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = rand() * height;
      pos[i * 3 + 2] = Math.sin(a) * r;
      seed[i * 4] = rand();
      seed[i * 4 + 1] = rand();
      seed[i * 4 + 2] = rand();
      seed[i * 4 + 3] = 0.5 + rand();
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, height / 2, 0), height + spread * 4);
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uSize: { value: size },
        uH: { value: height },
        uRise: { value: rise },
        uOpacity: { value: opacity },
        uMorph: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform float uH;
        uniform float uSize;
        uniform float uRise;
        varying float vFade;
        void main() {
          vec3 p = position;
          float t = uTime * aSeed.w;
          p.y = mod(p.y + t * uRise, uH);
          float k = p.y / uH;
          p.x += sin(t * 1.3 + aSeed.x * 30.0) * (2.0 + k * 9.0);
          p.z += cos(t * 1.1 + aSeed.y * 30.0) * (2.0 + k * 9.0);
          vFade = (1.0 - k) * (0.4 + 0.6 * sin(t * 6.0 + aSeed.z * 40.0));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * aSeed.w * (1.0 + k * 2.4) * (150.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uMorph;
        varying float vFade;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float m = smoothstep(0.5, 0.1, length(c));
          gl_FragColor = vec4(uColor, m * vFade * uOpacity * uMorph);
        }`,
    });
    return { geo: g, mat: m };
  }, [count, spread, height, size, color, additive, opacity, rise]);

  useFrame((_, dt) => {
    mat.uniforms.uTime.value += Math.min(dt, 0.05);
    mat.uniforms.uMorph.value = morph.value;
  });

  return <points geometry={geo} material={mat} position={position} frustumCulled={false} />;
}
