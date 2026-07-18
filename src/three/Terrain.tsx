"use client";

import { useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { MAP_W, MAP_H, SEA_LEVEL } from "@/data/content";
import { heightAt, fbm } from "@/three/noise";
import { useGame } from "@/state/store";

const SEG_X = 384;
const SEG_Z = 216;

/** Shared morph value (0 = flat parchment, 1 = full 3D). Written by <Terrain>, read anywhere. */
export const morph = { value: 0 };

function buildGeometry() {
  const geo = new THREE.BufferGeometry();
  const nx = SEG_X + 1;
  const nz = SEG_Z + 1;
  const positions = new Float32Array(nx * nz * 3);
  const uvs = new Float32Array(nx * nz * 2);
  const aH = new Float32Array(nx * nz);
  const aN = new Float32Array(nx * nz * 3);

  let i = 0;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = (ix / SEG_X) * MAP_W;
      const z = (iz / SEG_Z) * MAP_H;
      positions[i * 3] = x;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = z;
      uvs[i * 2] = ix / SEG_X;
      uvs[i * 2 + 1] = 1 - iz / SEG_Z; // v flipped: map image top = north (z=0)
      aH[i] = heightAt(x, z);
      i++;
    }
  }

  // normals by central difference on the height grid — heightAt is the hot
  // path of this (main-thread) build, so avoid 4 extra calls per vertex
  const dx = MAP_W / SEG_X; // grid spacing (same in z: MAP_H / SEG_Z)
  i = 0;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const ixL = Math.max(0, ix - 1);
      const ixR = Math.min(SEG_X, ix + 1);
      const izD = Math.max(0, iz - 1);
      const izU = Math.min(SEG_Z, iz + 1);
      const nxc = aH[iz * nx + ixL] - aH[iz * nx + ixR];
      const nzc = aH[izD * nx + ix] - aH[izU * nx + ix];
      const nyc = (ixR - ixL) * dx; // matches normalAt's 2·eps, halved at edges
      const len = Math.hypot(nxc, nyc, nzc) || 1;
      aN[i * 3] = nxc / len;
      aN[i * 3 + 1] = nyc / len;
      aN[i * 3 + 2] = nzc / len;
      i++;
    }
  }

  const index = new Uint32Array(SEG_X * SEG_Z * 6);
  let k = 0;
  for (let iz = 0; iz < SEG_Z; iz++) {
    for (let ix = 0; ix < SEG_X; ix++) {
      const a = iz * nx + ix;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      index[k++] = a;
      index[k++] = c;
      index[k++] = b;
      index[k++] = b;
      index[k++] = c;
      index[k++] = d;
    }
  }

  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute("aH", new THREE.BufferAttribute(aH, 1));
  geo.setAttribute("aN", new THREE.BufferAttribute(aN, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  // Expand bounds so the morphed (raised) mesh never gets culled
  if (geo.boundingSphere) geo.boundingSphere.radius += 120;
  return geo;
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

export function Terrain() {
  const mapTex = useLoader(THREE.TextureLoader, "/assets/map.jpg");
  const setReady = useGame((s) => s.setReady);
  const readyRef = useRef(false);

  const geometry = useMemo(buildGeometry, []);
  const cloudTex = useMemo(buildCloudNoiseTexture, []);

  const uniforms = useMemo(
    () => ({
      uMorph: { value: 0 },
      uTime: { value: 0 },
      uCloudTex: { value: cloudTex },
      uCloudAmt: { value: 1 },
    }),
    [cloudTex],
  );

  const material = useMemo(() => {
    mapTex.colorSpace = THREE.SRGBColorSpace;
    mapTex.anisotropy = 16;
    const mat = new THREE.MeshStandardMaterial({
      map: mapTex,
      roughness: 0.94,
      metalness: 0.02,
    });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           attribute float aH;
           attribute vec3 aN;
           uniform float uMorph;
           varying vec2 vTUv;
           varying float vH;
           varying float vUp;`,
        )
        .replace(
          "#include <beginnormal_vertex>",
          `vec3 objectNormal = normalize(mix(vec3(0.0, 1.0, 0.0), aN, uMorph));
           vUp = objectNormal.y;`,
        )
        .replace(
          "#include <begin_vertex>",
          `vec3 transformed = vec3(position);
           transformed.y += aH * uMorph;
           vTUv = uv;
           vH = aH * uMorph;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           uniform float uMorph;
           uniform float uTime;
           uniform float uCloudAmt;
           uniform sampler2D uCloudTex;
           varying vec2 vTUv;
           varying float vH;
           varying float vUp;
           float zoneMask(vec2 uv, vec2 c, float r) {
             return smoothstep(r, r * 0.45, distance(uv * vec2(1.0, 0.5625), c * vec2(1.0, 0.5625)));
           }`,
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
           {
             vec2 muv = vec2(vTUv.x, 1.0 - vTUv.y); // map-fraction coords (v down)
             vec3 c = diffuseColor.rgb;

             // rock & snow with altitude, crags on steep slopes
             float slope = 1.0 - vUp;
             float rockAmt = smoothstep(22.0, 46.0, vH) * 0.75 + slope * 1.4 * smoothstep(10.0, 30.0, vH);
             rockAmt = clamp(rockAmt, 0.0, 1.0);
             vec3 rockC = mix(vec3(0.42, 0.36, 0.30), vec3(0.32, 0.29, 0.27), slope * 2.0);
             c = mix(c, c * 0.35 + rockC * 0.75, rockAmt * uMorph);
             float snowAmt = smoothstep(58.0, 76.0, vH) * smoothstep(0.75, 0.35, slope);
             c = mix(c, vec3(0.93, 0.93, 0.95), snowAmt * uMorph);

             // the green country of the Shire
             float shire = zoneMask(muv, vec2(0.352, 0.262), 0.085);
             c = mix(c, c * vec3(0.72, 0.92, 0.48) + vec3(0.02, 0.05, 0.0), shire * 0.55 * uMorph);

             // forests: Mirkwood (dark), Fangorn (deep), Lórien (golden)
             float mirk = zoneMask(muv, vec2(0.615, 0.27), 0.095);
             c = mix(c, c * vec3(0.52, 0.62, 0.42), mirk * 0.5 * uMorph);
             float fang = zoneMask(muv, vec2(0.520, 0.437), 0.028);
             c = mix(c, c * vec3(0.5, 0.66, 0.42), fang * 0.55 * uMorph);
             float lor = zoneMask(muv, vec2(0.548, 0.372), 0.02);
             c = mix(c, c * vec3(1.12, 0.96, 0.52) + vec3(0.08, 0.05, 0.0), lor * 0.6 * uMorph);

             // Mordor — charred, ashen
             float mordor = zoneMask(muv, vec2(0.715, 0.635), 0.115);
             c = mix(c, c * vec3(0.42, 0.30, 0.27) + vec3(0.03, 0.0, 0.0), mordor * 0.72 * uMorph);

             // shallow sea bed tint under the water sheet
             float under = smoothstep(${SEA_LEVEL.toFixed(2)} + 1.5, ${SEA_LEVEL.toFixed(2)} - 3.0, vH + (1.0 - uMorph) * 100.0);
             c = mix(c, c * vec3(0.45, 0.62, 0.62), under * 0.6);

             // drifting cloud shadows
             float cs1 = texture2D(uCloudTex, vTUv * 9.0 + uTime * vec2(0.010, 0.004)).r;
             float cs2 = texture2D(uCloudTex, vTUv * 16.0 - uTime * vec2(0.006, 0.009)).r;
             float shadow = clamp(cs1 * cs2 * 1.6, 0.0, 1.0);
             c *= 1.0 - shadow * 0.24 * uMorph * uCloudAmt;

             diffuseColor.rgb = c;
           }`,
        );
    };
    return mat;
  }, [mapTex, uniforms]);

  // ── water sheet (western seas, bays, Núrnen) ──
  const waterMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uSun: { value: new THREE.Vector3(-0.5, 0.6, -0.4).normalize() },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying vec3 vWorld;
          void main() {
            vUv = uv;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorld = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uSun;
          varying vec2 vUv;
          varying vec3 vWorld;
          void main() {
            float w1 = sin(vWorld.x * 0.032 + uTime * 0.7) * sin(vWorld.z * 0.028 - uTime * 0.55);
            float w2 = sin(vWorld.x * 0.07 - uTime * 1.1 + vWorld.z * 0.06) * 0.5;
            float glint = pow(clamp(w1 * 0.5 + w2 * 0.5 + 0.5, 0.0, 1.0), 6.0);
            vec3 deep = vec3(0.13, 0.23, 0.26);
            vec3 lit = vec3(0.55, 0.62, 0.55);
            vec3 col = mix(deep, lit, glint * 0.8);
            vec3 V = normalize(cameraPosition - vWorld);
            float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.0);
            col += vec3(0.75, 0.65, 0.45) * glint * fres * 0.7;
            gl_FragColor = vec4(col, 0.82);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );

  const waterRef = useRef<THREE.Mesh>(null);
  const phase = useRef({ t: 0 });

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    phase.current.t += dt;
    const s = useGame.getState();

    // texture finished → allow "Begin the Journey"
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
    uniforms.uMorph.value = target;
    uniforms.uTime.value = phase.current.t;
    waterMat.uniforms.uTime.value = phase.current.t;
    if (waterRef.current) {
      waterRef.current.position.y = THREE.MathUtils.lerp(-3, SEA_LEVEL, target);
      waterRef.current.visible = target > 0.05;
    }
  });

  return (
    <group>
      <mesh geometry={geometry} material={material} receiveShadow />
      <mesh
        ref={waterRef}
        position={[MAP_W / 2, -3, MAP_H / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={waterMat}
      >
        <planeGeometry args={[MAP_W, MAP_H, 1, 1]} />
      </mesh>
    </group>
  );
}
