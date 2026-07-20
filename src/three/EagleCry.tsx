"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { runtime } from "@/game/runtime";
import { input } from "@/input/controls";
import { game } from "@/state/store";
import { morph } from "@/three/Terrain";
import { audio } from "@/audio/engine";
import { toWorldX, toWorldZ } from "@/data/content";
import { useContent } from "@/state/content";
import { heightAt } from "@/three/noise";

const RING_LIFE = 0.8;
const CRY_COOLDOWN = 1.35;
const CRY_REACH = 52; // beacons within this range answer the Windlord

interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number; // ≥RING_LIFE = idle
}

const GUST_MAX = 90;

/** The Great Eagle's battle-cry: a rippling gust that kindles the beacons. */
export function EagleCry() {
  const state = useRef({ cooldown: 0, wasDown: false });

  const rings = useMemo<Ring[]>(() => {
    const geo = new THREE.RingGeometry(0.82, 1, 48);
    geo.rotateX(-Math.PI / 2);
    return Array.from({ length: 3 }, () => {
      const mat = new THREE.MeshBasicMaterial({
        color: "#f4e6c0",
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      return { mesh, mat, t: RING_LIFE };
    });
  }, []);

  const gust = useMemo(() => {
    const positions = new Float32Array(GUST_MAX * 3);
    const life = new Float32Array(GUST_MAX).fill(-1);
    const vels = new Float32Array(GUST_MAX * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aLife", new THREE.BufferAttribute(life, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aLife;
        varying float vLife;
        void main() {
          vLife = aLife;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = mix(4.0, 10.0, clamp(aLife, 0.0, 1.0)) * (240.0 / max(1.0, -mv.z));
          if (aLife < 0.0) gl_PointSize = 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vLife;
        void main() {
          if (vLife < 0.0) discard;
          vec2 c = gl_PointCoord - 0.5;
          float m = smoothstep(0.5, 0.1, length(c));
          float a = m * (1.0 - vLife) * 0.55;
          gl_FragColor = vec4(vec3(0.96, 0.92, 0.78), a);
        }`,
    });
    return { geo, mat, positions, life, vels, cursor: 0 };
  }, []);

  const beacons = useContent((c) => c.beacons);
  const beaconWorld = useMemo(
    () =>
      beacons.map((b) => {
        const x = toWorldX(b.x);
        const z = toWorldZ(b.y);
        return { id: b.id, x, z, y: heightAt(x, z) };
      }),
    [beacons],
  );

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const st = state.current;
    const s = game();
    const frozen = s.phase !== "map" || !!s.region || s.contactOpen || morph.value < 0.55;
    st.cooldown = Math.max(0, st.cooldown - dt);

    const down = input.fire && !frozen;
    const trigger = down && st.cooldown <= 0;
    st.wasDown = down;

    if (trigger) {
      st.cooldown = CRY_COOLDOWN;
      audio.screech();
      runtime.shake = Math.max(runtime.shake, 0.22);

      // ring from the eagle, level with it
      const ring = rings.find((r) => r.t >= RING_LIFE) ?? rings[0];
      ring.t = 0;
      ring.mesh.visible = true;
      ring.mesh.position.copy(runtime.pos);
      ring.mesh.position.y -= 2;

      // feather-white gust burst
      for (let i = 0; i < 34; i++) {
        const gi = gust.cursor;
        gust.cursor = (gust.cursor + 1) % GUST_MAX;
        const a = Math.random() * Math.PI * 2;
        const sp = 30 + Math.random() * 24;
        gust.positions[gi * 3] = runtime.pos.x;
        gust.positions[gi * 3 + 1] = runtime.pos.y + (Math.random() - 0.5) * 2;
        gust.positions[gi * 3 + 2] = runtime.pos.z;
        gust.vels[gi * 3] = Math.cos(a) * sp + runtime.vel.x * 0.3;
        gust.vels[gi * 3 + 1] = 3 + Math.random() * 5;
        gust.vels[gi * 3 + 2] = Math.sin(a) * sp + runtime.vel.z * 0.3;
        gust.life[gi] = 0.001;
      }

      // the beacons answer the Windlord's cry
      for (const b of beaconWorld) {
        if (s.beacons[b.id]) continue;
        const d = Math.hypot(b.x - runtime.pos.x, b.z - runtime.pos.z);
        const dy = Math.abs(b.y - runtime.pos.y);
        if (d < CRY_REACH && dy < 55) {
          s.lightBeacon(b.id);
          runtime.shake = Math.max(runtime.shake, 0.5);
        }
      }
    }

    // animate rings
    for (const r of rings) {
      if (r.t >= RING_LIFE) {
        r.mesh.visible = false;
        continue;
      }
      r.t += dt;
      const k = r.t / RING_LIFE;
      const e = 1 - Math.pow(1 - k, 2.4);
      r.mesh.scale.setScalar(3 + e * 62);
      r.mat.opacity = (1 - k) * 0.7;
    }

    // animate gust
    for (let i = 0; i < GUST_MAX; i++) {
      if (gust.life[i] < 0) continue;
      gust.life[i] += dt * 1.8;
      if (gust.life[i] >= 1) {
        gust.life[i] = -1;
        continue;
      }
      const drag = Math.exp(-2.6 * dt);
      gust.vels[i * 3] *= drag;
      gust.vels[i * 3 + 1] *= drag;
      gust.vels[i * 3 + 2] *= drag;
      gust.positions[i * 3] += gust.vels[i * 3] * dt;
      gust.positions[i * 3 + 1] += gust.vels[i * 3 + 1] * dt;
      gust.positions[i * 3 + 2] += gust.vels[i * 3 + 2] * dt;
    }
    (gust.geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (gust.geo.getAttribute("aLife") as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <group>
      {rings.map((r, i) => (
        <primitive key={i} object={r.mesh} />
      ))}
      <points geometry={gust.geo} material={gust.mat} frustumCulled={false} />
    </group>
  );
}
