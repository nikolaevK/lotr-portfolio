"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { create } from "zustand";
import { MAP_W, MAP_H, SITES, toWorldX, toWorldZ } from "@/data/content";
import { runtime } from "@/game/runtime";
import { input, moveAxes } from "@/input/controls";
import { useGame } from "@/state/store";
import { morph } from "@/three/Terrain";
import { heightAt } from "@/three/noise";
import { solidAt } from "@/three/obstacles";

/* ── looks ───────────────────────────────────────────────────────────────── */

export type FilterFn = "sepia" | "saturate" | "contrast" | "brightness" | "grayscale";

/** A finishing look: CSS filter functions in order (the live canvas shows
 *  them; the postcard repeats the same maths on its pixels) and an optional
 *  colour washed over the frame with soft-light blending. */
export interface Look {
  id: string;
  label: string;
  filter: [FilterFn, number][];
  tint?: { color: string; alpha: number };
}

export const LOOKS: Look[] = [
  { id: "none", label: "As Seen", filter: [] },
  { id: "parchment", label: "Parchment", filter: [["sepia", 0.6], ["saturate", 0.85], ["contrast", 1.06], ["brightness", 1.04]] },
  {
    id: "twilight",
    label: "Twilight",
    filter: [["saturate", 0.7], ["brightness", 0.86], ["contrast", 1.12]],
    tint: { color: "#2b3f8f", alpha: 0.8 },
  },
  { id: "noir", label: "Noir", filter: [["grayscale", 1], ["contrast", 1.18], ["brightness", 1.02], ["sepia", 0.12]] },
];

export const lookById = (id: string) => LOOKS.find((l) => l.id === id) ?? LOOKS[0];
export const cssFilter = (look: Look) => look.filter.map(([f, v]) => `${f}(${v})`).join(" ");

/* ── settings shared with the bar (outside the Canvas) ───────────────────── */

export type CamMode = "orbit" | "free";

interface PhotoSettings {
  mode: CamMode;
  fov: number; // degrees
  roll: number; // degrees, the dutch tilt
  hour: number; // 0..24 — what the Hour dial shows; it writes runtime.dayLock
  look: string;
  hidden: boolean; // the bar folded away for a clean frame
}

export const usePhoto = create<PhotoSettings>(() => ({
  mode: "orbit",
  fov: 55,
  roll: 0,
  hour: 10,
  look: "none",
  hidden: false,
}));

/* ── capture ─────────────────────────────────────────────────────────────── */

// captures waiting for the next frame; every one is served from it
const waiting: ((frame: HTMLCanvasElement | null) => void)[] = [];
let wake: (() => void) | null = null;

/** The next rendered frame, exactly as the camera drew it (post stack
 *  included), copied onto a 2D canvas the caller owns. */
export function captureFrame(): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    if (!wake) return reject(new Error("photo mode is not running"));
    waiting.push((frame) => (frame ? resolve(frame) : reject(new Error("the frame could not be copied"))));
    wake();
  });
}

/** The GL canvas's current drawing buffer, flattened onto a new 2D canvas. */
function copyFrame(src: HTMLCanvasElement) {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  // the page colour behind it: the GL canvas carries an alpha channel
  ctx.fillStyle = "#0e0a06";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0);
  return out;
}

/**
 * Mounted (keyed per request) for the frames of a capture. The drawing buffer
 * is not preserved, so it must be read in the frame it was drawn: this
 * subscriber runs at priority 2, after the post composer (priority 1). R3F
 * skips its own render while any subscriber holds a priority — when ours is
 * the only one (LOW detail, no composer) nobody drew this frame, so draw it.
 */
function Shutter({ onServed }: { onServed: () => void }) {
  const served = useRef(false);
  useFrame(({ gl, scene, camera, internal }) => {
    if (internal.priority === 1) gl.render(scene, camera);
    if (served.current) return; // until React unmounts us, keep the frames coming
    served.current = true;
    for (const cb of waiting.splice(0)) cb(copyFrame(gl.domElement));
    onServed();
  }, 2);
  return null;
}

