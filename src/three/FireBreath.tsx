"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { runtime } from "@/game/runtime";
import { BEACONS, toWorldX, toWorldZ } from "@/data/content";
import { heightAt } from "@/three/noise";
import { game, useGame } from "@/state/store";

const MAX = 480;

export function FireBreath() {
  const quality = useGame((s) => s.quality);
  const light = useRef<THREE.PointLight>(null);

  const sim = useMemo(() => {
    const positions = new Float32Array(MAX * 3);
    const life = new Float32Array(MAX).fill(-1); // <0 dead, else 0..1
    const seeds = new Float32Array(MAX);
    const vels = new Float32Array(MAX * 3);
    for (let i = 0; i < MAX; i++) seeds[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aLife", new THREE.BufferAttribute(life, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: /* glsl */ `
        attribute float aLife;
        attribute float aSeed;
        varying float vLife;
        varying float vSeed;
        void main() {
          vLife = aLife;
          vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float size = mix(3.0, 16.0, clamp(aLife, 0.0, 1.0)) * (0.7 + aSeed * 0.6);
          gl_PointSize = size * (260.0 / max(1.0, -mv.z));
          if (aLife < 0.0) gl_PointSize = 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vLife;
        varying float vSeed;
        void main() {
          if (vLife < 0.0) discard;
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float m = smoothstep(0.5, 0.06, d);
          vec3 col;
          float t = vLife;
          if (t < 0.22) col = mix(vec3(1.0, 0.97, 0.78), vec3(1.0, 0.74, 0.24), t / 0.22);
          else if (t < 0.55) col = mix(vec3(1.0, 0.74, 0.24), vec3(0.92, 0.32, 0.10), (t - 0.22) / 0.33);
          else col = mix(vec3(0.92, 0.32, 0.10), vec3(0.22, 0.11, 0.08), (t - 0.55) / 0.45);
          float alpha = m * (1.0 - smoothstep(0.62, 1.0, t)) * 0.9;
          gl_FragColor = vec4(col * (2.3 - t * 1.2), alpha);
        }`,
    });
    return { geo, mat, positions, life, vels, spawnAcc: 0, cursor: 0 };
  }, []);

  const beaconWorld = useMemo(
    () =>
      BEACONS.map((b) => ({
        id: b.id,
        x: toWorldX(b.x),
        z: toWorldZ(b.y),
        get y() {
          return heightAt(this.x, this.z);
        },
      })),
    [],
  );

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const { positions, life, vels } = sim;
    const rate = quality === "high" ? 300 : 190;

    if (runtime.firing) {
      sim.spawnAcc += dt * rate;
      while (sim.spawnAcc >= 1) {
        sim.spawnAcc -= 1;
        const i = sim.cursor;
        sim.cursor = (sim.cursor + 1) % MAX;
        positions[i * 3] = runtime.mouthPos.x;
        positions[i * 3 + 1] = runtime.mouthPos.y;
        positions[i * 3 + 2] = runtime.mouthPos.z;
        const spread = 0.16;
        const jx = (Math.random() - 0.5) * spread;
        const jy = (Math.random() - 0.5) * spread;
        const jz = (Math.random() - 0.5) * spread;
        const sp = 72 + Math.random() * 32;
        vels[i * 3] = (runtime.mouthDir.x + jx) * sp + runtime.vel.x * 0.6;
        vels[i * 3 + 1] = (runtime.mouthDir.y + jy) * sp + 2;
        vels[i * 3 + 2] = (runtime.mouthDir.z + jz) * sp + runtime.vel.z * 0.6;
        life[i] = 0.001;
      }
    } else {
      sim.spawnAcc = 0;
    }

    for (let i = 0; i < MAX; i++) {
      if (life[i] < 0) continue;
      life[i] += dt * 1.25;
      if (life[i] >= 1) {
        life[i] = -1;
        continue;
      }
      const drag = Math.exp(-1.9 * dt);
      vels[i * 3] *= drag;
      vels[i * 3 + 1] = vels[i * 3 + 1] * drag + 22 * dt; // buoyancy
      vels[i * 3 + 2] *= drag;
      positions[i * 3] += vels[i * 3] * dt;
      positions[i * 3 + 1] += vels[i * 3 + 1] * dt;
      positions[i * 3 + 2] += vels[i * 3 + 2] * dt;
    }
    (sim.geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (sim.geo.getAttribute("aLife") as THREE.BufferAttribute).needsUpdate = true;

    // mouth glow
    if (light.current) {
      const on = runtime.firing ? 1 : 0;
      light.current.intensity += (on * (240 + Math.random() * 120) - light.current.intensity) * Math.min(1, 10 * dt);
      light.current.position.copy(runtime.mouthPos).addScaledVector(runtime.mouthDir, 7);
    }

    // ignite the Beacons of Gondor
    if (runtime.firing) {
      const st = game();
      for (const b of beaconWorld) {
        if (st.beacons[b.id]) continue;
        const dx = b.x - runtime.mouthPos.x;
        const dy = b.y + 8 - runtime.mouthPos.y;
        const dz = b.z - runtime.mouthPos.z;
        const proj = dx * runtime.mouthDir.x + dy * runtime.mouthDir.y + dz * runtime.mouthDir.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const perp = Math.sqrt(Math.max(0, d2 - proj * proj));
        if (proj > 0 && proj < 54 && perp < 18) {
          st.lightBeacon(b.id);
          runtime.shake = Math.max(runtime.shake, 0.5);
        }
      }
    }
  });

  return (
    <group>
      <points geometry={sim.geo} material={sim.mat} frustumCulled={false} />
      <pointLight ref={light} color="#ff8a2e" intensity={0} distance={110} decay={1.8} />
    </group>
  );
}
