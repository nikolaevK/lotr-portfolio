"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { toWorldX, toWorldZ } from "@/data/content";
import { content } from "@/state/content";
import { runtime } from "@/game/runtime";
import { game, useGame } from "@/state/store";
import { skyUniforms } from "@/three/SkyDome";
import { cloudState } from "@/three/Clouds";
import { morph } from "@/three/Terrain";
import { audio } from "@/audio/engine";
import { heightAt } from "@/three/noise";

interface Preset {
  fog: THREE.Color;
  fogDensity: number;
  sun: THREE.Color;
  sunI: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiI: number;
  skyTop: THREE.Color;
  skyHorizon: THREE.Color;
  cloud: THREE.Color;
  cloudO: number;
}

const P = (
  fog: string, fogDensity: number, sun: string, sunI: number,
  hemiSky: string, hemiGround: string, hemiI: number,
  skyTop: string, skyHorizon: string, cloud: string, cloudO: number,
): Preset => ({
  fog: new THREE.Color(fog), fogDensity, sun: new THREE.Color(sun), sunI,
  hemiSky: new THREE.Color(hemiSky), hemiGround: new THREE.Color(hemiGround), hemiI,
  skyTop: new THREE.Color(skyTop), skyHorizon: new THREE.Color(skyHorizon),
  cloud: new THREE.Color(cloud), cloudO,
});

const PRESETS: Record<string, Preset> = {
  clear: P("#d9c6a0", 0.00085, "#ffe7b8", 2.7, "#b9c8d8", "#8a7a5c", 0.85, "#6f8fb8", "#e8cf9e", "#f6efe0", 0.8),
  shire: P("#cfe0b0", 0.001, "#fff3c8", 3.1, "#cfe0c0", "#7f8a58", 0.95, "#7fa8c8", "#eadfae", "#fbf6e6", 0.85),
  elf: P("#ecd9a8", 0.0009, "#ffd76a", 3.5, "#ffe9b0", "#907a4a", 1.0, "#8fa3c0", "#ffe3a0", "#fff3d8", 0.72),
  dwarf: P("#b9ada4", 0.0016, "#ffc89e", 2.2, "#b0a8a0", "#6a5c50", 0.8, "#8a93a4", "#d8c2a4", "#d9cfc4", 0.9),
  gondor: P("#e4e9ee", 0.00062, "#fff6e2", 3.2, "#dfe8f2", "#95928a", 1.0, "#7d9cc4", "#eef0e8", "#ffffff", 0.85),
  mordor: P("#2e1310", 0.0034, "#7a2a16", 1.05, "#3a1a14", "#241010", 0.5, "#1c0f14", "#5c1f12", "#4a2620", 0.95),
};

const SUN_DIR = new THREE.Vector3(-0.45, 0.5, -0.42).normalize();

const clonePreset = (p: Preset): Preset => ({
  fog: p.fog.clone(),
  fogDensity: p.fogDensity,
  sun: p.sun.clone(),
  sunI: p.sunI,
  hemiSky: p.hemiSky.clone(),
  hemiGround: p.hemiGround.clone(),
  hemiI: p.hemiI,
  skyTop: p.skyTop.clone(),
  skyHorizon: p.skyHorizon.clone(),
  cloud: p.cloud.clone(),
  cloudO: p.cloudO,
});

