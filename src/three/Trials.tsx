"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { toWorldX, toWorldZ } from "@/data/content";
import { content } from "@/state/content";
import { game } from "@/state/store";
import { runtime } from "@/game/runtime";
import { reducedMotion } from "@/game/prefs";
import { audio } from "@/audio/engine";
import { steedFrozen } from "@/three/flight";
import {
  COURSES, GATE_R, FLOAT_NEAR, FLOAT_MAX, FLOAT_RATE,
  bestKey, courseGates, startPose, crossedGate, medalFor, useTrial, trialLive, type Gate,
} from "@/game/trials";

const MAX_GATES = 14;
const COUNTDOWN = 3; // seconds of 3-2-1
const FLARE = 0.5; // a passed ring flares out over this long
const FADE = 0.6; // the course fades away this long after a finish or an abort
const BEAM_H = 380;
// a region within this of the start or the finish must not open its tale the
// moment the course is over (flight.ts releases it again at 200)
const REGION_HOLD = 200;

// HDR gold: past 1.0 so the bloom pass catches the rings (HIGH); on LOW the
// renderer's ACES curve rolls it back to gold instead of clipping to white
const GOLD = new THREE.Color("#ffbf52").multiplyScalar(2);
const HALO = new THREE.Color("#ffcf7a");

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _fwd = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Soft light hugging each ring, in the ring's own plane (additive). */
const haloShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vTint;
    void main() {
      vUv = uv - 0.5;
      #ifdef USE_INSTANCING_COLOR
        vTint = instanceColor;
      #else
        vTint = vec3(1.0);
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vTint;
    uniform float uRing;
    void main() {
      float r = length(vUv) * 2.0;
      float d = (r - uRing) / 0.12;
      float band = exp(-d * d);
      float veil = 0.08 * smoothstep(uRing, 0.0, r); // the faint skin across the gate
      float a = (band * 0.75 + veil) * smoothstep(1.0, 0.86, r);
      gl_FragColor = vec4(vTint * a, 1.0); // premultiplied: alpha-weighted additive would square the falloff
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

/** A pillar of light over the next gate, seen from far off and over ridges. */
const beamShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform vec3 uColor;
    uniform float uOpacity;
    void main() {
      float x = (vUv.x - 0.5) * 2.0;
      float a = exp(-x * x * 7.0) * smoothstep(0.0, 0.06, vUv.y) * pow(1.0 - vUv.y, 1.8) * uOpacity;
      gl_FragColor = vec4(uColor * a, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

/** Hand the camera back to the chase rig, if the trial holds it. */
function releaseCamera() {
  if (runtime.director.owner === "trial") runtime.director.owner = null;
}

const FRAME_FOV = 60;
const FRAME_TAN = Math.tan(THREE.MathUtils.degToRad(FRAME_FOV / 2));

/**
 * Through the countdown the camera stands back over the steed's shoulder and
 * looks on toward the first gate — which may hang on a crest far above the
 * chase camera's view. The pitch puts the gate a little above the middle of
 * the frame (below the timer and the weather caption), unless that would drop
 * the steed out of the bottom. The first frame cuts there; later ones hold it.
 * If photo mode or a cinematic takes the camera meanwhile, the framing is
 * given up for this run: they hand it back in their own time (photo mode
 * winds the clock back after the camera) and must not find it taken again.
 */
function frameFirstGate(r: Run) {
  const d = runtime.director;
  if (d.owner !== null && d.owner !== "trial") r.framing = false;
  if (!r.framing) return;
  const g = r.gates[0];
  const fx = Math.cos(r.start.heading);
  const fz = Math.sin(r.start.heading);
  const p = runtime.pos;
  d.owner = "trial";
  d.eye.set(p.x - fx * 58, p.y + 18, p.z - fz * 58);
  const toGate = Math.atan2(g.y - d.eye.y, Math.hypot(g.x - d.eye.x, g.z - d.eye.z));
  const toSteed = Math.atan2(p.y - d.eye.y, 58);
  const pitch = Math.min(toGate - Math.atan(0.2 * FRAME_TAN), toSteed + Math.atan(0.8 * FRAME_TAN));
  d.look.set(d.eye.x + fx * Math.cos(pitch) * 60, d.eye.y + Math.sin(pitch) * 60, d.eye.z + fz * Math.cos(pitch) * 60);
  d.fov = FRAME_FOV;
  d.stiffness = r.snap ? Infinity : 3;
  d.roll = 0;
  r.snap = false;
}

/** Hold off the tale of a region the steed is in, as a course starts or ends there. */
function holdNearbyRegion(x: number, z: number) {
  const near = content().regions.find((g) => Math.hypot(toWorldX(g.x) - x, toWorldZ(g.y) - z) < REGION_HOLD);
  if (near) runtime.cooldown = near.id;
}

interface Run {
  id: string | null;
  run: number; // the store's trialRun this course was started as — a new number restarts it
  gates: Gate[];
  baseY: number[];
  passedAt: number[]; // clock time each gate was flown, -1 before
  next: number;
  phase: "countdown" | "racing";
  t: number; // countdown, then race clock (paused whenever the steed is held)
  count: number;
  start: { x: number; z: number; heading: number };
  fade: number; // 1 while flown, easing to 0 once over
  snap: boolean; // the next framing cuts rather than eases
  framing: boolean; // the countdown still holds the camera on the first gate
}

/** Flight-trial ring courses: the rings, gate detection and timing. */
export function Trials() {
  const parts = useMemo(() => {
    const ringGeo = new THREE.TorusGeometry(GATE_R, 0.8, 10, 72);
    const ringMat = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    const rings = new THREE.InstancedMesh(ringGeo, ringMat, MAX_GATES);

    const haloGeo = new THREE.PlaneGeometry(GATE_R * 3, GATE_R * 3);
    const haloMat = new THREE.ShaderMaterial({
      ...haloShader,
      uniforms: { uRing: { value: 2 / 3 } }, // ring radius as a fraction of the half-size
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const halos = new THREE.InstancedMesh(haloGeo, haloMat, MAX_GATES);

    for (const m of [rings, halos]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, _c.setRGB(0, 0, 0)); // allocates instanceColor before the first compile
      m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; // a course spans hundreds of units; three draws, no culling needed
      m.count = 0;
    }

    const beamGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const beamMat = new THREE.ShaderMaterial({
      ...beamShader,
      uniforms: { uColor: { value: new THREE.Color("#ffd68a").multiplyScalar(1.6) }, uOpacity: { value: 0 } },
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.scale.set(9, BEAM_H, 1);
    beam.frustumCulled = false;

    const group = new THREE.Group();
    group.add(halos, rings, beam);
    group.visible = false;
    return {
      group, rings, halos, beam, beamMat,
      instanced: [rings, halos],
      disposables: [rings, halos, ringGeo, ringMat, haloGeo, haloMat, beamGeo, beamMat],
    };
  }, []);

  useEffect(() => () => {
    for (const d of parts.disposables) d.dispose();
  }, [parts]);

  const run = useRef<Run>({
    id: null, run: 0, gates: [], baseY: [], passedAt: [], next: 0, phase: "countdown",
    t: 0, count: 0, start: { x: 0, z: 0, heading: 0 }, fade: 0, snap: false, framing: false,
  });
  const prev = useRef(new THREE.Vector3());
  const motion = useRef(1); // 0 for visitors who asked for less motion: no ring pulse or flare swell

  useEffect(() => {
    motion.current = reducedMotion() ? 0 : 1;
    // leaving the scene mid-course: give the camera back, drop the HUD state
    return () => {
      releaseCamera();
      useTrial.setState({ phase: "idle" });
    };
  }, []);

  useFrame(({ camera, clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05); // the steeds clamp the same way, so the clock keeps their time
    const now = clock.elapsedTime;
    const s = game();
    const r = run.current;

    // started, restarted (every startTrial bumps trialRun — FLY on the course
    // being flown starts it over), switched, or abandoned (activeTrial cleared)
    if (s.activeTrial !== r.id || (r.id && s.trialRun !== r.run)) {
      if (r.id) {
        r.id = null;
        releaseCamera();
        useTrial.setState({ phase: "idle" });
      }
      const course = COURSES.find((c) => c.id === s.activeTrial);
      if (course) {
        r.id = course.id;
        r.run = s.trialRun;
        // the built gates are shared; each run floats its own copies
        r.gates = courseGates(course).slice(0, MAX_GATES).map((g) => ({ ...g }));
        r.baseY = r.gates.map((g) => g.y);
        r.passedAt = r.gates.map(() => -1);
        r.next = 0;
        r.phase = "countdown";
        r.t = 0;
        r.count = 0;
        r.fade = 1;
        const p = startPose(course);
        r.start = p;
        runtime.pos.set(p.x, p.y, p.z);
        runtime.vel.set(0, 0, 0);
        runtime.speed = 0;
        runtime.heading = p.heading;
        runtime.bank = 0;
        runtime.autoTarget = null;
        prev.current.copy(runtime.pos);
        holdNearbyRegion(p.x, p.z);
        r.snap = true; // cut straight to the start line, no sweep across the map
        r.framing = true;
        trialLive.elapsed = 0;
        trialLive.guide = false;
        parts.rings.count = parts.halos.count = r.gates.length;
        useTrial.setState({ phase: "countdown", count: 3, passed: 0, total: r.gates.length, result: null });
      }
    }

    if (r.id) {
      const frozen = steedFrozen(s);
      if (r.phase === "countdown") {
        // held on the start line, nose on the first gate, until the cry
        runtime.pos.x = r.start.x;
        runtime.pos.z = r.start.z;
        runtime.vel.x = runtime.vel.z = 0;
        runtime.speed = 0;
        runtime.heading = r.start.heading;
        runtime.bank = 0;
        frameFirstGate(r);
        if (!frozen) r.t += dt;
        const n = Math.max(0, Math.ceil(COUNTDOWN - r.t));
        if (n !== r.count) {
          r.count = n;
          if (n > 0) {
            audio.sfx("tick");
            useTrial.setState({ count: n });
          } else {
            audio.sfx("chime");
            r.phase = "racing";
            r.t = 0;
            releaseCamera(); // the chase rig eases back in from the framing
            useTrial.setState({ phase: "racing", goAt: performance.now() });
          }
        }
      } else {
        // the clock stops while a book, the raven or photo mode holds the
        // steed — but only once it has stopped: a held steed still coasts to
        // rest, and that ground must be paid for, or a pause would gain time
        if (!frozen || runtime.speed > 1) r.t += dt;
        trialLive.elapsed = r.t;
        const g = r.gates[r.next];
        // the rider cannot choose an altitude, so the next ring rises or sinks
        // a little to meet the steed on the approach — never into the land
        if (Math.hypot(g.x - runtime.pos.x, g.z - runtime.pos.z) < FLOAT_NEAR) {
          const base = r.baseY[r.next];
          const want = THREE.MathUtils.clamp(runtime.pos.y, Math.max(base - FLOAT_MAX, g.floor), base + FLOAT_MAX);
          g.y += (want - g.y) * Math.min(1, FLOAT_RATE * dt);
        }
        const a = prev.current;
        const b = runtime.pos;
        if (crossedGate(a.x, a.y, a.z, b.x, b.y, b.z, g)) {
          r.passedAt[r.next] = now;
          r.next++;
          audio.sfx("collect");
          if (r.next < r.gates.length) useTrial.setState({ passed: r.next });
          else {
            // home: the store keeps the steed's best; the card reads the result
            const course = COURSES.find((c) => c.id === r.id)!;
            const time = r.t;
            const steed = s.mount; // fixed for the run — the store refuses a change mid-course
            audio.sfx("chime");
            r.id = null; // before endTrial, so the store's null is not read as an abort
            trialLive.guide = false;
            holdNearbyRegion(runtime.pos.x, runtime.pos.z);
            useTrial.setState({
              phase: "idle",
              passed: r.next,
              result: { course: course.id, steed, time, medal: medalFor(course, steed, time), prev: s.trialBest[bestKey(course.id, steed)] },
            });
            s.endTrial(time);
          }
        }
      }
      prev.current.copy(runtime.pos);
    }

    // ── draw ──
    if (!r.id) r.fade = Math.max(0, r.fade - dt / FADE);
    const live = r.fade > 0 && r.gates.length > 0;
    parts.group.visible = live;
    if (!live) return;

    const pulse = Math.sin(now * 5.5);
    const swell = motion.current;
    for (let i = 0; i < r.gates.length; i++) {
      const g = r.gates[i];
      let glow: number;
      let scale = 1;
      if (r.passedAt[i] >= 0) {
        // a soft flare, gone before the chase camera flies through the ring
        // (close up, a full-brightness ring fills a phone screen)
        const k = (now - r.passedAt[i]) / FLARE;
        const near = camera.position.distanceTo(_p.set(g.x, g.y, g.z));
        glow = k < 1 ? 0.75 * (1 - k) * (1 - k) * THREE.MathUtils.smoothstep(near, 12, 55) : 0;
        scale = 1 + 0.25 * Math.min(k, 1) * (2 - Math.min(k, 1)) * swell;
      } else if (i === r.next) {
        glow = 1.15 + 0.35 * pulse;
        scale = 1 + 0.035 * pulse * swell;
      } else if (i === r.next + 1) glow = 0.5;
      else glow = 0.16;
      glow *= r.fade;
      // the torus and the halo lie in the gate's plane: local +Z onto the facing
      _q.setFromAxisAngle(UP, Math.atan2(g.nx, g.nz));
      _m.compose(_p.set(g.x, g.y, g.z), _q, _s.setScalar(scale));
      parts.rings.setMatrixAt(i, _m);
      parts.halos.setMatrixAt(i, _m);
      parts.rings.setColorAt(i, _c.copy(GOLD).multiplyScalar(glow));
      parts.halos.setColorAt(i, _c.copy(HALO).multiplyScalar(Math.min(glow, 1.2) * 0.7));
    }
    for (const m of parts.instanced) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.needsUpdate = true;
    }

    // beam and off-screen guide toward the next gate
    const g = r.id ? r.gates[r.next] : undefined;
    if (g) {
      const d = Math.hypot(g.x - runtime.pos.x, g.z - runtime.pos.z);
      parts.beam.position.set(g.x, g.y + GATE_R, g.z);
      parts.beam.rotation.y = Math.atan2(camera.position.x - g.x, camera.position.z - g.z);
      // fades as the ring itself takes over, close in
      parts.beamMat.uniforms.uOpacity.value = THREE.MathUtils.smoothstep(d, 80, 240) * (0.75 + 0.25 * pulse);
      // the rider only ever steers left and right, so the guide reads the
      // bearing in the ground plane: shown once the gate is out of view to a
      // side or behind (a gate merely above the view needs no steering)
      camera.getWorldDirection(_fwd);
      const vx = g.x - camera.position.x;
      const vz = g.z - camera.position.z;
      const bearing = Math.atan2(vx * -_fwd.z + vz * _fwd.x, vx * _fwd.x + vz * _fwd.z);
      const cam = camera as THREE.PerspectiveCamera;
      const halfH = Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect);
      trialLive.guide = Math.abs(bearing) > halfH * 0.9;
      trialLive.angle = bearing;
    } else {
      parts.beamMat.uniforms.uOpacity.value = 0;
      trialLive.guide = false;
    }
  });

  return <primitive object={parts.group} />;
}
