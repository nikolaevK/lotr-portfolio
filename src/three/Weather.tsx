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
import { morph, realism } from "@/three/Terrain";
import { daylight, LIGHT_SWAP_Y } from "@/three/daylight";
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
  elf: P("#ecd9a8", 0.0009, "#ffdf92", 3.3, "#ffe9b0", "#907a4a", 1.0, "#8fa3c0", "#ffe3a0", "#fff3d8", 0.72),
  dwarf: P("#b9ada4", 0.0016, "#ffc89e", 2.2, "#b0a8a0", "#6a5c50", 0.8, "#8a93a4", "#d8c2a4", "#d9cfc4", 0.9),
  gondor: P("#e4e9ee", 0.00062, "#fff6e2", 3.2, "#dfe8f2", "#95928a", 1.0, "#7d9cc4", "#eef0e8", "#ffffff", 0.85),
  mordor: P("#2e1310", 0.0034, "#7a2a16", 1.05, "#3a1a14", "#241010", 0.5, "#1c0f14", "#5c1f12", "#4a2620", 0.95),
};

const _c = new THREE.Color();
const _light = new THREE.Vector3();

// ── the time of day, laid over the zone presets ─────────────────────────────
// The presets above are each land at noon. A low sun warms them (DUSK), the
// blue hour after it sets turns them rose and lavender (TWILIGHT) — both are
// linear multipliers at full strength — and night pulls them toward a bright
// moonlit blue (NIGHT): never to black, the content still has to read, and
// keeping a trace of each land's own character.

const DUSK = {
  sun: new THREE.Color(1, 0.55, 0.25),
  skyTop: new THREE.Color(0.72, 0.62, 0.86),
  skyHorizon: new THREE.Color(1.25, 0.72, 0.5),
  fog: new THREE.Color(1.12, 0.8, 0.64),
  hemiSky: new THREE.Color(1.05, 0.84, 0.74),
  hemiGround: new THREE.Color(1, 0.88, 0.8),
  cloud: new THREE.Color(1, 0.7, 0.55), // peach, but never brighter than by day — or puffs bloom like suns
};

const TWILIGHT = {
  skyTop: new THREE.Color(0.55, 0.6, 0.85),
  skyHorizon: new THREE.Color(0.85, 0.7, 0.95),
  fog: new THREE.Color(0.7, 0.68, 0.9),
  hemiSky: new THREE.Color(0.7, 0.72, 0.95),
  hemiGround: new THREE.Color(0.8, 0.8, 0.9),
  cloud: new THREE.Color(1, 0.75, 0.85),
};

const NIGHT = {
  skyTop: new THREE.Color("#0c1a38"),
  skyHorizon: new THREE.Color("#2a4a80"),
  fog: new THREE.Color("#243a62"),
  hemiSky: new THREE.Color("#86a2d8"),
  hemiGround: new THREE.Color("#3a4562"),
  cloud: new THREE.Color("#56678a"),
  hemiI: 1.6,
};
/** how far night replaces a land's colours (the rest is the land's own) */
const NIGHT_PULL = 0.94;

const MOON = new THREE.Color("#b4c8f0");
const MOON_I = 2.0;

/** `src` warmed by the low sun (g), cooled by the blue hour (tw), then pulled toward `night` by n. */
function shade(
  out: THREE.Color, src: THREE.Color, dusk: THREE.Color, twilight: THREE.Color, night: THREE.Color,
  g: number, tw: number, n: number,
) {
  out.setRGB(
    src.r * (1 + (dusk.r - 1) * g) * (1 + (twilight.r - 1) * tw),
    src.g * (1 + (dusk.g - 1) * g) * (1 + (twilight.g - 1) * tw),
    src.b * (1 + (dusk.b - 1) * g) * (1 + (twilight.b - 1) * tw),
  );
  return out.lerp(night, n);
}

/**
 * The hemisphere light was standing in for ambient light. Now that
 * <SkyEnvironment> supplies real image-based lighting from the same sky
 * colours, most of that job is done properly — the hemisphere is kept only as
 * a cheap fill so ambient does not double up.
 */
