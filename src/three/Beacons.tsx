"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useContent } from "@/state/content";
import { heightAt } from "@/three/noise";
import { morph } from "@/three/Terrain";
import { useGame } from "@/state/store";
import { Plume } from "@/three/Particles";
import { pbr, surfaces } from "@/three/materials";
import { allBeaconsLit, beaconChain, chainFire, footing, type ChainLink } from "@/game/cinematics";

/**
 * The Beacons of Gondor: the three the player lights, and the rest of the
 * chain toward Rohan, which burns once those three do (the beacon cinematic
 * sets it alight link by link — see chainFire).
 */

interface PyreKit {
  logs: THREE.BufferGeometry;
  quad: THREE.PlaneGeometry;
  stone: THREE.Material;
  wood: THREE.Material;
}

// Shared by every pyre for the app's lifetime, like the landmarks' palette;
// built on first use because the textures are drawn into a canvas.
let kit: PyreKit | null = null;

function pyreKit(): PyreKit {
  if (kit) return kit;
  const s = surfaces();
  const parts: THREE.BufferGeometry[] = [];
  // a square crib of logs on the platform (y 0)…
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) {
      const g = new THREE.CylinderGeometry(0.5, 0.55, 7.6 - i * 0.8, 7);
      g.rotateZ(Math.PI / 2);
      g.translate(0, 0.55 + i * 0.95, side * (2.5 - i * 0.25));
      if (i % 2) g.rotateY(Math.PI / 2);
      parts.push(g);
    }
  }
  // …filled with a teepee of poles, so an unlit pyre still reads as one
  const up = new THREE.Vector3(0, 1, 0);
  const apex = new THREE.Vector3(0, 9.2, 0);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const foot = new THREE.Vector3(Math.cos(a) * 2.3, 0.4, Math.sin(a) * 2.3);
    const dir = apex.clone().sub(foot);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(0.22, 0.38, len, 5);
    g.applyMatrix4(
      new THREE.Matrix4().compose(
        foot.clone().addScaledVector(dir, 0.5),
        new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()),
        new THREE.Vector3(1, 1, 1),
      ),
    );
    parts.push(g);
  }
  const logs = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  const uv = logs.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 2.5);

  kit = {
    logs,
    quad: new THREE.PlaneGeometry(1, 1),
    // tint rides on vertex colours (see terrace)
    stone: pbr(s.rock, "#ffffff"),
    wood: pbr(s.timber, "#7c5732", { vertexColors: false }),
  };
  return kit;
}

/** Stable pseudo-random 0..1 from a pair of numbers. */
const hash2 = (a: number, b: number) => {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

const RIM = 4.2; // platform radius: the crib spans ±3.8
const SEG = 18;
const STONE = new THREE.Color("#b7b0a6");
const ROCK = new THREE.Color("#9d968d");
const SNOW = new THREE.Color("#dfe5ec");

/**
 * The pyre's footing, fitted to its hilltop: a flat dry-stone platform cut
 * into the high side, whose edge falls to the real ground a little beyond and
 * then runs on under it — so it never stands on stilts, and only the few
 * units of fill on the downhill side show. High pyres take the snow the
 * summits carry (same line as the terrain shader's, near enough).
 */
function terrace(x: number, z: number, top: number) {
  const rings: { r: number; y: (a: number, r: number) => number }[] = [
    { r: RIM, y: () => 0 },
    { r: RIM + 0.35, y: () => -0.45 },
    { r: 5.8, y: (a, r) => Math.min(-0.45, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r) - top - 0.6) },
    { r: 9.5, y: (a, r) => heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r) - top - 3 },
  ];
  const pos: number[] = [0, 0, 0];
  for (let k = 0; k < rings.length; k++) {
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      // rubble, not a lathe: the outer rings wander a little
      const r = rings[k].r * (k >= 2 ? 0.9 + 0.2 * hash2(i, k) : 1);
      pos.push(Math.cos(a) * r, rings[k].y(a, r), Math.sin(a) * r);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < SEG; i++) index.push(0, 1 + ((i + 1) % SEG), 1 + i);
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < SEG; i++) {
      const a = 1 + k * SEG + i;
      const b = 1 + k * SEG + ((i + 1) % SEG);
      const c = a + SEG;
      const d = b + SEG;
      index.push(a, b, d, a, d, c);
    }
  }
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  indexed.setIndex(index);
  // faceted, like split stone
  const g = indexed.toNonIndexed();
  indexed.dispose();
  g.computeVertexNormals();

  const p = g.getAttribute("position") as THREE.BufferAttribute;
  const n = g.getAttribute("normal") as THREE.BufferAttribute;
  const uvs = new Float32Array(p.count * 2);
  const cols = new Float32Array(p.count * 3);
  const snow = THREE.MathUtils.smoothstep(top, 74, 92);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i);
    const py = p.getY(i);
    const pz = p.getZ(i);
    uvs[i * 2] = (px + py * 0.6) / 7;
    uvs[i * 2 + 1] = (pz - py * 0.6) / 7;
    const onTop = py > -0.01 && px * px + pz * pz <= RIM * RIM + 0.01;
    if (onTop) c.copy(STONE);
    else c.copy(ROCK).lerp(SNOW, snow * THREE.MathUtils.smoothstep(n.getY(i), 0.45, 0.85));
    c.toArray(cols, i * 3);
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  return g;
}