/* ── the camera ──────────────────────────────────────────────────────────── */

const OWNER = "photo";
// director stiffness: this file does the smoothing, so the rig just follows.
// Finite, not Infinity — the rig's 1 - exp(-k·dt) is NaN for Infinity × 0
const SNAP = 1000;
const ORBIT_K = 12; // 1/s — orbit angles/distance catching up with the drag
const LOOK_K = 18; // 1/s — free-fly look
const LENS_K = 10; // 1/s — field of view and tilt
const PITCH_MIN = -0.3;
const PITCH_MAX = 1.45;
const DIST_MIN = 7;
const DIST_MAX = 340;
const FREE_SPEED = 45; // units/s; Shift ×4
const CLEARANCE = 9; // above the land — one more than CameraRig's backstop
// the eye keeps this far inside the map: past it lie the terrain slab's cut
// side and the void beyond (pushed back softly, so it never jolts)
const INSET = 240;
const CEILING = 1200; // free-fly height: room for a map-wide view
// how deep a band of that void may show under the horizon — about what the
// chase camera itself shows at the steed's edge of the world
const VOID_OK = THREE.MathUtils.degToRad(15);
const BLEND_S = 0.7; // seconds to swing the view onto a new aim

const rig = {
  mode: "orbit" as CamMode,
  eye: new THREE.Vector3(),
  dir: new THREE.Vector3(0, 0, -1), // the view direction actually shown
  fromDir: new THREE.Vector3(), // view direction when a swing began
  blend: 1, // 0→1 progress of that swing
  focus: 100, // distance from eye to the look point
  // orbit around the steed: smoothed values and their goals
  yaw: 0,
  pitch: 0,
  dist: 40,
  yawT: 0,
  pitchT: 0,
  distT: 40,
  // free fly
  lookYaw: 0,
  lookPitch: 0,
  lookYawT: 0,
  lookPitchT: 0,
  vel: new THREE.Vector3(),
  push: new THREE.Vector3(), // touch/wheel nudges, eased in over a few frames
  fence: new THREE.Vector3(), // orbit: the eased push back inside the inset
  cam: null as THREE.PerspectiveCamera | null,
  fov: 55,
  roll: 0,
  day0: 0, // the hour photo mode found; the clock winds back to it on exit
  live: false, // set up for this session (the store flips a frame or two before effects run)
  releasing: false, // photo mode closed; levelling the tilt and winding back the clock
};

const _target = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _right = new THREE.Vector3();
const _goalVel = new THREE.Vector3();
const _gap = new THREE.Vector3();
const _site = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const ease = (k: number, dt: number) => 1 - Math.exp(-k * dt);
const clamp = THREE.MathUtils.clamp;

function groundAt(x: number, z: number) {
  return solidAt(clamp(x, 0, MAP_W), clamp(z, 0, MAP_H)) * morph.value;
}

/** How far (in x/z) the eye must move to be back inside the inset. */
function fenceGap(eye: THREE.Vector3) {
  return _gap.set(clamp(eye.x, INSET, MAP_W - INSET) - eye.x, 0, clamp(eye.z, INSET, MAP_H - INSET) - eye.z);
}

/** Distance along (dx, dz) from inside the map out to its edge. */
function toEdge(x: number, z: number, dx: number, dz: number) {
  const tx = dx > 0 ? (MAP_W - x) / dx : dx < 0 ? -x / dx : Infinity;
  const tz = dz > 0 ? (MAP_H - z) / dz : dz < 0 ? -z / dz : Infinity;
  return Math.min(tx, tz);
}

/**
 * The highest the free camera may look. Facing out over a near edge from
 * high up, everything between the edge and the horizon is void — a beige
 * wall. The band's depth is the edge's depression angle; beyond VOID_OK the
 * view is tipped down until only that much of it is left in frame.
 */
