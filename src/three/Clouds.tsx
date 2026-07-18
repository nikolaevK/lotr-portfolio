"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MAP_W, MAP_H } from "@/data/content";
import { runtime } from "@/game/runtime";
import { morph } from "@/three/Terrain";
import { useGame } from "@/state/store";

/** Cloud tint — lerped by the Weather system (dark under Mordor). */
export const cloudState = { tint: new THREE.Color("#f6efe0"), opacity: 0.8 };

function makePuffTexture() {
  const S = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.45, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const COUNT = 60;

export function Clouds() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const quality = useGame((s) => s.quality);
  const texture = useMemo(makePuffTexture, []);

  const puffs = useMemo(() => {
    const rand = (() => {
      let s = 4242;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
    })();
    return Array.from({ length: COUNT }, () => ({
      x: rand() * MAP_W,
      z: rand() * MAP_H,
      y: 190 + rand() * 150,
      s: 95 + rand() * 220,
      drift: 0.5 + rand() * 1.2,
      wobble: rand() * Math.PI * 2,
    }));
  }, []);

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        opacity: 0.8,
        fog: true,
      }),
    [texture],
  );

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ camera }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const mesh = ref.current;
    if (!mesh) return;
    const n = quality === "high" ? COUNT : Math.floor(COUNT * 0.55);
    mesh.count = n;
    material.opacity = cloudState.opacity * (0.25 + 0.75 * morph.value);
    material.color.copy(cloudState.tint);
    for (let i = 0; i < n; i++) {
      const p = puffs[i];
      p.x += runtime.wind.x * p.drift * dt * 7;
      p.z += runtime.wind.y * p.drift * dt * 7;
      if (p.x > MAP_W + 300) p.x = -300;
      if (p.x < -300) p.x = MAP_W + 300;
      if (p.z > MAP_H + 300) p.z = -300;
      if (p.z < -300) p.z = MAP_H + 300;
      dummy.position.set(p.x, p.y + Math.sin(p.wobble + performance.now() * 0.00013 * p.drift) * 6, p.z);
      dummy.scale.setScalar(p.s);
      dummy.quaternion.copy(camera.quaternion); // billboard
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, COUNT]} material={material} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
    </instancedMesh>
  );
}
