import * as THREE from "three";
import { MAP_W, MAP_H, REGIONS, SEA_LEVEL, toWorldX, toWorldZ } from "@/data/content";
import { heightAt } from "@/three/noise";
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
}

export const createFlightState = (): FlightState => ({
  turnSmooth: 0,
  speed01: 0,
  boosting: false,
  turnIn: 0,
  thrust: 0,
  brake: 0,
  brakeSmooth: 0,
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
    runtime.heading += turnIn * TURN * dt;
    turnRate = turnIn * TURN;
    let spd = runtime.speed;
    spd += thrust * ACC * dt;
    spd *= Math.exp(-(2.1 + brake * t.brakeDrag) * dt);
    spd = Math.min(spd, MAXV);
    runtime.vel.x = Math.cos(runtime.heading) * spd;
    runtime.vel.z = Math.sin(runtime.heading) * spd;
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
      diff = ((diff + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const k = 1 - Math.exp(-5 * dt);
      runtime.heading += diff * k;
      turnRate = (diff * k) / Math.max(dt, 1e-4);
    }
  }
  runtime.pos.x = THREE.MathUtils.clamp(runtime.pos.x + runtime.vel.x * dt, 60, MAP_W - 60);
  runtime.pos.z = THREE.MathUtils.clamp(runtime.pos.z + runtime.vel.z * dt, 55, MAP_H - 55);
  runtime.speed = Math.hypot(runtime.vel.x, runtime.vel.z);
  fs.speed01 = Math.min(runtime.speed / t.boost, 1);
  fs.turnSmooth += (turnRate - fs.turnSmooth) * Math.min(1, 6 * dt);
  fs.brakeSmooth += (fs.brake - fs.brakeSmooth) * Math.min(1, 7 * dt);

  // altitude — terrain following with look-ahead climb
  const hx = Math.cos(runtime.heading);
  const hz = Math.sin(runtime.heading);
  const ahead = 30 + fs.speed01 * 80;
  const gHere = Math.max(heightAt(runtime.pos.x, runtime.pos.z), SEA_LEVEL);
  const gAhead = Math.max(
    heightAt(
      THREE.MathUtils.clamp(runtime.pos.x + hx * ahead, 0, MAP_W),
      THREE.MathUtils.clamp(runtime.pos.z + hz * ahead, 0, MAP_H),
    ),
    SEA_LEVEL,
  );
  const ground = Math.max(gHere, gAhead) * morph.value;
  const bob = Math.sin(performance.now() * 0.0011) * (t.bobAmp - fs.speed01 * t.bobAmp * 0.5);
  const targetY = ground + t.hover + fs.speed01 * t.hoverSpeedLift + bob;
  const prevY = runtime.pos.y;
  runtime.pos.y += (targetY - runtime.pos.y) * Math.min(1, t.altResponse * dt);
  const vy = (runtime.pos.y - prevY) / Math.max(dt, 1e-4);
  runtime.vel.y = vy;

  // bank & pitch (bank eases off when hovering so turn-in-place looks right)
  const bankTarget =
    THREE.MathUtils.clamp(fs.turnSmooth * t.bankMul, -t.bankMax, t.bankMax) *
    (0.35 + 0.65 * fs.speed01);
  runtime.bank += (bankTarget - runtime.bank) * Math.min(1, 4 * dt);
  const pitchTarget =
    THREE.MathUtils.clamp(vy * 0.025, -0.42, 0.46) - fs.speed01 * t.speedLean;
  runtime.pitch += (pitchTarget - runtime.pitch) * Math.min(1, 4 * dt);

  // ── region proximity (opens tales, as in the concept) ──
  if (!frozen) {
    for (const r of REGIONS) {
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
