"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MAP_W, MAP_H } from "@/data/content";
import { useGame } from "@/state/store";
import { stepDaylight } from "@/three/daylight";
import { Stars } from "@/three/Stars";

/** Sky shader uniforms — mutated live by the Weather system. */
export const skyUniforms = {
  uTop: { value: new THREE.Color("#6f8fb8") },
  uHorizon: { value: new THREE.Color("#e8cf9e") },
  uSunColor: { value: new THREE.Color("#ffe7b8") },
  /** ground bounce colour — read by the IBL probe, not by the dome itself */
  uGround: { value: new THREE.Color("#8a7a5c") },
  uSunDir: { value: new THREE.Vector3(-0.45, 0.42, -0.55).normalize() },
  uFlash: { value: 0 },
  uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
  /** how much of the moon shows: 0 when set, faint by day, full at night */
  uMoon: { value: 0 },
  /** sunset fire along the horizon on the sun's side, 0..1 */
  uGlow: { value: 0 },
};

export function SkyDome() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: skyUniforms,
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorld = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
            gl_Position.z = gl_Position.w; // pin to far plane
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop;
          uniform vec3 uHorizon;
          uniform vec3 uSunColor;
          uniform vec3 uSunDir;
          uniform vec3 uMoonDir;
          uniform float uMoon;
          uniform float uGlow;
          uniform float uFlash;
          varying vec3 vWorld;

          // the full moon: a pale disc with a few darker seas and a soft limb
          vec3 moon(vec3 d, vec3 M) {
            float c = max(dot(d, M), 0.0);
            vec3 halo = vec3(0.55, 0.66, 0.9) * (pow(c, 1800.0) * 0.4 + pow(c, 60.0) * 0.05);
            if (c < 0.999) return halo;
            vec3 t1 = normalize(cross(M, vec3(0.0, 1.0, 0.0)));
            vec3 t2 = cross(t1, M);
            vec2 p = vec2(dot(d, t1), dot(d, t2)) / 0.02;
            float r = length(p);
            float seas = 0.36 * (1.0 - smoothstep(0.16, 0.42, length(p - vec2(-0.28, 0.22))))
                       + 0.3 * (1.0 - smoothstep(0.12, 0.34, length(p - vec2(0.3, 0.32))))
                       + 0.24 * (1.0 - smoothstep(0.08, 0.3, length(p - vec2(0.12, -0.36))));
            float limb = 0.78 + 0.22 * sqrt(max(0.0, 1.0 - r * r));
            // kept just under 1 so the seas survive — only the halo blooms
            vec3 face = vec3(1.0, 0.97, 0.9) * 0.95 * (1.0 - seas) * limb;
            return mix(halo, face, 1.0 - smoothstep(0.9, 1.0, r));
          }

          void main() {
            // view direction from the camera, not the dome's centre, so the
            // sun, moon and stars hold still as the steed crosses the map
            vec3 d = normalize(vWorld - cameraPosition);
            float h = clamp(d.y, -0.12, 1.0);
            float band = pow(1.0 - clamp(h, 0.0, 1.0), 2.4);
            vec3 col = mix(uTop, uHorizon, band);
            vec3 S = normalize(uSunDir);
            // a low sun sets the horizon alight on its own side of the sky
            float side = 0.5 + 0.5 * dot(normalize(d.xz + 1e-5), normalize(S.xz + 1e-5));
            col += uSunColor * uGlow * band * band * side * side * side * 0.5;
            // sun disc (cut off by the horizon, so it sets) + halo — a soft
            // one: the sun now crosses the view, and a hot halo blooms into a
            // white-out a quarter of the screen wide
            float above = smoothstep(-0.004, 0.006, d.y);
            float sunAmt = clamp(dot(d, S), 0.0, 1.0);
            col += uSunColor * (pow(sunAmt, 420.0) * 3.2 * above + pow(sunAmt, 24.0) * 0.26 + pow(sunAmt, 5.0) * 0.12);
            col += moon(d, normalize(uMoonDir)) * uMoon * above;
            // below-horizon ground haze
            col = mix(col, uHorizon * 0.72, smoothstep(0.0, -0.12, d.y));
            // lightning flash
            col += vec3(1.0, 0.93, 0.82) * uFlash;
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, dt) => {
    // the clock runs once the journey begins; the cover keeps its morning
    stepDaylight(Math.min(dt, 0.1), useGame.getState().phase === "map");
  });

  return (
    <>
      <mesh material={material} position={[MAP_W / 2, 0, MAP_H / 2]} frustumCulled={false} renderOrder={-10}>
        <sphereGeometry args={[5200, 32, 18]} />
      </mesh>
      <Stars />
    </>
  );
}
