"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { MAP_W, MAP_H } from "@/data/content";

/** Sky shader uniforms — mutated live by the Weather system. */
export const skyUniforms = {
  uTop: { value: new THREE.Color("#6f8fb8") },
  uHorizon: { value: new THREE.Color("#e8cf9e") },
  uSunColor: { value: new THREE.Color("#ffe7b8") },
  uSunDir: { value: new THREE.Vector3(-0.45, 0.42, -0.55).normalize() },
  uFlash: { value: 0 },
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
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_Position.z = gl_Position.w; // pin to far plane
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop;
          uniform vec3 uHorizon;
          uniform vec3 uSunColor;
          uniform vec3 uSunDir;
          uniform float uFlash;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float h = clamp(d.y, -0.12, 1.0);
            float band = pow(1.0 - clamp(h, 0.0, 1.0), 2.4);
            vec3 col = mix(uTop, uHorizon, band);
            // sun disc + halo
            float sunAmt = clamp(dot(d, normalize(uSunDir)), 0.0, 1.0);
            col += uSunColor * (pow(sunAmt, 420.0) * 3.2 + pow(sunAmt, 24.0) * 0.45 + pow(sunAmt, 5.0) * 0.12);
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

  return (
    <mesh material={material} position={[MAP_W / 2, 0, MAP_H / 2]} frustumCulled={false} renderOrder={-10}>
      <sphereGeometry args={[5200, 32, 18]} />
    </mesh>
  );
}
