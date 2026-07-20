"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { toWorldX, toWorldZ, type Beacon } from "@/data/content";
import { useContent } from "@/state/content";
import { heightAt } from "@/three/noise";
import { morph } from "@/three/Terrain";
import { useGame } from "@/state/store";
import { Plume } from "@/three/Particles";

const stone = new THREE.MeshStandardMaterial({ color: "#8a8378", roughness: 0.95 });
const woodMat = new THREE.MeshStandardMaterial({ color: "#4a3418", roughness: 0.9 });

function BeaconPyre({ beacon }: { beacon: Beacon }) {
  const lit = useGame((s) => !!s.beacons[beacon.id]);
  const group = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const x = toWorldX(beacon.x);
  const z = toWorldZ(beacon.y);
  const baseY = useMemo(() => heightAt(x, z), [x, z]);

  useFrame(({ clock }) => {
    if (group.current) {
      group.current.position.y = baseY * morph.value;
      group.current.visible = morph.value > 0.05;
    }
    if (light.current) {
      const target = lit ? 140 + Math.sin(clock.elapsedTime * 11) * 30 + Math.sin(clock.elapsedTime * 23) * 18 : 0;
      light.current.intensity += (target - light.current.intensity) * 0.2;
    }
  });

  return (
    <group ref={group} position={[x, 0, z]}>
      <mesh material={stone} position={[0, 1.8, 0]} castShadow>
        <cylinderGeometry args={[5.2, 6.4, 3.8, 10]} />
      </mesh>
      {/* stacked pyre */}
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          material={woodMat}
          position={[0, 4.3 + i * 0.9, 0]}
          rotation={[0, (i * Math.PI) / 4, Math.PI / 2]}
          castShadow
        >
          <cylinderGeometry args={[0.5, 0.5, 8 - i * 1.1, 6]} />
        </mesh>
      ))}
      {lit && (
        <>
          <Plume position={[0, 5.2, 0]} color="#ffa63e" count={90} spread={3.2} height={30} size={4.2} rise={16} opacity={0.85} />
          <Plume position={[0, 15, 0]} color="#4a4038" count={50} spread={4.4} height={100} size={6} rise={9} additive={false} opacity={0.35} />
        </>
      )}
      <pointLight ref={light} color="#ff9a3e" intensity={0} distance={140} position={[0, 9, 0]} decay={1.8} />
    </group>
  );
}

export function Beacons() {
  const beacons = useContent((c) => c.beacons);
  return (
    <group>
      {beacons.map((b) => (
        <BeaconPyre key={b.id} beacon={b} />
      ))}
    </group>
  );
}
