"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { skyUniforms } from "@/three/SkyDome";

/**
 * Image-based lighting derived from the live sky.
 *
 * Every stone, gold fitting and dragon scale in the world is a
 * MeshStandardMaterial, and without an environment map a standard material has
 * no specular term to speak of — metalness reads as flat grey and roughness
 * variation is invisible. This renders the same sky shader the dome uses into a
 * PMREM probe and hands it to the scene, so surfaces reflect the sky they are
 * actually under: warm in Lórien, sodium-red over Mordor.
 *
 * The probe is only re-rendered when the sky has actually drifted — the
 * weather, or the sun and sky colours as the day turns — at most once a
 * second (through dusk and dawn), every few seconds by day, and hardly at
 * all at night, rather than 60 times a second. Each rebuild allocates a fresh
 * 768×1024 half-float target and recompiles nothing, but churns ~9 MB.
 */

/** Scene-wide IBL strength. The hemisphere light is scaled down to match. */
export const ENV_INTENSITY = 0.85;

const REBUILD_INTERVAL = 1; // seconds
const luminance = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const COLOR_EPS = 0.012;

const colorDrift = (a: THREE.Color, b: THREE.Color) =>
  Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);

export function SkyEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  const rig = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envScene = new THREE.Scene();
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      // matches SkyDome, plus a ground bounce below the horizon so undersides
      // pick up warm earth light instead of blue sky
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uSunColor;
        uniform vec3 uGround;
        uniform vec3 uSunDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float band = pow(1.0 - clamp(d.y, 0.0, 1.0), 2.4);
          vec3 col = mix(uTop, uHorizon, band);
          float sunAmt = clamp(dot(d, normalize(uSunDir)), 0.0, 1.0);
          col += uSunColor * (pow(sunAmt, 96.0) * 2.6 + pow(sunAmt, 8.0) * 0.32);
          col = mix(col, uGround * 0.85, smoothstep(0.02, -0.28, d.y));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 24, 16), material);
    envScene.add(mesh);
    return { pmrem, envScene, mesh, material };
  }, [gl]);

  const state = useRef({
    t: REBUILD_INTERVAL,
    last: { top: new THREE.Color(1e3, 1e3, 1e3), horizon: new THREE.Color(), sun: new THREE.Color(), dir: new THREE.Vector3() },
    rt: null as THREE.WebGLRenderTarget | null,
  });

  useEffect(() => {
    scene.environmentIntensity = ENV_INTENSITY;
    const rig0 = rig;
    const st = state.current;
    return () => {
      scene.environment = null;
      st.rt?.dispose();
      st.rt = null;
      rig0.pmrem.dispose();
      rig0.mesh.geometry.dispose();
      rig0.material.dispose();
    };
  }, [rig, scene]);

  useFrame((_, dt) => {
    const st = state.current;
    st.t += dt;
    if (st.t < REBUILD_INTERVAL) return;
    const last = st.last;
    const drift =
      colorDrift(skyUniforms.uTop.value, last.top) +
      colorDrift(skyUniforms.uHorizon.value, last.horizon) +
      colorDrift(skyUniforms.uSunColor.value, last.sun) * 0.5 +
      // the sun's highlight in the probe is broad; it can wander a little —
      // and not at all once the sun has set (its colour is black all night)
      skyUniforms.uSunDir.value.distanceTo(last.dir) * 0.25 * Math.min(1, luminance(skyUniforms.uSunColor.value));
    // reset the timer on the skip path too, so during a weather transition the
    // probe rebuilds at most once per interval rather than on the first frame
    // the drift crosses the threshold
    st.t = 0;
    if (st.rt && drift < COLOR_EPS) return;

    last.top.copy(skyUniforms.uTop.value);
    last.horizon.copy(skyUniforms.uHorizon.value);
    last.sun.copy(skyUniforms.uSunColor.value);
    last.dir.copy(skyUniforms.uSunDir.value);
    const next = rig.pmrem.fromScene(rig.envScene, 0, 1, 1000);
    st.rt?.dispose();
    st.rt = next;
    scene.environment = next.texture;
  });

  return null;
}
