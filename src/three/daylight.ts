import * as THREE from "three";
import { runtime } from "@/game/runtime";

/**
 * The day's clock, and where it puts the sun and the moon.
 *
 * runtime.dayTime runs 0 → 1 (0 midnight, .25 dawn, .5 noon, .75 dusk). A day
 * lasts about ten minutes, but not evenly: the clock hurries through the dead
 * of night and lingers over dawn and dusk, the hours worth looking at.
 *
 * The sun rises in the north-east, stands in the north-west at noon — the
 * map-maker's light, so relief reads the right way up from the map view — and
 * sets in the south-west, over the Sundering Seas beyond the Grey Havens.
 *
 * SkyDome steps the clock once per frame; Weather turns it into light, sky and
 * fog over the zone presets; everything else just reads `daylight`.
 */

/** Where the journey starts the day (and where the cover's map stays). */
const DAY_START = 0.42;
const DAY_SECONDS = 600;
// 46° at noon puts the starting sun at the 39° the parchment was lit by
// before the sky moved, so the cover looks exactly as it did
const NOON_ELEV = THREE.MathUtils.degToRad(46);
const RISE = new THREE.Vector3(1, 0, -1).normalize();
const NOON = new THREE.Vector3(-1, 0, -1).normalize();

/** The axis the sky wheels about — the sun's path, and the stars with it. */
export const SKY_POLE = new THREE.Vector3().crossVectors(
  RISE,
  NOON.clone().multiplyScalar(Math.cos(NOON_ELEV)).setY(Math.sin(NOON_ELEV)),
);

export const daylight = {
  /** the time this frame, after any lock */
  t: DAY_START,
  sunDir: new THREE.Vector3(),
  moonDir: new THREE.Vector3(),
  /** 0 → 1 as the sun climbs clear of the horizon */
  day: 1,
  /** 0 → 1 from sunset into deep night: stars, moonlight, the night palette */
  night: 0,
  /** the warm low-sun hour, peaking as the sun touches the horizon */
  golden: 0,
  /** the blue hour just after sunset (and before sunrise): rose and lavender */
  twilight: 0,
};

/**
 * Below this sun height the moon, not the sun, casts the shadows. Both lights
 * are at zero there, so the swap never shows.
 */
export const LIGHT_SWAP_Y = -0.03;

const _v = new THREE.Vector3();

function sunAt(t: number, out: THREE.Vector3) {
  const h = (t - 0.5) * Math.PI * 2; // hour angle, 0 at noon
  const c = Math.cos(h);
  return out
    .copy(RISE)
    .multiplyScalar(-Math.sin(h))
    .addScaledVector(NOON, c * Math.cos(NOON_ELEV))
    .setY(c * Math.sin(NOON_ELEV));
}

/** Real time spent per unit of day, relative, by the sun's height. */
function pace(sunY: number) {
  const twilight = Math.exp(-(sunY * sunY) / 0.04);
  return sunY < 0 ? 0.3 + 1.4 * twilight : 0.7 + twilight;
}

let paceMean = 0;
function meanPace() {
  if (!paceMean) {
    for (let i = 0; i < 256; i++) paceMean += pace(sunAt((i + 0.5) / 256, _v).y) / 256;
  }
  return paceMean;
}

const smooth = THREE.MathUtils.smoothstep;

/** Advance the clock (only while `running`) and recompute sun, moon and light amounts. */
export function stepDaylight(dt: number, running: boolean) {
  if (runtime.dayLock !== null) {
    // follow the lock, so the day carries on from there once it lets go
    runtime.dayTime = ((runtime.dayLock % 1) + 1) % 1;
  } else if (running) {
    const y = sunAt(runtime.dayTime, _v).y;
    runtime.dayTime = (runtime.dayTime + dt * meanPace() / (DAY_SECONDS * pace(y))) % 1;
  } else {
    runtime.dayTime = DAY_START;
  }

  const t = runtime.dayTime;
  daylight.t = t;
  const sy = sunAt(t, daylight.sunDir).y;
  // a full moon, opposite the sun but lifted a little, so it is already up at
  // dusk and still setting at dawn
  daylight.moonDir.copy(daylight.sunDir).negate();
  daylight.moonDir.y += 0.22;
  daylight.moonDir.normalize();

  daylight.day = smooth(sy, -0.06, 0.22);
  daylight.night = 1 - smooth(sy, -0.22, 0.02);
  // golden fades fast once the sun is down, handing over to the blue hour
  const g = (sy - 0.03) / (sy > 0.03 ? 0.14 : 0.07);
  daylight.golden = Math.exp(-g * g);
  const tw = (sy + 0.08) / 0.08;
  daylight.twilight = Math.exp(-tw * tw);
}