function pitchCeiling(cam: THREE.PerspectiveCamera) {
  const half = THREE.MathUtils.degToRad(cam.fov) / 2;
  const halfW = Math.atan(Math.tan(half) * cam.aspect);
  let out = Infinity;
  // the frame's centre line and both its sides
  for (let side = -1; side <= 1; side++) {
    const yaw = rig.lookYaw + side * halfW;
    out = Math.min(out, toEdge(rig.eye.x, rig.eye.z, Math.cos(yaw), Math.sin(yaw)));
  }
  const band = Math.atan2(rig.eye.y, out);
  return band > VOID_OK ? VOID_OK - band - half : Infinity;
}

/** The steed, a little above its back. */
function orbitTarget(out: THREE.Vector3) {
  return out.copy(runtime.pos).setY(runtime.pos.y + 2.5);
}

/** Orbit from wherever the eye is now — the view then swings onto the steed. */
function beginOrbit() {
  const off = _aim.subVectors(rig.eye, orbitTarget(_target));
  rig.dist = Math.max(off.length(), 0.01);
  rig.pitch = Math.asin(clamp(off.y / rig.dist, -1, 1));
  rig.yaw = Math.atan2(off.z, off.x);
  rig.yawT = rig.yaw;
  rig.pitchT = clamp(rig.pitch, PITCH_MIN, PITCH_MAX);
  rig.distT = clamp(rig.dist, DIST_MIN, DIST_MAX);
  rig.fence.set(0, 0, 0);
  rig.fromDir.copy(rig.dir);
  rig.blend = 0;
  rig.mode = "orbit";
}

/** Free fly from the current pose, looking where the camera already looks. */
function beginFree() {
  rig.lookYaw = rig.lookYawT = Math.atan2(rig.dir.z, rig.dir.x);
  rig.lookPitch = rig.lookPitchT = Math.asin(clamp(rig.dir.y, -1, 1));
  rig.vel.set(0, 0, 0);
  rig.push.set(0, 0, 0);
  rig.blend = 1;
  rig.mode = "free";
}

/** The landmark filling most of the frame — apparent size, weighted toward
 *  the centre — if any is prominent enough to be what the shot is of. */
function siteInView(): { x: number; z: number } | null {
  if (!rig.cam) return null;
  let best: { x: number; z: number } | null = null;
  let bestScore = 0.08; // radius / distance
  for (const s of Object.values(SITES)) {
    const x = toWorldX(s.u);
    const z = toWorldZ(s.v);
    // half-way up whatever stands there
    _site.set(x, (heightAt(x, z) + solidAt(x, z)) / 2, z);
    const d = _site.distanceTo(rig.eye);
    _site.project(rig.cam);
    if (_site.z > 1 || Math.abs(_site.x) > 1 || Math.abs(_site.y) > 1) continue; // behind us or out of frame
    const score = (s.r / d) * (1 - 0.5 * Math.min(1, Math.hypot(_site.x, _site.y)));
    if (score > bestScore) {
      bestScore = score;
      best = { x, z };
    }
  }
  return best;
}

/** Where the shot is "of" — a landmark in view, else the steed when
 *  orbiting or the land the free camera looks at — and the view's compass
 *  bearing (radians from north). */
export function photoSubject(): { x: number; z: number; bearing: number } {
  const bearing = Math.atan2(rig.dir.x, -rig.dir.z);
  const site = siteInView();
  if (site) return { ...site, bearing };
  if (rig.mode === "orbit") return { x: runtime.pos.x, z: runtime.pos.z, bearing };
  // only nearby land: a ray grazing the far horizon would name the wrong country
  for (let t = 20; t < 700; t += 20) {
    const x = rig.eye.x + rig.dir.x * t;
    const z = rig.eye.z + rig.dir.z * t;
    if (x < 0 || x > MAP_W || z < 0 || z > MAP_H) break;
    if (rig.eye.y + rig.dir.y * t <= heightAt(x, z)) return { x, z, bearing };
  }
  return { x: rig.eye.x, z: rig.eye.z, bearing };
}