/**
 * The flame: an upright billboard (it turns to the camera about the vertical
 * only) holding a teardrop of fire that licks upward through scrolling noise.
 * Drawn premultiplied "over", not additive: against a bright dusk sky added
 * light clips red and green together into lime. Only the hot core runs past
 * 1.0, for the bloom.
 */
function flameMaterial(seed: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: {
      uW: { value: 12 },
      uH: { value: 19 },
      uFade: { value: 0 },
      uHot: { value: 1 },
      uTime: { value: 0 },
      uSeed: { value: seed * 3.71 },
    },
    vertexShader: /* glsl */ `
      uniform float uW;
      uniform float uH;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec2 h = cameraPosition.xz - c.xz;
        float l = length(h);
        vec2 d = l > 1e-3 ? h / l : vec2(0.0, 1.0);
        // the group's y-scale is the ignition leap
        float sy = length(modelMatrix[1].xyz);
        vec3 p = c + vec3(d.y, 0.0, -d.x) * position.x * uW + vec3(0.0, (position.y + 0.5) * uH * sy, 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uSeed;
      uniform float uFade;
      uniform float uHot;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float y = vUv.y;
        float t = uTime * 2.6 + uSeed;
        float n = vnoise(vec2(vUv.x * 4.0 + uSeed, y * 3.0 - t)) * 0.65 + vnoise(vec2(vUv.x * 9.0 - uSeed, y * 7.0 - t * 1.7)) * 0.35;
        // wider at the root, wavering more toward the tips
        float x = vUv.x - 0.5 + (n - 0.5) * 0.3 * y;
        float w = 0.48 * pow(max(0.0, 1.0 - y), 0.7) * (0.5 + 0.65 * n) * smoothstep(0.0, 0.06, y);
        float body = smoothstep(w, w * 0.3, abs(x));
        float heat = body * (1.0 - y * 0.8);
        vec3 col = mix(vec3(0.62, 0.1, 0.02), vec3(0.95, 0.36, 0.06), smoothstep(0.12, 0.5, heat));
        col = mix(col, vec3(1.0, 0.64, 0.28), smoothstep(0.55, 0.9, heat));
        col *= 1.0 + 0.8 * uHot * smoothstep(0.6, 0.95, heat);
        // the tips let the sky through; the heart of the fire does not
        float a = body * (0.45 + 0.5 * heat) * uFade;
        gl_FragColor = vec4(col * a, a);
      }`,
  });
}

/**
 * A camera-facing glow that carries the fire across leagues, where the
 * flame shrinks to a few pixels. It is pulled toward the eye so the pyre and
 * its hilltop never slice the disc. Additive, premultiplied, alpha 1 — kept
 * low in green so it warms a bright sky rather than yellowing it.
 */
function glowMaterial(seed: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uSize: { value: 18 },
      uIntensity: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: seed * 2.17 },
    },
    vertexShader: /* glsl */ `
      uniform float uSize;
      varying vec2 vP;
      void main() {
        vP = position.xy * 2.0;
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float d = length(mv.xyz);
        mv.xyz *= 1.0 - min(14.0, d * 0.5) / max(d, 1e-3);
        mv.xy += position.xy * uSize;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      uniform float uTime;
      uniform float uSeed;
      varying vec2 vP;
      void main() {
        float r2 = dot(vP, vP);
        if (r2 >= 1.0) discard;
        float flick = 0.86 + 0.14 * sin(uTime * 13.0 + uSeed) * sin(uTime * 7.1 + uSeed * 1.7);
        float halo = (1.0 - r2) * (1.0 - r2) * exp(-r2 * 3.5);
        float core = exp(-r2 * 30.0);
        vec3 col = vec3(1.0, 0.33, 0.06) * halo * 0.5 + vec3(1.0, 0.55, 0.22) * core * 0.55;
        gl_FragColor = vec4(col * uIntensity * flick, 1.0);
      }`,
  });
}

// Fires are culled by hand: the Plumes and billboards inside cannot be
// frustum-culled by three (their shapes live in the shaders). Past PLUME_FAR
// embers and smoke are under a pixel, so only flame and glow are drawn.
const FIRE_FAR = 1200;
const PLUME_FAR = 450;
const _frustum = new THREE.Frustum();
const _pm = new THREE.Matrix4();
const _sphere = new THREE.Sphere(new THREE.Vector3(), 75);
let frustumAt = -1;

