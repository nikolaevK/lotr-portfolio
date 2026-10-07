"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { runtime } from "@/game/runtime";
import { useGame } from "@/state/store";
import { daylight, SKY_POLE } from "@/three/daylight";

/**
 * The night sky: one draw call of points pinned to the far plane like the
 * dome, carried with the camera (so they never parallax) and wheeled about the
 * sky's pole with the time of day. They fade in with the night, twinkle, thin
 * toward the horizon haze, and stay hidden behind Mordor's reek.
 */

const COUNT = { high: 1800, low: 700 };
// depth is pinned to the far plane, so any radius draws the same; a large one
// hides the frame of lag in following the camera (the rig moves it later)
const RADIUS = 10000;

function buildStars(n: number) {
  let s = 90210;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const phase = new Float32Array(n);
  // a third of the stars crowd toward one great circle: a hint of a galaxy
  const band = new THREE.Vector3(0.3, 0.45, 0.84).normalize();
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    do v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
    while (v.lengthSq() > 1 || v.lengthSq() < 0.01);
    v.normalize();
    if (i % 3 === 0) v.addScaledVector(band, -v.dot(band) * 0.85).normalize();
    v.multiplyScalar(RADIUS).toArray(pos, i * 3);
    // most stars faint, a handful bright enough to catch the bloom
    const b = Math.pow(rand(), 3.2);
    size[i] = 1.8 + b * 3;
    const k = 0.5 + b * 1.5;
    const temp = rand();
    const [r, g, bl] = temp < 0.18 ? [0.75, 0.85, 1] : temp > 0.9 ? [1, 0.86, 0.7] : [1, 1, 1];
    col[i * 3] = r * k;
    col[i * 3 + 1] = g * k;
    col[i * 3 + 2] = bl * k;
    phase[i] = rand();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  return geo;
}

export function Stars() {
  const quality = useGame((s) => s.quality);
  const ref = useRef<THREE.Points>(null);
  const geometry = useMemo(() => buildStars(COUNT.high), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uAlpha: { value: 0 }, uTime: { value: 0 }, uPx: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute vec3 aColor;
          attribute float aSize;
          attribute float aPhase;
          uniform float uAlpha;
          uniform float uTime;
          uniform float uPx;
          varying vec3 vCol;
          void main() {
            vec3 dir = normalize(mat3(modelMatrix) * position);
            float twinkle = 0.7 + 0.3 * sin(uTime * (1.1 + aPhase * 2.3) + aPhase * 43.0);
            float a = uAlpha * smoothstep(0.03, 0.25, dir.y) * twinkle;
            vCol = aColor * a;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position.z = gl_Position.w; // behind everything, like the dome
            gl_PointSize = a > 0.004 ? aSize * uPx : 0.0;
          }`,
        // additive, so premultiplied colour with alpha 1
        fragmentShader: /* glsl */ `
          varying vec3 vCol;
          void main() {
            vec2 p = gl_PointCoord * 2.0 - 1.0;
            float f = max(0.0, 1.0 - dot(p, p));
            gl_FragColor = vec4(vCol * f * f, 1.0);
            // like the dome: LOW quality draws straight to the sRGB canvas
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(({ camera, clock, gl }) => {
    const pts = ref.current;
    if (!pts) return;
    // squared: the first stars wait for the blue hour to deepen. Cubed zone
    // weight, as Weather blends them, so only Mordor's own sky goes starless
    const mordor = runtime.zoneWeights.mordor ?? 0;
    const alpha = daylight.night * daylight.night * (1 - 0.95 * mordor * mordor * mordor);
    pts.visible = alpha > 0.01;
    if (!pts.visible) return;
    pts.position.copy(camera.position);
    pts.quaternion.setFromAxisAngle(SKY_POLE, (daylight.t - 0.5) * Math.PI * 2);
    material.uniforms.uAlpha.value = alpha;
    material.uniforms.uTime.value = clock.elapsedTime;
    material.uniforms.uPx.value = gl.getPixelRatio();
    geometry.setDrawRange(0, COUNT[quality]);
  });

  // drawn just after the dome and before every other transparent, so clouds
  // and the sea pass in front of the stars rather than under them
  return <points ref={ref} geometry={geometry} material={material} frustumCulled={false} renderOrder={-9} visible={false} />;
}
