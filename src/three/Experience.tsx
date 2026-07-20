"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { MAP_W, MAP_H } from "@/data/content";
import { useGame } from "@/state/store";
import { Terrain } from "@/three/Terrain";
import { SkyDome } from "@/three/SkyDome";
import { Clouds } from "@/three/Clouds";
import { Dragon } from "@/three/Dragon";
import { Eagle } from "@/three/Eagle";
import { EagleCry } from "@/three/EagleCry";
import { CameraRig } from "@/three/CameraRig";
import { Weather } from "@/three/Weather";
import { ZoneParticles } from "@/three/Particles";
import { GodRays } from "@/three/GodRays";
import { Landmarks } from "@/three/Landmarks";
import { Waterways } from "@/three/Waterways";
import { Markers } from "@/three/Markers";
import { Beacons } from "@/three/Beacons";
import { LostPages } from "@/three/LostPages";
import { FireBreath } from "@/three/FireBreath";
import { VoiceTriggers } from "@/three/VoiceTriggers";
import { MapExplore } from "@/three/MapExplore";

export function Experience() {
  const quality = useGame((s) => s.quality);
  const mount = useGame((s) => s.mount);

  return (
    <Canvas
      shadows={quality === "high"}
      dpr={quality === "high" ? [1, 2] : [1, 1.25]}
      gl={{
        antialias: quality !== "high",
        powerPreference: "high-performance",
        stencil: false,
      }}
      camera={{
        fov: 55,
        near: 0.5,
        far: 12000,
        position: [MAP_W * 0.38, 640, MAP_H * 0.78],
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.08;
      }}
      style={{ position: "absolute", inset: 0 }}
    >
      <Suspense fallback={null}>
        <SkyDome />
        <Weather />
        <Terrain />
        <Clouds />
        <Waterways />
        <Landmarks />
        <Markers />
        <Beacons />
        <LostPages />
        {mount === "dragon" ? <Dragon /> : <Eagle />}
        {mount === "dragon" ? <FireBreath /> : <EagleCry />}
        <ZoneParticles />
        <GodRays zone="elf" color="#ffd76a" u={0.502} v={0.252} />
        <GodRays zone="gondor" color="#dfe8ff" u={0.607} v={0.607} />
        <VoiceTriggers />
        <MapExplore />
        <CameraRig />
        {quality === "high" && (
          <EffectComposer multisampling={4}>
            <Bloom luminanceThreshold={1.0} mipmapBlur intensity={0.65} />
            <Vignette eskil={false} offset={0.22} darkness={0.58} />
          </EffectComposer>
        )}
      </Suspense>
    </Canvas>
  );
}