function BeaconPyre({ link, index, lit, k }: { link: ChainLink; index: number; lit: boolean; k: PyreKit }) {
  const group = useRef<THREE.Group>(null);
  const fire = useRef<THREE.Group>(null);
  const plumes = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const top = useMemo(() => footing(link.x, link.z).top, [link.x, link.z]);
  const ground = useMemo(() => terrace(link.x, link.z, top), [link.x, link.z, top]);
  const flame = useMemo(() => flameMaterial(index), [index]);
  const glow = useMemo(() => glowMaterial(index), [index]);
  useEffect(
    () => () => {
      ground.dispose();
      flame.dispose();
      glow.dispose();
    },
    [ground, flame, glow],
  );
  // when this fire last caught, for the flare of its first moments
  const caught = useRef({ on: false, at: 0 });

  useFrame(({ clock, camera }, dt) => {
    const g = group.current;
    if (!g) return;
    g.position.y = top * morph.value;
    g.visible = morph.value > 0.05;

    const now = clock.elapsedTime;
    const on = lit && index < chainFire.upTo && !(link.contentId === null && chainFire.hold);
    const c = caught.current;
    if (on !== c.on) {
      c.on = on;
      c.at = now;
    }
    const age = now - c.at;
    const flare = on ? Math.max(0, 1 - age / 1.4) : 0;
    if (fire.current) {
      // one frustum per frame, shared by every pyre
      if (frustumAt !== now) {
        frustumAt = now;
        camera.updateMatrixWorld();
        _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        _frustum.setFromProjectionMatrix(_pm);
      }
      _sphere.center.set(link.x, g.position.y + 45, link.z);
      const dist = camera.position.distanceTo(_sphere.center);
      fire.current.visible = on && dist < FIRE_FAR && _frustum.intersectsSphere(_sphere);
      if (plumes.current) plumes.current.visible = dist < PLUME_FAR;
      // the flames leap up out of the pyre rather than appearing whole
      fire.current.scale.y = 0.3 + 0.7 * Math.min(1, age / 0.6);
    }
    const f2 = flare * flare;
    flame.uniforms.uTime.value = now;
    flame.uniforms.uFade.value = morph.value;
    flame.uniforms.uHot.value = 1 + 1.4 * f2;
    flame.uniforms.uH.value = 19 * (1 + 0.7 * f2);
    glow.uniforms.uTime.value = now;
    glow.uniforms.uIntensity.value = morph.value * (1 + 2.2 * f2);
    glow.uniforms.uSize.value = 18 * (1 + 0.8 * f2);
    if (light.current) {
      const target = on ? 140 + Math.sin(now * 11) * 30 + Math.sin(now * 23) * 18 + 380 * flare : 0;
      light.current.intensity += (target - light.current.intensity) * Math.min(1, 12 * dt);
    }
  });

  return (
    <group ref={group} position={[link.x, 0, link.z]}>
      <mesh geometry={ground} material={k.stone} castShadow receiveShadow />
      <mesh geometry={k.logs} material={k.wood} castShadow />
      {lit && (
        <group ref={fire} visible={false}>
          <group ref={plumes}>
            <Plume position={[0, 2, 0]} color="#ff8a2e" count={90} spread={3.2} height={30} size={4.2} rise={16} opacity={0.85} />
            <Plume position={[0, 11.6, 0]} color="#2e2420" count={50} spread={4.4} height={100} size={6} rise={9} additive={false} opacity={0.3} />
          </group>
          {/* billboards size themselves in the shader: never cull them by the unit quad */}
          <mesh geometry={k.quad} material={flame} position={[0, 0.3, 0]} frustumCulled={false} renderOrder={2} />
          <mesh geometry={k.quad} material={glow} position={[0, 4.8, 0]} frustumCulled={false} renderOrder={3} />
        </group>
      )}
      {/* only the player's beacons cast light: every point light costs every lit surface */}
      {link.contentId !== null && (
        <pointLight ref={light} color="#ff9a3e" intensity={0} distance={140} position={[0, 5.8, 0]} decay={1.8} />
      )}
    </group>
  );
}

export function Beacons() {
  const beacons = useContent((c) => c.beacons);
  const lit = useGame((s) => s.beacons);
  const chain = useMemo(() => beaconChain(beacons), [beacons]);
  const k = useMemo(() => pyreKit(), []);
  const all = allBeaconsLit(lit, beacons);
  return (
    <group>
      {chain.map((l, i) => (
        <BeaconPyre key={l.key} link={l} index={i} k={k} lit={l.contentId === null ? all : !!lit[l.contentId]} />
      ))}
    </group>
  );
}