/** Drag/pinch/wheel on the canvas: orbit and zoom, or look and fly. A tap
 *  brings a hidden bar back. */
function attachPointers(el: HTMLElement, camera: THREE.PerspectiveCamera) {
  const pts = new Map<number, { x: number; y: number }>();
  let lastX = 0;
  let lastY = 0;
  let spread = 0;
  let tap: { id: number; x: number; y: number; t: number } | null = null;

  const centroid = () => {
    let x = 0;
    let y = 0;
    for (const p of pts.values()) {
      x += p.x;
      y += p.y;
    }
    return { x: x / pts.size, y: y / pts.size };
  };
  const spreadOf = () => {
    if (pts.size < 2) return 0;
    const [a, b] = [...pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  // whenever a finger lands or lifts, measure the next move from here
  const rebase = () => {
    if (pts.size > 0) {
      const c = centroid();
      lastX = c.x;
      lastY = c.y;
    }
    spread = spreadOf();
  };

  const down = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // the pointer is already gone; removal below keeps the map honest
    }
    tap = pts.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() } : null;
    rebase();
  };

  const move = (e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap = null;
    const c = centroid();
    const dx = c.x - lastX;
    const dy = c.y - lastY;
    lastX = c.x;
    lastY = c.y;
    const s = spreadOf();
    const pinch = spread > 0 && s > 0 ? s / spread : 1; // > 1: fingers apart
    spread = s;

    if (rig.mode === "orbit") {
      // grab the world: drag right and the steed turns to show its left side
      const k = 4.4 / Math.max(el.clientWidth, el.clientHeight);
      rig.yawT += dx * k;
      rig.pitchT = clamp(rig.pitchT + dy * k, PITCH_MIN, PITCH_MAX);
      rig.distT = clamp(rig.distT / pinch, DIST_MIN, DIST_MAX);
    } else if (pts.size === 1) {
      // grab the scene: the point under the finger stays under the finger
      const k = THREE.MathUtils.degToRad(camera.fov) / el.clientHeight;
      rig.lookYawT -= dx * k;
      rig.lookPitchT = clamp(rig.lookPitchT + dy * k, -1.5, 1.5);
    } else {
      // two fingers slide the camera across the view; the pinch carries it along it
      _right.set(-Math.sin(rig.lookYaw), 0, Math.cos(rig.lookYaw));
      rig.push.addScaledVector(_right, -dx * 0.4).addScaledVector(UP, dy * 0.4);
      rig.push.addScaledVector(rig.dir, (pinch - 1) * 140);
    }
  };

  const release = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    if (e.type === "pointerup" && tap?.id === e.pointerId && performance.now() - tap.t < 350) {
      usePhoto.setState({ hidden: false });
    }
    tap = null;
    pts.delete(e.pointerId);
    rebase();
  };

  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    if (rig.mode === "orbit") rig.distT = clamp(rig.distT * Math.exp(e.deltaY * 0.0012), DIST_MIN, DIST_MAX);
    else rig.push.addScaledVector(rig.dir, -e.deltaY * 0.25);
  };

  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  el.addEventListener("lostpointercapture", release);
  el.addEventListener("wheel", wheel, { passive: false });
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", release);
    el.removeEventListener("pointercancel", release);
    el.removeEventListener("lostpointercapture", release);
    el.removeEventListener("wheel", wheel);
  };
}

/** Photo mode's camera, written through runtime.director: orbit the steed or
 *  fly free, with lens, tilt, hour and look from the bar. */