export function Weather() {
  const scene = useThree((st) => st.scene);
  const quality = useGame((s) => s.quality);
  const dir = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);

  const state = useRef({
    fog: new THREE.FogExp2(0xd9c6a0, 0.00085),
    cur: {
      fog: new THREE.Color("#d9c6a0"), fogDensity: 0.00085,
      sun: new THREE.Color("#ffe7b8"), sunI: 2.7,
      hemiSky: new THREE.Color("#b9c8d8"), hemiGround: new THREE.Color("#8a7a5c"), hemiI: 0.85,
      skyTop: new THREE.Color("#6f8fb8"), skyHorizon: new THREE.Color("#e8cf9e"),
      cloud: new THREE.Color("#f6efe0"), cloudO: 0.8,
    },
    tgt: clonePreset(PRESETS.clear),
    mix: new THREE.Color(),
    flash: 0,
    nextStrike: 6,
    clock: 0,
  });

  const { boltGeo, boltMat, boltLine } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
    const mat = new THREE.LineBasicMaterial({
      color: "#fff3dc",
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    return { boltGeo: geo, boltMat: mat, boltLine: line };
  }, []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const st = state.current;
    st.clock += dt;
    if (!scene.fog) scene.fog = st.fog;

    // ── zone weights from the viewed point (steed + map-view pan, so a
    // panned map shows that place's weather; pan is zero outside map view) ──
    const vx = runtime.pos.x + runtime.overviewPan.x;
    const vz = runtime.pos.z + runtime.overviewPan.y;
    let bestZone = "clear";
    let bestD = Infinity;
    const weights = runtime.zoneWeights;
    let maxW = 0;
    const regions = content().regions;
    for (const r of regions) {
      const d = Math.hypot(toWorldX(r.x) - vx, toWorldZ(r.y) - vz);
      let t = Math.max(0, 1 - d / 680);
      t = t * t * (3 - 2 * t);
      t *= morph.value;
      weights[r.id] = t;
      if (t > maxW) maxW = t;
      if (d < bestD) {
        bestD = d;
        bestZone = d < 310 ? r.id : "clear";
      }
    }
    if (morph.value < 0.5) bestZone = "clear";
    if (bestZone !== runtime.activeZone) {
      runtime.activeZone = bestZone;
      game().setWeatherZone(bestZone);
    }

    // ── blend presets: start clear, fold each zone in by weight ──
    const tgt = st.tgt;
    const c = PRESETS.clear;
    tgt.fog.copy(c.fog);
    tgt.fogDensity = c.fogDensity;
    tgt.sun.copy(c.sun);
    tgt.sunI = c.sunI;
    tgt.hemiSky.copy(c.hemiSky);
    tgt.hemiGround.copy(c.hemiGround);
    tgt.hemiI = c.hemiI;
    tgt.skyTop.copy(c.skyTop);
    tgt.skyHorizon.copy(c.skyHorizon);
    tgt.cloud.copy(c.cloud);
    tgt.cloudO = c.cloudO;
    for (const r of regions) {
      const w = weights[r.id];
      if (w <= 0.001) continue;
      const p = PRESETS[r.id];
      if (!p) continue; // admin-added region without a compiled weather preset stays clear
      tgt.fog.lerp(p.fog, w);
      tgt.fogDensity = THREE.MathUtils.lerp(tgt.fogDensity, p.fogDensity, w);
      tgt.sun.lerp(p.sun, w);
      tgt.sunI = THREE.MathUtils.lerp(tgt.sunI, p.sunI, w);
      tgt.hemiSky.lerp(p.hemiSky, w);
      tgt.hemiGround.lerp(p.hemiGround, w);
      tgt.hemiI = THREE.MathUtils.lerp(tgt.hemiI, p.hemiI, w);
      tgt.skyTop.lerp(p.skyTop, w);
      tgt.skyHorizon.lerp(p.skyHorizon, w);
      tgt.cloud.lerp(p.cloud, w);
      tgt.cloudO = THREE.MathUtils.lerp(tgt.cloudO, p.cloudO, w);
    }

    // smooth approach (the concept's 2.5s transitions)
    const k = 1 - Math.exp(-1.6 * dt);
    const cur = st.cur;
    cur.fog.lerp(tgt.fog, k);
    cur.fogDensity = THREE.MathUtils.lerp(cur.fogDensity, tgt.fogDensity, k);
    cur.sun.lerp(tgt.sun, k);
    cur.sunI = THREE.MathUtils.lerp(cur.sunI, tgt.sunI, k);
    cur.hemiSky.lerp(tgt.hemiSky, k);
    cur.hemiGround.lerp(tgt.hemiGround, k);
    cur.hemiI = THREE.MathUtils.lerp(cur.hemiI, tgt.hemiI, k);
    cur.skyTop.lerp(tgt.skyTop, k);
    cur.skyHorizon.lerp(tgt.skyHorizon, k);
    cur.cloud.lerp(tgt.cloud, k);
    cur.cloudO = THREE.MathUtils.lerp(cur.cloudO, tgt.cloudO, k);

    st.fog.color.copy(cur.fog);
    st.fog.density = cur.fogDensity;
    skyUniforms.uTop.value.copy(cur.skyTop);
    skyUniforms.uHorizon.value.copy(cur.skyHorizon);
    skyUniforms.uSunColor.value.copy(cur.sun);
    skyUniforms.uSunDir.value.copy(SUN_DIR);
    cloudState.tint.copy(cur.cloud);
    cloudState.opacity = cur.cloudO;

    if (dir.current) {
      dir.current.color.copy(cur.sun);
      dir.current.intensity = cur.sunI;
      dir.current.position.set(vx, runtime.pos.y, vz).addScaledVector(SUN_DIR, 620);
      dir.current.target.position.set(vx, runtime.pos.y, vz);
      dir.current.target.updateMatrixWorld();
      dir.current.castShadow = quality === "high";
    }
    if (hemi.current) {
      hemi.current.color.copy(cur.hemiSky);
      hemi.current.groundColor.copy(cur.hemiGround);
      hemi.current.intensity = cur.hemiI;
    }

    // ── Mordor lightning ──
    const mordorW = weights["mordor"] ?? 0;
    st.flash = Math.max(0, st.flash - dt * 3.2);
    skyUniforms.uFlash.value = st.flash * 0.5 * Math.max(mordorW, 0.25);
    boltMat.opacity = Math.min(1, st.flash * 1.6);
    if (runtime.activeZone === "mordor") {
      st.nextStrike -= dt;
      if (st.nextStrike <= 0) {
        st.nextStrike = 4.5 + Math.random() * 6;
        st.flash = 1;
        runtime.shake = Math.max(runtime.shake, 0.55);
        // jagged bolt near the viewed point
        const bx = vx + (Math.random() - 0.5) * 460;
        const bz = vz + (Math.random() - 0.5) * 340;
        const gy = heightAt(bx, bz) * morph.value;
        const posAttr = boltGeo.getAttribute("position") as THREE.BufferAttribute;
        let px = bx;
        let pz = bz;
        for (let i = 0; i < 16; i++) {
          const f = i / 15;
          posAttr.setXYZ(i, px, THREE.MathUtils.lerp(520, gy, f), pz);
          px += (Math.random() - 0.5) * 40;
          pz += (Math.random() - 0.5) * 40;
        }
        posAttr.needsUpdate = true;
        const delay = 200 + Math.random() * 900;
        setTimeout(() => audio.thunder(), delay);
      }
    } else {
      st.nextStrike = Math.max(st.nextStrike, 2);
    }
  });

  return (
    <group>
      <hemisphereLight ref={hemi} args={["#b9c8d8", "#8a7a5c", 0.85]} />
      <directionalLight
        ref={dir}
        position={[-500, 600, -400]}
        intensity={2.7}
        color="#ffe7b8"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-340}
        shadow-camera-right={340}
        shadow-camera-top={340}
        shadow-camera-bottom={-340}
        shadow-camera-near={50}
        shadow-camera-far={1800}
        shadow-bias={-0.0004}
      />
      {/* lightning bolt */}
      <primitive object={boltLine} />
    </group>
  );
}
