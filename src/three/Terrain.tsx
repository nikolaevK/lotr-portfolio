"use client";

import { use, useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MAP_W, MAP_H, SEA_LEVEL } from "@/data/content";
import { fbm, heightAt } from "@/three/noise";
import { useGame } from "@/state/store";
import { skyUniforms } from "@/three/SkyDome";
import {
  loadTerrainData, CELL, GW, GH, BCELL, BW, BH, H_MIN, H_MAX, DETAIL, WAVES, type TerrainData,
} from "@/three/terrainData";

/** Shared morph value (0 = flat parchment, 1 = full 3D). Written by <Terrain>, read anywhere. */
export const morph = { value: 0 };

/**
 * How "real" the ground reads, 0 = the parchment map, 1 = grass, rock and
 * snow. Driven by the camera's height above the land, so the map comes alive
 * as the camera swoops down to the steed and turns back into a map from the
 * map view.
 */
export const realism = { value: 0 };

// ── chunked LOD ─────────────────────────────────────────────────────────────
// The land is 16×9 chunks of 192 units. Each chunk draws at one of four grid
// densities by distance; every chunk of a density is one instance of a shared
// grid, so the whole terrain is at most four draw calls. Heights are fetched
// from the baked grid in the vertex shader — every LOD's vertices land exactly
// on its texels — and normals are per pixel, so even the coarse rings shade
// with full 2-unit detail. Skirts hide the cracks between densities.

const CHUNK = 192;
const NCX = MAP_W / CHUNK;
const NCZ = MAP_H / CHUNK;
const LOD_SEGS = [96, 48, 24, 12];
/** distance (to the chunk's bounding box) at which each density gives way */
const LOD_DIST = { high: [260, 640, 1350], low: [150, 420, 1000] };

function chunkGeometry(seg: number) {
  const step = CHUNK / seg;
  // deep enough for the worst step between neighbouring densities, measured
  // over the whole map (~22 units between a 24- and a 12-segment chunk)
  const skirt = -(step * 2.2 + 8);
  const n = seg + 1;
  const ring: number[] = [];
  for (let i = 0; i < seg; i++) ring.push(i); // north edge, west → east
  for (let i = 0; i < seg; i++) ring.push(seg + i * n); // east edge, north → south
  for (let i = 0; i < seg; i++) ring.push(n * n - 1 - i); // south edge, east → west
  for (let i = 0; i < seg; i++) ring.push((seg - i) * n); // west edge, south → north
  const pos = new Float32Array((n * n + ring.length) * 3);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const k = (iz * n + ix) * 3;
      pos[k] = ix * step;
      pos[k + 2] = iz * step;
    }
  }
  ring.forEach((v, i) => {
    const k = (n * n + i) * 3;
    pos[k] = pos[v * 3];
    pos[k + 1] = skirt; // negative y marks a skirt vertex: dropped below the surface
    pos[k + 2] = pos[v * 3 + 2];
  });
  const idx: number[] = [];
  for (let iz = 0; iz < seg; iz++) {
    for (let ix = 0; ix < seg; ix++) {
      const a = iz * n + ix;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const a2 = n * n + i;
    const b2 = n * n + ((i + 1) % ring.length);
    // both windings — skirts are seen from whichever side the crack opens on
    idx.push(a, b, a2, b, b2, a2, a, a2, b, b, a2, b2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  // normals are per pixel from the baked grid; this only satisfies the shader
  g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(pos.length), 3));
  return g;
}

/** Per-chunk height range, for frustum culling and LOD distance. */
function chunkBounds(d: TerrainData) {
  const out = new Float32Array(NCX * NCZ * 2);
  const per = CHUNK / CELL;
  for (let cz = 0; cz < NCZ; cz++) {
    for (let cx = 0; cx < NCX; cx++) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let gz = cz * per; gz <= (cz + 1) * per; gz++) {
        for (let gx = cx * per; gx <= (cx + 1) * per; gx++) {
          const h = d.heights[gz * GW + gx];
          if (h < lo) lo = h;
          if (h > hi) hi = h;
        }
      }
      out[(cz * NCX + cx) * 2] = lo;
      out[(cz * NCX + cx) * 2 + 1] = hi;
    }
  }
  return out;
}