export function PhotoMode() {
  const active = useGame((s) => s.photoMode);
  const look = usePhoto((s) => s.look);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const setEvents = useThree((s) => s.setEvents);
  // capture requests taken / served: a new request re-keys the Shutter, so a
  // second capture before React unmounts the first still gets a fresh one
  const [ticket, setTicket] = useState(0);
  const [served, setServed] = useState(0);

  // the bar lives outside the Canvas; this is its way in
  useEffect(() => {
    wake = () => setTicket((t) => t + 1);
    return () => {
      wake = null;
      for (const cb of waiting.splice(0)) cb(null);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    // start exactly where the camera is, so entering never jumps
    rig.cam = camera;
    rig.eye.copy(camera.position);
    camera.getWorldDirection(rig.dir);
    rig.fov = camera.fov;
    // the chase camera banks with the steed: read that roll back off the camera
    const rightY = _right.set(1, 0, 0).applyQuaternion(camera.quaternion).y;
    rig.roll = Math.asin(clamp(rightY / Math.max(Math.hypot(rig.dir.x, rig.dir.z), 1e-3), -1, 1));
    // the hour holds still while a shot is composed (and the dial tells the truth)
    // (back in before the clock finished winding back: it still owes the first hour)
    if (!rig.releasing) rig.day0 = runtime.dayTime;
    runtime.dayLock = runtime.dayTime;
    rig.releasing = false;
    rig.live = true;
    beginOrbit();
    // every session opens on the steed; the chosen look carries over
    usePhoto.setState({ mode: "orbit", fov: Math.round(camera.fov), roll: 0, hour: runtime.dayTime * 24, hidden: false });
    // the markers would take a drag's release for a click and start the autopilot
    setEvents({ enabled: false });
    const off = attachPointers(gl.domElement, camera);
    return () => {
      off();
      setEvents({ enabled: true });
      rig.live = false;
      rig.releasing = true; // the frame loop hands back the camera and the clock
    };
  }, [active, camera, gl, setEvents]);

  // the look on the live canvas (its tint layer is drawn by the bar)
  useEffect(() => {
    if (!active) return;
    const el = gl.domElement;
    el.style.filter = cssFilter(lookById(look));
    return () => {
      el.style.filter = "";
    };
  }, [active, look, gl]);

  // never leave the camera or the clock held if the scene itself goes away
  useEffect(
    () => () => {
      if (runtime.director.owner === OWNER) runtime.director.owner = null;
      if (rig.live || rig.releasing) runtime.dayLock = null;
      rig.live = rig.releasing = false;
    },
    [],
  );

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const dir = runtime.director;

    if (!rig.live) {
      if (!rig.releasing) return;
      // a cinematic took over straight from us: the camera and the clock are
      // its now. Anyone else (a trial's countdown) takes only the camera —
      // the clock still winds back, or the sky would stay pinned
      if (dir.owner === "cinematic") {
        rig.releasing = false;
        return;
      }
      let done = true;
      if (dir.owner === OWNER) {
        // level the horizon before the chase camera takes over, or it snaps
        rig.roll -= rig.roll * ease(LENS_K * 1.5, dt);
        dir.roll = rig.roll;
        if (Math.abs(rig.roll) < 0.004) dir.owner = null;
        else done = false;
      }
      if (runtime.dayLock !== null) {
        // wind the sky back (the short way round the clock) to the hour photo
        // mode found — at once if the dial never moved — then let the day run on
        let d = rig.day0 - runtime.dayLock;
        d -= Math.round(d);
        if (Math.abs(d) < 0.001) runtime.dayLock = null;
        else {
          runtime.dayLock = (runtime.dayLock + d * ease(3, dt) + 1) % 1;
          done = false;
        }
      }
      rig.releasing = !done;
      return;
    }

    const p = usePhoto.getState();
    if (p.mode !== rig.mode) {
      if (p.mode === "orbit") beginOrbit();
      else beginFree();
    }
    const axes = moveAxes();
    const fast = input.boost ? 3 : 1;

    if (rig.mode === "orbit") {
      // keys nudge the orbit too: A D circle, W S draw near / back off, Q E sink / rise
      rig.yawT -= axes.x * 1.5 * fast * dt;
      rig.pitchT = clamp(rig.pitchT + input.rise * 1.0 * fast * dt, PITCH_MIN, PITCH_MAX);
      rig.distT = clamp(rig.distT * Math.exp(axes.y * 1.3 * fast * dt), DIST_MIN, DIST_MAX);
      const k = ease(ORBIT_K, dt);
      rig.yaw += (rig.yawT - rig.yaw) * k;
      rig.pitch += (rig.pitchT - rig.pitch) * k;
      rig.dist += (rig.distT - rig.dist) * k;
      orbitTarget(_target);
      const cp = Math.cos(rig.pitch);
      rig.eye.set(
        _target.x + Math.cos(rig.yaw) * cp * rig.dist,
        _target.y + Math.sin(rig.pitch) * rig.dist,
        _target.z + Math.sin(rig.yaw) * cp * rig.dist,
      );
      rig.fence.lerp(fenceGap(rig.eye), ease(8, dt));
      rig.eye.add(rig.fence);
      rig.eye.y = Math.max(rig.eye.y, groundAt(rig.eye.x, rig.eye.z) + CLEARANCE);
      _aim.subVectors(_target, rig.eye);
      rig.focus = Math.max(_aim.length(), 0.01);
      _aim.divideScalar(rig.focus);
    } else {
      const k = ease(LOOK_K, dt);
      rig.lookYaw += (rig.lookYawT - rig.lookYaw) * k;
      if (rig.cam) rig.lookPitchT = Math.min(rig.lookPitchT, pitchCeiling(rig.cam));
      rig.lookPitch += (rig.lookPitchT - rig.lookPitch) * k;
      const cp = Math.cos(rig.lookPitch);
      _aim.set(Math.cos(rig.lookYaw) * cp, Math.sin(rig.lookPitch), Math.sin(rig.lookYaw) * cp);
      _right.set(-Math.sin(rig.lookYaw), 0, Math.cos(rig.lookYaw));
      const speed = FREE_SPEED * (input.boost ? 4 : 1);
      _goalVel
        .copy(_aim)
        .multiplyScalar(-axes.y * speed) // W is −1
        .addScaledVector(_right, axes.x * speed)
        .addScaledVector(UP, input.rise * speed);
      rig.vel.lerp(_goalVel, ease(6, dt));
      rig.eye.addScaledVector(rig.vel, dt);
      const kp = ease(10, dt);
      rig.eye.addScaledVector(rig.push, kp);
      rig.push.multiplyScalar(1 - kp);
      rig.eye.addScaledVector(fenceGap(rig.eye), ease(8, dt));
      rig.eye.y = clamp(rig.eye.y, groundAt(rig.eye.x, rig.eye.z) + CLEARANCE, CEILING);
      rig.focus = 100;
    }

    // swing the view from where it was onto the mode's own aim
    if (rig.blend < 1) {
      rig.blend = Math.min(1, rig.blend + dt / BLEND_S);
      rig.dir.lerpVectors(rig.fromDir, _aim, THREE.MathUtils.smootherstep(rig.blend, 0, 1)).normalize();
    } else rig.dir.copy(_aim);

    const kl = ease(LENS_K, dt);
    rig.fov += (p.fov - rig.fov) * kl;
    // a positive Tilt leans the camera right (rotateZ turns it the other way)
    rig.roll += (-THREE.MathUtils.degToRad(p.roll) - rig.roll) * kl;

    dir.owner = OWNER;
    dir.eye.copy(rig.eye);
    dir.look.copy(rig.eye).addScaledVector(rig.dir, rig.focus);
    dir.fov = rig.fov;
    dir.roll = rig.roll;
    dir.stiffness = SNAP;
  });

  return ticket > served ? <Shutter key={ticket} onServed={() => setServed(ticket)} /> : null;
}
