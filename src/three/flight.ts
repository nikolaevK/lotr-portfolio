import * as THREE from "three";
import { EDGE, MAP_W, MAP_H, SEA_LEVEL, toWorldX, toWorldZ } from "@/data/content";
import { content } from "@/state/content";
import { solidAt } from "@/three/obstacles";
import { runtime } from "@/game/runtime";
import { input, moveAxes } from "@/input/controls";
import { game } from "@/state/store";
import { morph } from "@/three/Terrain";
import { audio } from "@/audio/engine";

const OPEN_R = 140; // region proximity that opens a tale (concept: 140 px)
const RELEASE_R = 200;
const ARRIVE_R = 45;

/** Per-mount handling characteristics. */
export interface FlightTuning {
  cruise: number;
  boost: number;
  accel: number;
  turnBase: number; // rad/s when hovering
  turnDrop: number; // subtracted at full speed
  brakeDrag: number; // extra drag while easing up (tail-fan / air-brake)
  hover: number; // ride height above terrain
  hoverSpeedLift: number;
  bobAmp: number;
  bankMul: number;
  bankMax: number;
  speedLean: number; // nose-down lean at speed
  altResponse: number; // vertical spring rate
  rollRate: number; // how quickly the steed rolls into a turn (1/s)
  grip: number; // how quickly momentum swings round to the new heading (1/s)
  gEff: number; // climb/dive energy exchange — climbing bleeds speed, diving builds it
}

export const DRAGON_TUNING: FlightTuning = {
  cruise: 60,
  boost: 115,
  accel: 130,
  turnBase: 2.25,
  turnDrop: 0.75,
  brakeDrag: 3.4,
  hover: 13,
  hoverSpeedLift: 5,
  bobAmp: 1.2,
  bankMul: 0.42,
  bankMax: 0.62,
  speedLean: 0.1,
  altResponse: 2.6,
  rollRate: 4.2, // a heavy body: rolls in deliberately…
  grip: 6.5, // …and carries its momentum wide through a hard turn
  gEff: 20,
};

export const EAGLE_TUNING: FlightTuning = {
  cruise: 72, // the Windlord outpaces the worm in a straight line…
  boost: 118,
  accel: 150,
  turnBase: 2.9, // …and wheels far tighter
  turnDrop: 0.95,
  brakeDrag: 5.4, // tail fans wide — dramatic air-brake
  hover: 10.5,
  hoverSpeedLift: 7,
  bobAmp: 0.8,
  bankMul: 0.52,
  bankMax: 0.8, // eagles carve steep
  speedLean: 0.16,
  altResponse: 3.4,
  rollRate: 6.5, // the eagle snaps into a bank
  grip: 10,
  gEff: 14,
};

/** Mutable per-frame outputs the mount rigs animate from. */
export interface FlightState {
  turnSmooth: number;
  speed01: number;
  boosting: boolean;
  turnIn: number; // raw rider inputs after freeze-gating
  thrust: number;
  brake: number;
  brakeSmooth: number; // eased, for tail fans etc.
  vy: number; // vertical velocity of the altitude spring
}

export const createFlightState = (): FlightState => ({
  turnSmooth: 0,
  speed01: 0,
  boosting: false,
  turnIn: 0,
  thrust: 0,
  brake: 0,
  brakeSmooth: 0,
  vy: 0,
});

/**
 * One physics step — moves the shared `runtime` rigid state exactly as the
 * dragon always did (rider controls in mount view, map-space for map view &
 * autopilot), plus terrain-following altitude, bank/pitch, region proximity
 * and wind audio. Both mounts call this; only their rigs differ.
 */