const HEMI_WITH_IBL = 0.62;

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
    lit: clonePreset(PRESETS.clear), // cur under the time of day — what is actually shown
    mix: new THREE.Color(),
    flash: 0,
    mapFog: 1, // fog scale, eased toward 0.5 in map view
    gloom: 0,
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
      if (t > maxW && PRESETS[r.id]) maxW = t;
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

    // ── blend presets: a weighted average, with the weights sharpened so the
    // nearest land's character dominates. (Folding zones in one after another
    // let whichever came last in the list bleed in at half strength — Minas
    // Tirith wore half of Mordor's gloom.) Open country between zones stays
    // clear rather than becoming a muddy mix of all of them.
    const tgt = st.tgt;
    const c = PRESETS.clear;
    const wc = (1 - maxW) * (1 - maxW) + 1e-4;
    let total = wc;
    tgt.fog.copy(c.fog).multiplyScalar(wc);
    tgt.fogDensity = c.fogDensity * wc;
    tgt.sun.copy(c.sun).multiplyScalar(wc);
    tgt.sunI = c.sunI * wc;
    tgt.hemiSky.copy(c.hemiSky).multiplyScalar(wc);
    tgt.hemiGround.copy(c.hemiGround).multiplyScalar(wc);
    tgt.hemiI = c.hemiI * wc;
    tgt.skyTop.copy(c.skyTop).multiplyScalar(wc);
    tgt.skyHorizon.copy(c.skyHorizon).multiplyScalar(wc);
    tgt.cloud.copy(c.cloud).multiplyScalar(wc);
    tgt.cloudO = c.cloudO * wc;
    let mordorBlend = 0;
    for (const r of regions) {
      const w0 = weights[r.id];
      if (w0 <= 0.001) continue;
      const p = PRESETS[r.id];
      if (!p) continue; // admin-added region without a compiled weather preset stays clear
      const w = w0 * w0 * w0;
      total += w;
      if (r.id === "mordor") mordorBlend = w;
      tgt.fog.add(_c.copy(p.fog).multiplyScalar(w));
      tgt.fogDensity += p.fogDensity * w;
      tgt.sun.add(_c.copy(p.sun).multiplyScalar(w));
      tgt.sunI += p.sunI * w;
      tgt.hemiSky.add(_c.copy(p.hemiSky).multiplyScalar(w));
      tgt.hemiGround.add(_c.copy(p.hemiGround).multiplyScalar(w));
      tgt.hemiI += p.hemiI * w;
      tgt.skyTop.add(_c.copy(p.skyTop).multiplyScalar(w));
      tgt.skyHorizon.add(_c.copy(p.skyHorizon).multiplyScalar(w));
      tgt.cloud.add(_c.copy(p.cloud).multiplyScalar(w));
      tgt.cloudO += p.cloudO * w;
    }
    const inv = 1 / total;
    tgt.fog.multiplyScalar(inv);
    tgt.fogDensity *= inv;
    tgt.sun.multiplyScalar(inv);
    tgt.sunI *= inv;
    tgt.hemiSky.multiplyScalar(inv);
    tgt.hemiGround.multiplyScalar(inv);
    tgt.hemiI *= inv;
    tgt.skyTop.multiplyScalar(inv);
    tgt.skyHorizon.multiplyScalar(inv);
    tgt.cloud.multiplyScalar(inv);
    tgt.cloudO *= inv;

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
    // Mordor's share of the blend: how much of its reek is in the air
    st.gloom = THREE.MathUtils.lerp(st.gloom, mordorBlend * inv, k);

    // ── the time of day over the blended zones. Mordor keeps most of its own
    // gloom, and the map view only dims at night — it still has to be read.
    const murk = st.gloom;
    const g = daylight.golden * (1 - 0.7 * murk);
    const tw = daylight.twilight * (1 - 0.7 * murk);
    const n = daylight.night * NIGHT_PULL * (1 - 0.8 * murk) * (0.55 + 0.45 * realism.value);
    const lit = st.lit;
    shade(lit.skyTop, cur.skyTop, DUSK.skyTop, TWILIGHT.skyTop, NIGHT.skyTop, g, tw, n);
    shade(lit.skyHorizon, cur.skyHorizon, DUSK.skyHorizon, TWILIGHT.skyHorizon, NIGHT.skyHorizon, g, tw, n);
    shade(lit.fog, cur.fog, DUSK.fog, TWILIGHT.fog, NIGHT.fog, g, tw, n);
    shade(lit.hemiSky, cur.hemiSky, DUSK.hemiSky, TWILIGHT.hemiSky, NIGHT.hemiSky, g, tw, n);
    shade(lit.hemiGround, cur.hemiGround, DUSK.hemiGround, TWILIGHT.hemiGround, NIGHT.hemiGround, g, tw, n);
    shade(lit.cloud, cur.cloud, DUSK.cloud, TWILIGHT.cloud, NIGHT.cloud, g, tw, n);
    lit.sun.copy(cur.sun).lerp(_c.copy(cur.sun).multiply(DUSK.sun), g);
    const sunY = daylight.sunDir.y;
    const moonY = daylight.moonDir.y;

    st.fog.color.copy(lit.fog);
    // the map view looks down from ~600 units, where a zone's full fog (the
    // forge-smoke of Erebor, say) washes the map out; ease it off up there
    st.mapFog += ((game().overview ? 0.5 : 1) - st.mapFog) * Math.min(1, 2.5 * dt);
    st.fog.density = cur.fogDensity * st.mapFog;
    skyUniforms.uTop.value.copy(lit.skyTop);
    skyUniforms.uHorizon.value.copy(lit.skyHorizon);
    // the sun's glow lingers in the sky through the blue hour after it sets
    skyUniforms.uSunColor.value.copy(lit.sun).multiplyScalar(THREE.MathUtils.smoothstep(sunY, -0.22, 0));
    skyUniforms.uGround.value.copy(lit.hemiGround);
    skyUniforms.uSunDir.value.copy(daylight.sunDir);
    skyUniforms.uGlow.value = Math.max(g, tw);
    skyUniforms.uMoonDir.value.copy(daylight.moonDir);
    skyUniforms.uMoon.value =
      THREE.MathUtils.smoothstep(moonY, -0.02, 0.08) * (0.3 + 0.7 * daylight.night) * (1 - 0.7 * murk);
    cloudState.tint.copy(lit.cloud);
    cloudState.opacity = cur.cloudO;

    if (dir.current) {
      // one shadow-casting light: the sun by day, the moon by night
      const sunUp = sunY > LIGHT_SWAP_Y;
      if (sunUp) {
        dir.current.color.copy(lit.sun);
        dir.current.intensity = cur.sunI * THREE.MathUtils.smoothstep(sunY, LIGHT_SWAP_Y, 0.1);
      } else {
        dir.current.color.copy(MOON);
        dir.current.intensity =
          MOON_I *
          (1 - THREE.MathUtils.smoothstep(sunY, -0.2, LIGHT_SWAP_Y)) *
          THREE.MathUtils.smoothstep(moonY, 0, 0.15) *
          (1 - 0.6 * murk);
      }
      // shadows from a light grazing the land are all acne and smear, so the
      // light itself never drops below ~7° even as the disc meets the horizon
      _light.copy(sunUp ? daylight.sunDir : daylight.moonDir);
      if (_light.y < 0.12) _light.setY(0.12).normalize();
      dir.current.position.set(vx, runtime.pos.y, vz).addScaledVector(_light, 620);
      dir.current.target.position.set(vx, runtime.pos.y, vz);
      dir.current.target.updateMatrixWorld();
      dir.current.castShadow = quality === "high";
    }
    if (hemi.current) {
      hemi.current.color.copy(lit.hemiSky);
      hemi.current.groundColor.copy(lit.hemiGround);
      hemi.current.intensity = THREE.MathUtils.lerp(cur.hemiI, NIGHT.hemiI, n) * HEMI_WITH_IBL;
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
        // tighter frustum than the visible world: landmarks are only rendered
        // within 1500 units and the camera trails 30 behind, so spending the
        // whole shadow map on ±190 buys ~1.8× the texel density
        shadow-camera-left={-190}
        shadow-camera-right={190}
        shadow-camera-top={190}
        shadow-camera-bottom={-190}
        shadow-camera-near={50}
        shadow-camera-far={1500}
        shadow-bias={-0.00015}
        shadow-normalBias={0.5}
      />
      {/* lightning bolt */}
      <primitive object={boltLine} />
    </group>
  );
}
