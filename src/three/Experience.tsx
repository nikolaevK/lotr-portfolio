"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette, N8AO } from "@react-three/postprocessing";
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
import { Figures } from "@/three/Figures";
import { Waterways } from "@/three/Waterways";
import { Markers } from "@/three/Markers";
import { Beacons } from "@/three/Beacons";
import { LostPages } from "@/three/LostPages";
import { FireBreath } from "@/three/FireBreath";
import { VoiceTriggers } from "@/three/VoiceTriggers";
import { MapExplore } from "@/three/MapExplore";
import { SkyEnvironment } from "@/three/SkyEnvironment";

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
        gl.toneMappingExposure = 1.05;
        // soft shadows cost one extra tap set but hide the stair-stepping that
        // a 2048 map shows on the long silhouettes of walls and wings
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
      // touchAction none: iOS ignores user-scalable=no, so without this a
      // two-finger map pinch starts native page zoom and cancels our pointers
      style={{ position: "absolute", inset: 0, touchAction: "none" }}
    >
      <Suspense fallback={null}>
        <SkyDome />
        <SkyEnvironment />
        <Weather />
        <Terrain />
        <Clouds />
        <Waterways />
        <Landmarks />
        <Figures />
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
            {/* contact shading in the streets, under eaves and inside the
                gate-arches — half-res keeps it around a millisecond */}
            <N8AO halfRes aoRadius={5} distanceFalloff={0.6} intensity={2.2} quality="low" color="#241b12" />
            <Bloom luminanceThreshold={0.92} mipmapBlur intensity={0.6} radius={0.7} />
            <Vignette eskil={false} offset={0.22} darkness={0.58} />
          </EffectComposer>
        )}
      </Suspense>
    </Canvas>
  );
}
