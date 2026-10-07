"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette, N8AO } from "@react-three/postprocessing";
import * as THREE from "three";
import type { EffectComposer as ComposerImpl } from "postprocessing";
import { MAP_W, MAP_H } from "@/data/content";
import { useGame } from "@/state/store";
import { Terrain } from "@/three/Terrain";
import { Forests } from "@/three/Forests";
import { SkyDome } from "@/three/SkyDome";
import { Clouds } from "@/three/Clouds";
import { Dragon } from "@/three/Dragon";
import { Eagle } from "@/three/Eagle";
import { EagleCry } from "@/three/EagleCry";
import { CameraRig } from "@/three/CameraRig";
import { Fauna } from "@/three/Fauna";
import { Trials } from "@/three/Trials";
import { Cinematics } from "@/three/Cinematics";
import { PhotoMode } from "@/three/PhotoMode";
import { Weather } from "@/three/Weather";
import { ZoneParticles } from "@/three/Particles";
import { GodRays } from "@/three/GodRays";
import { Landmarks } from "@/three/Landmarks";
import { Figures } from "@/three/Figures";
import { Markers } from "@/three/Markers";
import { Beacons } from "@/three/Beacons";
import { LostPages } from "@/three/LostPages";
import { FireBreath } from "@/three/FireBreath";
import { VoiceTriggers } from "@/three/VoiceTriggers";
import { MapExplore } from "@/three/MapExplore";
import { SkyEnvironment } from "@/three/SkyEnvironment";

/**
 * Holds the frame rate by trading resolution: when frames run long the
 * drawing-buffer DPR steps down, and it creeps back up once there is
 * headroom. A step that immediately has to be undone lowers the ceiling, so
 * it settles instead of oscillating. Fill rate is what retina screens and
 * integrated GPUs run out of first — the terrain and post passes are per pixel.
 */
function AdaptiveResolution({ max }: { max: number }) {
  const setDpr = useThree((s) => s.setDpr);
  const get = useThree((s) => s.get);
  const st = useRef({ t: 0, n: 0, ceil: max, lastUp: -1e9, clock: 0 });
  useFrame((_, dt) => {
    const s = st.current;
    s.clock += dt;
    if (dt > 0.25) return; // a hidden tab or a hitch, not a trend
    s.t += dt;
    s.n++;
    if (s.t < 1.25) return;
    const avg = s.t / s.n;
    s.t = 0;
    s.n = 0;
    // read the live value: the Canvas puts its own dpr prop back whenever it
    // re-renders (a steed switch, a resize), so a cached copy goes stale
    const dpr = get().viewport.dpr;
    if (avg > 1 / 46 && dpr > 1) {
      // undoing an increase within a few seconds: that level was too much
      if (s.clock - s.lastUp < 4) s.ceil = Math.max(1, dpr - 0.25);
      setDpr(Math.max(1, dpr - 0.25));
    } else if (avg < 1 / 57 && dpr < Math.min(max, s.ceil)) {
      s.lastUp = s.clock;
      setDpr(Math.min(max, s.ceil, dpr + 0.25));
    }
  });
  return null;
}

/**
 * Post stack. MSAA is skipped on screens that already supersample — decided
 * once: a new value would build a new composer (and orphan the old one's
 * buffers). The composer only follows CSS-size changes by itself, so it is
 * resized here when the adaptive DPR moves, or its buffers keep the old
 * resolution and stepping down saves nothing.
 */
function Post() {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const [msaa] = useState(() => (gl.getPixelRatio() > 1.5 ? 0 : 4));
  const composer = useRef<ComposerImpl>(null);
  useEffect(() => {
    composer.current?.setSize(size.width, size.height);
  }, [dpr, size]);
  // the library never disposes its composer, so switching to low detail
  // would strand its render targets on the GPU. Deferred: StrictMode's
  // rehearsal unmount is followed at once by a remount of the same composer.
  const live = useRef(false);
  useEffect(() => {
    live.current = true;
    const c = composer.current;
    return () => {
      live.current = false;
      setTimeout(() => {
        if (!live.current) c?.dispose();
      });
    };
  }, []);
  return (
    <EffectComposer ref={composer} multisampling={msaa}>
      {/* contact shading in the streets, under eaves and inside the
          gate-arches — half-res keeps it around a millisecond */}
      <N8AO halfRes aoRadius={5} distanceFalloff={0.6} intensity={2.2} quality="low" color="#241b12" />
      <Bloom luminanceThreshold={0.92} mipmapBlur intensity={0.6} radius={0.7} />
      <Vignette eskil={false} offset={0.22} darkness={0.58} />
    </EffectComposer>
  );
}

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
        <Forests />
        <Clouds />
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
        <Fauna />
        <Trials />
        <Cinematics />
        <PhotoMode />
        <MapExplore />
        <CameraRig />
        {quality === "high" && <Post />}
        <AdaptiveResolution key={quality} max={Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio, quality === "high" ? 2 : 1.25)} />
      </Suspense>
    </Canvas>
  );
}