// ── textures from the bake ──────────────────────────────────────────────────

function dataTex(
  data: Uint8Array | Float32Array, w: number, h: number,
  o: { float?: boolean; srgb?: boolean; repeat?: boolean; mips?: boolean; aniso?: number } = {},
) {
  const t = new THREE.DataTexture(
    data, w, h,
    o.float ? THREE.RedFormat : THREE.RGBAFormat,
    o.float ? THREE.FloatType : THREE.UnsignedByteType,
  );
  if (o.float) {
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
  } else {
    t.magFilter = THREE.LinearFilter;
    t.minFilter = o.mips === false ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = o.mips !== false;
    t.anisotropy = o.aniso ?? 4;
  }
  if (o.srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (o.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  else t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

function buildCloudNoiseTexture() {
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // tileable-ish soft blotches
      const n =
        fbm(x * 0.055, y * 0.055, 4) * 0.5 +
        0.5 +
        0.25 * Math.sin((x / S) * Math.PI * 2) * Math.sin((y / S) * Math.PI * 2);
      const v = Math.max(0, Math.min(1, (n - 0.42) * 2.2));
      const idx = (y * S + x) * 4;
      data[idx] = data[idx + 1] = data[idx + 2] = Math.floor(v * 255);
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// linear-space palette constants, inlined into GLSL
const lin = (hex: string) => {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
};

const GLSL_CONSTS = /* glsl */ `
  #define MAP_W ${MAP_W.toFixed(1)}
  #define MAP_H ${MAP_H.toFixed(1)}
  #define CELL ${CELL.toFixed(1)}
  #define GW ${GW}
  #define GH ${GH}
  #define BCELL ${BCELL.toFixed(1)}
  #define BW ${BW.toFixed(1)}
  #define BH ${BH.toFixed(1)}
  #define H_MIN ${H_MIN.toFixed(1)}
  #define H_MAX ${H_MAX.toFixed(1)}
  #define SEA ${SEA_LEVEL.toFixed(2)}
`;

const TERRAIN_FRAG_PARS = /* glsl */ `
  ${GLSL_CONSTS}
  uniform float uMorph;
  uniform float uTime;
  uniform float uCloudAmt;
  uniform float uRealism;
  uniform sampler2D uMapTex;
  uniform sampler2D uNormTex;
  uniform sampler2D uFeatTex;
  uniform sampler2D uBiomeTex;
  uniform sampler2D uDetailTex;
  uniform sampler2D uCloudTex;
  varying vec2 vWXZ;
  varying float vHM;
  varying float vY;
  // set while shading the albedo, consumed by the normal & roughness stages
  vec3 tNormalW;
  float tRough;
  vec3 tEmissive;
  float zoneMask(vec2 uv, vec2 c, float r) {
    return smoothstep(r, r * 0.45, distance(uv * vec2(1.0, 0.5625), c * vec2(1.0, 0.5625)));
  }
`;

const TERRAIN_ALBEDO = /* glsl */ `
tEmissive = vec3(0.0);
{
  vec2 muv = vWXZ / vec2(MAP_W, MAP_H);
  vec2 guv = (vWXZ / CELL + 0.5) / vec2(float(GW), float(GH));
  vec4 nh = texture2D(uNormTex, guv);
  vec3 Ng = normalize(nh.xyz * 2.0 - 1.0);
  float th = nh.a * (H_MAX - H_MIN) + H_MIN;
  float slope = 1.0 - Ng.y;
  float dist = length(vViewPosition);

  // cloud shadows drift over both the map and the land
  float cs1 = texture2D(uCloudTex, muv * 9.0 + uTime * vec2(0.010, 0.004)).r;
  float cs2 = texture2D(uCloudTex, muv * 16.0 - uTime * vec2(0.006, 0.009)).r;
  float cloudShade = 1.0 - clamp(cs1 * cs2 * 1.6, 0.0, 1.0) * 0.24 * uMorph * uCloudAmt;

  // ── the parchment: map.jpg with relief tints (the map view & the intro) ──
  vec3 parch = texture2D(uMapTex, vec2(muv.x, 1.0 - muv.y)).rgb;
  {
    float vUp = mix(1.0, Ng.y, uMorph);
    float pslope = 1.0 - vUp;
    float rockAmt = clamp(smoothstep(22.0, 46.0, vHM) * 0.75 + pslope * 1.4 * smoothstep(10.0, 30.0, vHM), 0.0, 1.0);
    vec3 rockC = mix(vec3(0.42, 0.36, 0.30), vec3(0.32, 0.29, 0.27), pslope * 2.0);
    parch = mix(parch, parch * 0.35 + rockC * 0.75, rockAmt * uMorph);
    float snowAmt = smoothstep(58.0, 76.0, vHM) * smoothstep(0.75, 0.35, pslope);
    parch = mix(parch, vec3(0.84, 0.85, 0.88), snowAmt * uMorph);
    float shire = zoneMask(muv, vec2(0.352, 0.262), 0.085);
    parch = mix(parch, parch * vec3(0.72, 0.92, 0.48) + vec3(0.02, 0.05, 0.0), shire * 0.55 * uMorph);
    float mirk = zoneMask(muv, vec2(0.615, 0.27), 0.095);
    parch = mix(parch, parch * vec3(0.52, 0.62, 0.42), mirk * 0.5 * uMorph);
    float fang = zoneMask(muv, vec2(0.520, 0.437), 0.028);
    parch = mix(parch, parch * vec3(0.5, 0.66, 0.42), fang * 0.55 * uMorph);
    float lor = zoneMask(muv, vec2(0.548, 0.372), 0.02);
    parch = mix(parch, parch * vec3(1.12, 0.96, 0.52) + vec3(0.08, 0.05, 0.0), lor * 0.6 * uMorph);
    float mordor = zoneMask(muv, vec2(0.715, 0.635), 0.115);
    parch = mix(parch, parch * vec3(0.42, 0.30, 0.27) + vec3(0.03, 0.0, 0.0), mordor * 0.72 * uMorph);
    float under = smoothstep(SEA + 1.5, SEA - 3.0, vHM + (1.0 - uMorph) * 100.0);
    parch = mix(parch, parch * vec3(0.45, 0.62, 0.62), under * 0.6);
  }

  // ── the land itself ──
  vec3 real = vec3(0.0);
  vec3 Nr = Ng;
  float rough = 0.95;
  if (uRealism > 0.001) {
    float near = smoothstep(700.0, 60.0, dist);
    vec4 biome = texture2D(uBiomeTex, (vWXZ / BCELL + 0.5) / vec2(BW, BH));
    vec4 feat = texture2D(uFeatTex, guv);
    vec4 dA = texture2D(uDetailTex, vWXZ * (1.0 / 11.0));
    vec4 dB = texture2D(uDetailTex, vWXZ * (1.0 / 47.0) + vec2(0.37, 0.61));
    float macro = texture2D(uDetailTex, vWXZ * (1.0 / 410.0)).a;
    float macro2 = texture2D(uDetailTex, vWXZ * (1.0 / 1290.0) + 0.5).a;
    float volc = biome.a;

    // grass & soil — light and shade, dry and lush swathes at several
    // scales, so a meadow never reads as one flat colour
    float m1 = texture2D(uDetailTex, vWXZ * (1.0 / 97.0) + vec2(0.21, 0.47)).a;
    float m2 = texture2D(uDetailTex, vWXZ * (1.0 / 233.0) + vec2(0.73, 0.11)).a;
    vec3 ground = biome.rgb * (0.8 + 0.4 * macro) * (0.78 + 0.44 * m1);
    ground = mix(ground, ground * vec3(1.16, 1.05, 0.66), smoothstep(0.55, 0.8, m2) * 0.5);
    ground = mix(ground, ground * vec3(0.78, 0.95, 0.86), smoothstep(0.45, 0.2, m2) * 0.45);
    ground = mix(ground, ground * vec3(1.1, 1.02, 0.78), smoothstep(0.5, 0.75, macro2) * 0.45);
    float grassD = mix(0.5, dA.r * 0.6 + dB.r * 0.4, near);
    ground *= 0.8 + 0.4 * grassD;
    ground = mix(ground, ground * vec3(0.8, 0.98, 0.72), feat.a * 0.5 * (1.0 - volc));
    float soilAmt = smoothstep(0.66, 0.86, m1 * 0.35 + macro * 0.3 + slope * 1.3 + (1.0 - m2) * 0.1) * (1.0 - feat.a * 0.6);
    vec3 soilC = mix(${lin("#7a6446")}, ${lin("#3b322c")}, volc) * (0.78 + 0.44 * dA.b);
    ground = mix(ground, soilC, soilAmt * 0.7);

    // forests read as canopy from the air; trees stand on it up close
    float forest = smoothstep(0.04, 0.55, feat.r);
    vec3 canopy = biome.rgb * vec3(0.5, 0.62, 0.48) * (0.7 + 0.5 * dB.r) * (0.85 + 0.3 * macro);
    ground = mix(ground, canopy, forest * 0.92);

    // roads: packed earth
    ground = mix(ground, ${lin("#8c7656")} * (0.82 + 0.36 * dA.b), feat.g * 0.92);

    // rock — triplanar on the cliffs, so strata run level instead of smearing
    vec3 an = pow(abs(Ng), vec3(4.0));
    an /= an.x + an.y + an.z;
    float rY = dB.g * 0.7 + dA.g * 0.3;
    #ifdef TERRAIN_LOW
      float rockD = rY;
    #else
      float rX = texture2D(uDetailTex, vec2(vWXZ.y, th) * (1.0 / 43.0)).g * 0.7
               + texture2D(uDetailTex, vec2(vWXZ.y, th) * (1.0 / 13.0)).g * 0.3;
      float rZ = texture2D(uDetailTex, vec2(vWXZ.x, th) * (1.0 / 43.0) + 0.5).g * 0.7
               + texture2D(uDetailTex, vec2(vWXZ.x, th) * (1.0 / 13.0) + 0.5).g * 0.3;
      float rockD = rX * an.x + rZ * an.z + rY * an.y;
    #endif
    vec3 rockC = mix(${lin("#4f4b47")}, ${lin("#948d84")}, smoothstep(0.15, 0.85, rockD)) * (0.82 + 0.36 * macro);
    rockC = mix(rockC, ${lin("#2a2420")} * (0.7 + 0.6 * rockD), volc);

    float lat = muv.y;
    float snowLine = mix(46.0, 86.0, smoothstep(0.1, 0.66, lat));
    float rockW = smoothstep(0.3, 0.52, slope + (rockD - 0.5) * 0.3);
    // above the grass line it is bare stone even where the ground is level —
    // flat crests left green read as mesas
    rockW = max(rockW, smoothstep(snowLine - 22.0, snowLine - 6.0, th + (macro - 0.5) * 12.0) * (0.6 + 0.4 * smoothstep(0.02, 0.18, slope)));
    rockW *= 1.0 - feat.b;

    float snowN = (dB.a - 0.5) * 18.0 + (macro - 0.5) * 12.0;
    // snow lies on the ledges and gullies; ribs of rock break through it
    float snowW = smoothstep(snowLine, snowLine + 9.0, th + snowN) * smoothstep(0.62, 0.34, slope + (rockD - 0.5) * 0.4) * (1.0 - volc);

    float beach = smoothstep(SEA + 2.6, SEA + 0.9, th) * (1.0 - rockW);
    vec3 sandC = ${lin("#c2ab84")} * (0.86 + 0.28 * dA.b);
    sandC = mix(sandC, ${lin("#6e6658")}, smoothstep(SEA + 0.4, SEA - 1.5, th)); // wet sand, then sea floor

    real = ground;
    real = mix(real, sandC, beach);
    real = mix(real, rockC, rockW);
    // snow stops short of white, or ACES clips it and the peaks lose their shading
    real = mix(real, ${lin("#d3dbe4")} * (0.93 + 0.07 * dA.r), snowW);
    // rivers: dark moving water, mirror-smooth
    real = mix(real, ${lin("#2c4a50")} * (0.9 + 0.2 * dB.a), feat.b);

    // Orodruin's lava runs down its flanks in a few wandering channels
    vec2 dd = vWXZ - vec2(${(0.7 * MAP_W).toFixed(1)}, ${(0.585 * MAP_H).toFixed(1)});
    float rad = length(dd);
    float lava = 0.0;
    if (rad > 7.0 && rad < 125.0) { // (atan(0, 0) is undefined; no lava inside 7 anyway)
      float wob = (texture2D(uDetailTex, vWXZ * (1.0 / 150.0)).a - 0.5) * 2.4;
      float streams = 1.0 - abs(sin(atan(dd.y, dd.x) * 2.5 + wob + rad * 0.011));
      lava = smoothstep(0.955, 0.992, streams) * smoothstep(120.0, 64.0, rad) * smoothstep(7.0, 15.0, rad);
    }
    real = mix(real, vec3(0.025, 0.008, 0.004), lava);
    tEmissive = vec3(1.0, 0.3, 0.05) * lava * (2.0 + 0.6 * sin(uTime * 1.7 + rad * 0.08));

    rough = mix(0.96, 0.84, rockW);
    rough = mix(rough, 0.62, snowW);
    rough = mix(rough, 0.07, feat.b);

    #ifndef TERRAIN_LOW
      // fine relief: bump from the detail heights, through screen derivatives
      float bumpH = mix(grassD * 0.3 + soilAmt * dA.b * 0.4, rockD * 1.1, rockW);
      bumpH *= (1.0 - snowW * 0.6) * (1.0 - feat.b) * smoothstep(380.0, 40.0, dist);
      vec3 p = vec3(vWXZ.x, vY, vWXZ.y);
      vec3 dpdx = dFdx(p);
      vec3 dpdy = dFdy(p);
      float dhdx = dFdx(bumpH);
      float dhdy = dFdy(bumpH);
      vec3 r1 = cross(dpdy, Nr);
      vec3 r2 = cross(Nr, dpdx);
      float det = dot(dpdx, r1);
      // skirts and silhouettes can leave the derivatives degenerate — a NaN
      // here would be smeared over the whole frame by bloom
      if (abs(det) > 1e-7) {
        vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
        Nr = normalize(abs(det) * Nr - grad * 0.5);
      }
    #endif
    Nr = normalize(mix(Nr, vec3(0.0, 1.0, 0.0), feat.b * 0.85));
  }

  float rw = uRealism * uMorph;
  diffuseColor.rgb = mix(parch, real, rw) * cloudShade;
  tNormalW = normalize(mix(vec3(0.0, 1.0, 0.0), mix(Ng, Nr, rw), uMorph));
  tRough = mix(0.94, rough, rw);
  tEmissive *= rw;
}
`;

function makeTerrainMaterial(uniforms: Record<string, THREE.IUniform>, low: boolean) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.94, metalness: 0 });
  mat.defines = low ? { TERRAIN_LOW: "" } : {};
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         ${GLSL_CONSTS}
         uniform highp sampler2D uHeight;
         uniform float uMorph;
         varying vec2 vWXZ;
         varying float vHM;
         varying float vY;`,
      )
      .replace("#include <beginnormal_vertex>", "vec3 objectNormal = vec3(0.0, 1.0, 0.0);")
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position.x, 0.0, position.z);
         #ifdef USE_INSTANCING
           vec2 wxz = (instanceMatrix * vec4(transformed, 1.0)).xz;
         #else
           vec2 wxz = transformed.xz;
         #endif
         ivec2 gi = clamp(ivec2(floor(wxz / CELL + 0.5)), ivec2(0), ivec2(GW - 1, GH - 1));
         float th = texelFetch(uHeight, gi, 0).r;
         // skirts drop below the surface — except on the rim of the world
         float drop = position.y;
         if (wxz.x <= 0.5 || wxz.y <= 0.5 || wxz.x >= MAP_W - 0.5 || wxz.y >= MAP_H - 0.5) drop = 0.0;
         transformed.y = th * uMorph + drop;
         vWXZ = wxz;
         vHM = th * uMorph;
         vY = transformed.y;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${TERRAIN_FRAG_PARS}`)
      .replace("#include <map_fragment>", TERRAIN_ALBEDO)
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = tRough;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n totalEmissiveRadiance += tEmissive;")
      .replace(
        "#include <normal_fragment_begin>",
        `float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
         vec3 normal = normalize((viewMatrix * vec4(tNormalW, 0.0)).xyz);
         vec3 nonPerturbedNormal = normal;`,
      );
  };
  mat.customProgramCacheKey = () => `terrain-${low ? "low" : "high"}`;
  return mat;
}

