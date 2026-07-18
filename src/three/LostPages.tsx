"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { LOST_PAGES, toWorldX, toWorldZ } from "@/data/content";
import { heightAt } from "@/three/noise";
import { morph } from "@/three/Terrain";
import { runtime } from "@/game/runtime";
import { game, useGame } from "@/state/store";

function makePageTexture() {
  const cv = document.createElement("canvas");
  cv.width = 96;
  cv.height = 128;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#efe3c2";
  ctx.fillRect(0, 0, 96, 128);
  ctx.strokeStyle = "#c9b485";
  ctx.lineWidth = 3;
  ctx.strokeRect(3, 3, 90, 122);
  ctx.strokeStyle = "#8a6f38";
  ctx.lineWidth = 2;
  for (let y = 22; y < 118; y += 12) {
    ctx.beginPath();
    ctx.moveTo(12, y);
    ctx.lineTo(12 + 60 + Math.random() * 14, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#8c2114";
  ctx.font = "700 26px serif";
  ctx.fillText("ᚱ", 66, 116);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function LostPages() {
  const pages = useGame((s) => s.pages);
  const texture = useMemo(makePageTexture, []);
  const refs = useRef<(THREE.Group | null)[]>([]);

  const spots = useMemo(
    () =>
      LOST_PAGES.map((p) => {
        const x = toWorldX(p.x);
        const z = toWorldZ(p.y);
        return { id: p.id, x, z, baseY: Math.max(heightAt(x, z), 2) };
      }),
    [],
  );

  const pageMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: texture,
        side: THREE.DoubleSide,
        roughness: 0.85,
        emissive: "#7a6428",
        emissiveIntensity: 0.25,
      }),
    [texture],
  );

  const glintMat = useMemo(
    () =>
      new THREE.SpriteMaterial({
        color: "#ffe9a8",
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        map: (() => {
          const cv = document.createElement("canvas");
          cv.width = cv.height = 64;
          const ctx = cv.getContext("2d")!;
          const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
          g.addColorStop(0, "rgba(255,244,200,1)");
          g.addColorStop(1, "rgba(255,244,200,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, 64, 64);
          return new THREE.CanvasTexture(cv);
        })(),
      }),
    [],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const st = game();
    for (let i = 0; i < spots.length; i++) {
      const g = refs.current[i];
      const spot = spots[i];
      if (!g) continue;
      const collected = !!st.pages[spot.id];
      g.visible = !collected && morph.value > 0.4;
      if (!g.visible) continue;
      const y = spot.baseY * morph.value + 12 + Math.sin(t * 1.4 + i * 2.1) * 1.8;
      g.position.set(spot.x, y, spot.z);
      g.rotation.y = t * 0.9 + i;
      // collect on fly-through
      const d = runtime.pos.distanceTo(g.position);
      if (d < 22 && st.phase === "map") st.collectPage(spot.id);
    }
  });

  // re-render on collect to drop hidden ones (visibility handled per-frame anyway)
  void pages;

  return (
    <group>
      {spots.map((s, i) => (
        <group key={s.id} ref={(el) => { refs.current[i] = el; }}>
          <mesh material={pageMat} castShadow>
            <planeGeometry args={[4.4, 5.8]} />
          </mesh>
          <sprite material={glintMat} scale={[10, 10, 1]} />
        </group>
      ))}
    </group>
  );
}
