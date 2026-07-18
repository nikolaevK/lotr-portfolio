"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { runtime } from "@/game/runtime";
import { morph } from "@/three/Terrain";
import { toWorldX, toWorldZ } from "@/data/content";
import { heightAt } from "@/three/noise";

function makeRayTexture() {
  const cv = document.createElement("canvas");
  cv.width = 64;
  cv.height = 256;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "rgba(255,255,255,0.55)");
  g.addColorStop(0.6, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 256);
  const side = ctx.createLinearGradient(0, 0, 64, 0);
  side.addColorStop(0, "rgba(0,0,0,1)");
  side.addColorStop(0.25, "rgba(0,0,0,0)");
  side.addColorStop(0.75, "rgba(0,0,0,0)");
  side.addColorStop(1, "rgba(0,0,0,1)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Fake volumetric light shafts over the blessed lands (Elf realms, Gondor). */
export function GodRays({ zone, color, u, v }: { zone: string; color: string; u: number; v: number }) {
  const group = useRef<THREE.Group>(null);
  const texture = useMemo(makeRayTexture, []);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: texture,
        color: new THREE.Color(color),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    [texture, color],
  );

  const shafts = useMemo(() => {
    let sd = 99 + Math.floor(u * 1000);
    const rand = () => {
      sd = (sd * 1664525 + 1013904223) >>> 0;
      return sd / 4294967296;
    };
    return Array.from({ length: 11 }, () => ({
      a: rand() * Math.PI * 2,
      r: 45 + rand() * 150,
      w: 24 + rand() * 34,
      tilt: 0.12 + rand() * 0.1,
      rot: rand() * Math.PI,
    }));
  }, [u]);

  const cx = toWorldX(u);
  const cz = toWorldZ(v);
  const baseY = useMemo(() => Math.max(heightAt(cx, cz), 0), [cx, cz]);

  useFrame((_, dt) => {
    const w = (runtime.zoneWeights[zone] ?? 0) * morph.value;
    mat.opacity = w * 0.34;
    if (group.current) {
      group.current.rotation.y += dt * 0.02;
      group.current.visible = w > 0.02;
      group.current.position.y = baseY * morph.value;
    }
  });

  return (
    <group ref={group} position={[cx, 0, cz]}>
      {shafts.map((s, i) => (
        <mesh
          key={i}
          material={mat}
          position={[Math.cos(s.a) * s.r, 225, Math.sin(s.a) * s.r]}
          rotation={[s.tilt, s.rot, s.tilt * 0.6]}
        >
          <planeGeometry args={[s.w, 480]} />
        </mesh>
      ))}
    </group>
  );
}