// ── the sea ─────────────────────────────────────────────────────────────────

function makeWaterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uMorph: { value: 0 },
        uHeight: { value: null },
        uWaves: { value: null },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      ${GLSL_CONSTS}
      uniform float uTime;
      uniform float uMorph;
      uniform highp sampler2D uHeight;
      uniform sampler2D uWaves;
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      varying vec3 vWorld;
      float groundAt(vec2 wxz) {
        vec2 g = clamp(wxz / CELL, vec2(0.0), vec2(float(GW) - 1.001, float(GH) - 1.001));
        ivec2 i = ivec2(floor(g));
        vec2 f = g - vec2(i);
        float a = texelFetch(uHeight, i, 0).r;
        float b = texelFetch(uHeight, i + ivec2(1, 0), 0).r;
        float c = texelFetch(uHeight, i + ivec2(0, 1), 0).r;
        float d = texelFetch(uHeight, i + ivec2(1, 1), 0).r;
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      void main() {
        float depth = vWorld.y - groundAt(vWorld.xz) * uMorph;
        if (depth < 0.0) discard;
        vec2 p = vWorld.xz;
        float dist = length(cameraPosition - vWorld);
        // three swells at different scales and headings; the finest fades
        // out with distance before it can shimmer
        vec3 n1 = texture2D(uWaves, p / 230.0 + uTime * vec2(0.008, 0.005)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(uWaves, p / 71.0 + uTime * vec2(-0.013, 0.011)).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(uWaves, p / 23.0 + uTime * vec2(0.024, -0.019)).xyz * 2.0 - 1.0;
        float fine = smoothstep(900.0, 120.0, dist);
        vec3 N = normalize(vec3(n1.x + n2.x * 0.8 + n3.x * 0.6 * fine, 2.4, n1.z + n2.z * 0.8 + n3.z * 0.6 * fine));
        vec3 V = normalize(cameraPosition - vWorld);
        float NdV = clamp(dot(N, V), 0.0, 1.0);
        float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uHorizon, uTop, pow(clamp(R.y, 0.0, 1.0), 0.5));
        float shallow = smoothstep(0.0, 7.0, depth);
        vec3 body = mix(vec3(0.16, 0.33, 0.32), vec3(0.025, 0.075, 0.095), shallow);
        // a little sky in the body too — the sea is never pure black
        body += uHorizon * 0.05;
        vec3 col = mix(body, sky, F);
        vec3 S = normalize(uSunDir);
        col += uSunColor * pow(clamp(dot(R, S), 0.0, 1.0), 260.0) * 2.4;
        col += uSunColor * pow(clamp(dot(R, S), 0.0, 1.0), 18.0) * 0.06;
        // surf on the shore
        float foamN = texture2D(uWaves, p / 7.0 + uTime * vec2(0.03, 0.02)).a;
        float surf = smoothstep(1.6, 0.0, depth) * smoothstep(0.35, 0.8, foamN + 0.25 * sin(depth * 5.0 - uTime * 1.6));
        col = mix(col, vec3(0.86, 0.88, 0.86), surf * 0.6);
        float alpha = smoothstep(0.0, 1.8, depth);
        alpha = clamp(max(alpha * 0.93, F * alpha) + surf * 0.3, 0.0, 1.0);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

// ── the component ───────────────────────────────────────────────────────────

const _frustum = new THREE.Frustum();
const _pm = new THREE.Matrix4();
const _box = new THREE.Box3();
const _m = new THREE.Matrix4();

export function Terrain() {
  const mapTex = useLoader(THREE.TextureLoader, "/assets/map.jpg");
  const data = use(loadTerrainData());
  const setReady = useGame((s) => s.setReady);
  const quality = useGame((s) => s.quality);
  const gl = useThree((s) => s.gl);
  const readyRef = useRef(false);

  const tex = useMemo(() => {
    const maxAniso = gl.capabilities.getMaxAnisotropy();
    return {
      height: dataTex(data.heights, GW, GH, { float: true }),
      norm: dataTex(data.normals, GW, GH, { aniso: Math.min(8, maxAniso) }),
      feat: dataTex(data.features, GW, GH, { aniso: Math.min(8, maxAniso) }),
      biome: dataTex(data.biome, BW, BH, { srgb: true }),
      detail: dataTex(data.detail, DETAIL, DETAIL, { repeat: true, aniso: Math.min(8, maxAniso) }),
      waves: dataTex(data.waves, WAVES, WAVES, { repeat: true }),
      cloud: buildCloudNoiseTexture(),
    };
  }, [data, gl]);
  useEffect(() => () => Object.values(tex).forEach((t) => t.dispose()), [tex]);

  const bounds = useMemo(() => chunkBounds(data), [data]);
  const geos = useMemo(() => LOD_SEGS.map(chunkGeometry), []);
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);

  const uniforms = useMemo(
    () => ({
      uMorph: { value: 0 },
      uTime: { value: 0 },
      uCloudAmt: { value: 1 },
      uRealism: { value: 0 },
      uHeight: { value: tex.height },
      uMapTex: { value: mapTex },
      uNormTex: { value: tex.norm },
      uFeatTex: { value: tex.feat },
      uBiomeTex: { value: tex.biome },
      uDetailTex: { value: tex.detail },
      uCloudTex: { value: tex.cloud },
    }),
    [tex, mapTex],
  );

  const material = useMemo(() => {
    mapTex.colorSpace = THREE.SRGBColorSpace;
    mapTex.anisotropy = gl.capabilities.getMaxAnisotropy();
    return makeTerrainMaterial(uniforms, quality === "low");
  }, [mapTex, uniforms, quality, gl]);
  useEffect(() => () => material.dispose(), [material]);

  const meshes = useMemo(
    () =>
      geos.map((g) => {
        const m = new THREE.InstancedMesh(g, material, NCX * NCZ);
        m.count = 0;
        m.frustumCulled = false; // culled per chunk below
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        return m;
      }),
    [geos, material],
  );
  useEffect(() => () => meshes.forEach((m) => m.dispose()), [meshes]);

  const waterMat = useMemo(() => {
    const m = makeWaterMaterial();
    m.uniforms.uHeight.value = tex.height;
    m.uniforms.uWaves.value = tex.waves;
    // the sky's own colours, live — the sea reflects the weather it is under
    m.uniforms.uTop = skyUniforms.uTop;
    m.uniforms.uHorizon = skyUniforms.uHorizon;
    m.uniforms.uSunColor = skyUniforms.uSunColor;
    m.uniforms.uSunDir = skyUniforms.uSunDir;
    return m;
  }, [tex]);
  useEffect(() => () => waterMat.dispose(), [waterMat]);

  const waterRef = useRef<THREE.Mesh>(null);
  const phase = useRef({ t: 0, real: 0 });

  useFrame(({ camera }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    phase.current.t += dt;
    const s = useGame.getState();

    // texture and bake finished → allow "Begin the Journey"
    if (!readyRef.current) {
      readyRef.current = true;
      setReady();
    }

    // morph 0 → 1 with an easeInOut over 3s once the journey begins
    let target = 0;
    if (s.phase === "map" && s.morphStart > 0) {
      const k = Math.min(1, (performance.now() - s.morphStart) / 3000);
      target = k * k * (3 - 2 * k);
    }
    morph.value = target;

    // the land turns real as the camera comes down to it
    const agl =
      camera.position.y -
      heightAt(
        THREE.MathUtils.clamp(camera.position.x, 0, MAP_W),
        THREE.MathUtils.clamp(camera.position.z, 0, MAP_H),
      ) * target;
    const realTarget = 1 - THREE.MathUtils.smoothstep(agl, 150, 420);
    phase.current.real += (realTarget - phase.current.real) * Math.min(1, 2.5 * dt);
    realism.value = phase.current.real;

    uniforms.uMorph.value = target;
    uniforms.uTime.value = phase.current.t;
    uniforms.uRealism.value = realism.value;
    waterMat.uniforms.uTime.value = phase.current.t;
    waterMat.uniforms.uMorph.value = target;
    if (waterRef.current) {
      waterRef.current.position.y = THREE.MathUtils.lerp(-3, SEA_LEVEL, target);
      waterRef.current.visible = target > 0.05;
    }

    // ── choose each chunk's density and cull it against the view ──
    camera.updateMatrixWorld();
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pm);
    const dists = quality === "low" ? LOD_DIST.low : LOD_DIST.high;
    for (const m of meshes) m.count = 0;
    for (let cz = 0; cz < NCZ; cz++) {
      for (let cx = 0; cx < NCX; cx++) {
        const b = (cz * NCX + cx) * 2;
        const x0 = cx * CHUNK;
        const z0 = cz * CHUNK;
        _box.min.set(x0, bounds[b] * target - 46, z0); // the deepest skirt drops 43
        _box.max.set(x0 + CHUNK, bounds[b + 1] * target + 4, z0 + CHUNK);
        const d = _box.distanceToPoint(camera.position);
        // the camera moves after this runs (CameraRig is later in the frame),
        // so pad by distance too — a fast turn sweeps far chunks the furthest
        _box.expandByScalar(24 + d * 0.12);
        if (!_frustum.intersectsBox(_box)) continue;
        const lod = d < dists[0] ? 0 : d < dists[1] ? 1 : d < dists[2] ? 2 : 3;
        const mesh = meshes[lod];
        mesh.setMatrixAt(mesh.count++, _m.makeTranslation(x0, 0, z0));
      }
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      <mesh
        ref={waterRef}
        position={[MAP_W / 2, -3, MAP_H / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={waterMat}
        renderOrder={1}
      >
        <planeGeometry args={[MAP_W, MAP_H, 1, 1]} />
      </mesh>
    </group>
  );
}