export function stepFlight(dt: number, frozen: boolean, t: FlightTuning, fs: FlightState) {
  const s = game();
  const axes = moveAxes();
  const boosting = input.boost && !frozen;
  const ACC = t.accel * (boosting ? 1.85 : 1);
  const MAXV = boosting ? t.boost : t.cruise;
  let turnRate = 0;
  fs.boosting = boosting;
  fs.turnIn = 0;
  fs.thrust = 0;
  fs.brake = 0;

  const firstPerson = !s.overview && !runtime.autoTarget;
  if (firstPerson) {
    // mount view — rider controls, oriented to the steed:
    // A/D wheel, W soars ahead, S eases up
    const turnIn = frozen ? 0 : axes.x;
    const thrust = frozen ? 0 : Math.max(0, -axes.y);
    const brake = frozen ? 0 : Math.max(0, axes.y);
    fs.turnIn = turnIn;
    fs.thrust = thrust;
    fs.brake = brake;
    const speedNow01 = Math.min(runtime.speed / t.boost, 1);
    const TURN = t.turnBase - speedNow01 * t.turnDrop;
    // roll first, then turn: the bank is what carries the steed round (a
    // coordinated turn), so it leans in before the nose swings and levels out
    // before the turn stops. Steady-state rates match the old direct yaw.
    const bankFull = t.bankMax * (0.55 + 0.45 * speedNow01);
    runtime.bank += (turnIn * bankFull - runtime.bank) * Math.min(1, t.rollRate * dt);
    turnRate = (runtime.bank / t.bankMax / (0.55 + 0.45 * speedNow01)) * TURN;
    runtime.heading += turnRate * dt;

    let spd = runtime.speed;
    spd += thrust * ACC * dt;
    spd *= Math.exp(-(2.1 + brake * t.brakeDrag) * dt);
    // climbing trades speed for height and diving pays it back; only while
    // actually flying, so a hovering steed does not creep forward on a descent
    spd -= t.gEff * (fs.vy / Math.max(spd, 12)) * THREE.MathUtils.smoothstep(spd, 6, 24) * dt;
    // a dive may briefly overspeed; drag pulls it back to the cap
    // (capped against the boost, not MAXV: letting go of boost must ease the
    // steed down to cruise, not cut a third of its speed in one frame)
    if (spd > MAXV) spd -= (spd - MAXV) * Math.min(1, 1.6 * dt);
    spd = THREE.MathUtils.clamp(spd, 0, t.boost * 1.25);

    // momentum swings round to the new heading rather than snapping to it,
    // so a hard turn at speed drifts wide
    let travel = runtime.speed > 1 ? Math.atan2(runtime.vel.z, runtime.vel.x) : runtime.heading;
    // wrapped with atan2 — heading is unbounded, and JS % keeps the sign, so
    // the old (x + 3π) % 2π − π came out ±2π after a turn and a half to the left
    let slip = runtime.heading - travel;
    slip = Math.atan2(Math.sin(slip), Math.cos(slip));
    travel += slip * (1 - Math.exp(-t.grip * dt));
    runtime.vel.x = Math.cos(travel) * spd;
    runtime.vel.z = Math.sin(travel) * spd;
  } else {
    // map view & autopilot — map-space steering (as the 2D concept)
    let ax = 0;
    let az = 0;
    if (!frozen) {
      ax = axes.x;
      az = axes.y;
      if (runtime.autoTarget) {
        const dx = runtime.autoTarget.x - runtime.pos.x;
        const dz = runtime.autoTarget.z - runtime.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < ARRIVE_R) runtime.autoTarget = null;
        else {
          ax = dx / d;
          az = dz / d;
        }
      }
    }
    const len = Math.hypot(ax, az) || 1;
    if (Math.hypot(ax, az) > 0.05) {
      runtime.vel.x += (ax / len) * ACC * dt;
      runtime.vel.z += (az / len) * ACC * dt;
    }
    const drag = Math.exp(-2.1 * dt);
    runtime.vel.x *= drag;
    runtime.vel.z *= drag;
    const spv = Math.hypot(runtime.vel.x, runtime.vel.z);
    if (spv > MAXV) {
      runtime.vel.x *= MAXV / spv;
      runtime.vel.z *= MAXV / spv;
    }
    // heading chases velocity
    if (spv > 2.5) {
      const target = Math.atan2(runtime.vel.z, runtime.vel.x);
      let diff = target - runtime.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const k = 1 - Math.exp(-5 * dt);
      runtime.heading += diff * k;
      turnRate = (diff * k) / Math.max(dt, 1e-4);
    }
  }
  // the world's edge stops motion into it, so the steed slides along it
  // instead of pressing on at full speed (and full wind)
  const nx = runtime.pos.x + runtime.vel.x * dt;
  const nz = runtime.pos.z + runtime.vel.z * dt;
  runtime.pos.x = THREE.MathUtils.clamp(nx, EDGE.x, MAP_W - EDGE.x);
  runtime.pos.z = THREE.MathUtils.clamp(nz, EDGE.z, MAP_H - EDGE.z);
  if (runtime.pos.x !== nx) runtime.vel.x = 0;
  if (runtime.pos.z !== nz) runtime.vel.z = 0;
  runtime.speed = Math.hypot(runtime.vel.x, runtime.vel.z);
  fs.speed01 = Math.min(runtime.speed / t.boost, 1);
  fs.turnSmooth += (turnRate - fs.turnSmooth) * Math.min(1, 6 * dt);
  fs.brakeSmooth += (fs.brake - fs.brakeSmooth) * Math.min(1, 7 * dt);

  // altitude — follow a clearance envelope over the land and the landmarks:
  // several samples along the line of travel, each relaxed by its distance,
  // so a ridge ahead is climbed for early and gently rather than in a lurch
  const spdNow = Math.hypot(runtime.vel.x, runtime.vel.z);
  const hx = spdNow > 2 ? runtime.vel.x / spdNow : Math.cos(runtime.heading);
  const hz = spdNow > 2 ? runtime.vel.z / spdNow : Math.sin(runtime.heading);
  const ahead = 30 + fs.speed01 * 90;
  const gHere = Math.max(solidAt(runtime.pos.x, runtime.pos.z), SEA_LEVEL);
  let env = gHere;
  for (let i = 1; i <= 6; i++) {
    const d = (ahead * i) / 6;
    const g = solidAt(
      THREE.MathUtils.clamp(runtime.pos.x + hx * d, 0, MAP_W),
      THREE.MathUtils.clamp(runtime.pos.z + hz * d, 0, MAP_H),
    );
    env = Math.max(env, Math.max(g, SEA_LEVEL) - d * 0.11);
  }
  const ground = env * morph.value;
  const bob = Math.sin(performance.now() * 0.0011) * (t.bobAmp - fs.speed01 * t.bobAmp * 0.5);
  const targetY = ground + t.hover + fs.speed01 * t.hoverSpeedLift + bob;
  // critically damped spring: smooth climbs and settles, no overshoot — and
  // stiffer the further below its line the steed finds itself (a crag face)
  const below = targetY - runtime.pos.y;
  const w = t.altResponse * 2 * (1 + THREE.MathUtils.clamp((below - 8) / 22, 0, 1.6));
  fs.vy += (w * w * below - 2 * w * fs.vy) * dt;
  fs.vy = THREE.MathUtils.clamp(fs.vy, -80, 120);
  runtime.pos.y += fs.vy * dt;
  // never into the ground, however steep the rise
  const floor = gHere * morph.value + 3;
  if (runtime.pos.y < floor) {
    runtime.pos.y = floor;
    fs.vy = Math.max(fs.vy, 0);
  }
  const vy = fs.vy;
  runtime.vel.y = vy;

  // bank & pitch — in map view and on autopilot the bank follows the turn
  // (eased off when hovering so turn-in-place looks right); the rider's own
  // turns already rolled the steed above
  if (!firstPerson) {
    const bankTarget =
      THREE.MathUtils.clamp(fs.turnSmooth * t.bankMul, -t.bankMax, t.bankMax) *
      (0.35 + 0.65 * fs.speed01);
    runtime.bank += (bankTarget - runtime.bank) * Math.min(1, 4 * dt);
  }
  const pitchTarget =
    THREE.MathUtils.clamp(vy * 0.025, -0.42, 0.46) - fs.speed01 * t.speedLean;
  runtime.pitch += (pitchTarget - runtime.pitch) * Math.min(1, 4 * dt);

  // ── region proximity (opens tales, as in the concept) ──
  if (!frozen) {
    for (const r of content().regions) {
      const d = Math.hypot(toWorldX(r.x) - runtime.pos.x, toWorldZ(r.y) - runtime.pos.z);
      if (runtime.cooldown === r.id) {
        if (d > RELEASE_R) runtime.cooldown = null;
        continue;
      }
      if (runtime.autoTarget?.id && runtime.autoTarget.id !== r.id) continue;
      if (d < OPEN_R) {
        runtime.autoTarget = null;
        runtime.cooldown = r.id;
        s.openRegion(r.id);
        break;
      }
    }
  }

  // wind audio + drifting global wind vector
  runtime.windT += dt;
  const wa = runtime.windT * 0.02;
  runtime.wind.set(Math.cos(wa), Math.sin(wa) * 0.6 + 0.4).normalize();
  audio.wind(fs.speed01, runtime.activeZone === "mordor");
}
