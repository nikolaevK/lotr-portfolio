"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MAP_W, MAP_H, SITES, toWorldX, toWorldZ, type MapSite } from "@/data/content";
import { content, useContent } from "@/state/content";
import { runtime } from "@/game/runtime";
import { game, useGame, type GameState } from "@/state/store";
import { reducedMotion } from "@/game/prefs";
import { heightAt } from "@/three/noise";
import { solidAt } from "@/three/obstacles";
import { morph } from "@/three/Terrain";
import {
  allBeaconsLit, beaconChain, caption, chainFire, cineCtl, finishCinematic, useCine, VEIL_S,
  type CineCaption,
} from "@/game/cinematics";

type CineId = "beacons" | "finale";

/** Sky time while each cinematic runs: beacon-fire at dusk, the Shire at golden hour. */
const BEACON_DAY = 0.74;
const FINALE_DAY = 0.72;

// ── camera tracks ───────────────────────────────────────────────────────────

/**
 * Eye and look-at splines with one waypoint each per beat. The eye is flown
 * at constant speed along its own arc length (eased in and out); the look
 * curve is read at the same spline parameter, so both pass beat k together.
 */
interface Track {
  eye: THREE.CatmullRomCurve3;
  look: THREE.CatmullRomCurve3;
  beats: number;
}

interface Cue {
  /** spline parameter (0–1) at which it fires */
  t: number;
  /** chain links allowed to burn from here on */
  fire?: number;
  caption?: CineCaption;
}

interface Plan {
  track: Track | null; // null: reduced motion — a still shot of `end`
  /** the flight's timing: a trapezoid ease over `duration`, or a paced table */
  duration: number;
  accel: number;
  decel: number;
  pace?: Pace;
  cues: Cue[];
  /** after arrival: captions by seconds, then the plan's ending */
  tail: { at: number; caption: CineCaption | null }[];
  tailLength: number;
  end: { eye: THREE.Vector3; look: THREE.Vector3 };
  fov: number;
  endFov: number;
  day: number;
}

function track(eyes: THREE.Vector3[], looks: THREE.Vector3[]): Track {
  const eye = new THREE.CatmullRomCurve3(eyes, false, "centripetal");
  eye.arcLengthDivisions = 400;
  return { eye, look: new THREE.CatmullRomCurve3(looks, false, "centripetal"), beats: eyes.length - 1 };
}

/** 0→1 along a path with a trapezoidal speed profile: ease in over `a`, out over `b`. */
function travel(t: number, d: number, a: number, b: number) {
  if (t <= 0) return 0;
  if (t >= d) return 1;
  const v = 1 / (d - 0.5 * (a + b));
  if (t < a) return (0.5 * v * t * t) / a;
  if (t < d - b) return v * (0.5 * a + (t - a));
  const r = d - t;
  return 1 - (0.5 * v * r * r) / b;
}

/**
 * Arc-length progress against time for a flight that slows over its beats —
 * a land gets a held, dollying shot, the leagues between pass quickly — and
 * eases off the mark and into its last frame. Built once per plan.
 */
interface Pace {
  time: Float32Array; // seconds to reach each of PACE_STEPS + 1 even steps of arc
  total: number;
}
const PACE_STEPS = 300;

function pace(tr: Track, beats: number[], fast: number, slow: number, minTotal: number, maxTotal: number): Pace {
  const length = tr.eye.getLength();
  const arc = tr.eye.getLengths();
  const div = arc.length - 1;
  const at = beats.map((t) => arc[Math.round(t * div)]);
  const ss = THREE.MathUtils.smoothstep;
  const speed = (s: number) => {
    let d = Infinity;
    for (const b of at) d = Math.min(d, Math.abs(s - b));
    return (
      THREE.MathUtils.lerp(slow, fast, ss(d, 60, 260)) *
      THREE.MathUtils.lerp(0.25, 1, ss(s, 0, 240)) *
      THREE.MathUtils.lerp(0.12, 1, ss(length - s, 0, 220))
    );
  };
  const time = new Float32Array(PACE_STEPS + 1);
  const ds = length / PACE_STEPS;
  let v0 = speed(0);
  for (let i = 1; i <= PACE_STEPS; i++) {
    const v1 = speed(i * ds);
    time[i] = time[i - 1] + ds / (0.5 * (v0 + v1));
    v0 = v1;
  }
  // stretch or squeeze the whole flight into its allotted span
  const k = THREE.MathUtils.clamp(time[PACE_STEPS], minTotal, maxTotal) / time[PACE_STEPS];
  for (let i = 0; i <= PACE_STEPS; i++) time[i] *= k;
  return { time, total: time[PACE_STEPS] };
}

/** 0→1 along the arc at `clock` seconds into a paced flight. */
function paced(p: Pace, clock: number) {
  if (clock >= p.total) return 1;
  let lo = 0;
  let hi = PACE_STEPS;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p.time[mid] <= clock) lo = mid;
    else hi = mid;
  }
  return (lo + (clock - p.time[lo]) / Math.max(1e-6, p.time[hi] - p.time[lo])) / PACE_STEPS;
}

const clampX = (x: number) => THREE.MathUtils.clamp(x, 0, MAP_W);
const clampZ = (z: number) => THREE.MathUtils.clamp(z, 0, MAP_H);

/** Highest solid ground (land, canopy, towers) within r of (x, z). */
function groundAround(x: number, z: number, r: number) {
  let m = solidAt(clampX(x), clampZ(z));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    m = Math.max(m, solidAt(clampX(x + Math.cos(a) * r), clampZ(z + Math.sin(a) * r)));
  }
  return m;
}

/** Raise a waypoint until it clears everything around it by `above`. */
function clear(p: THREE.Vector3, r: number, above: number) {
  p.y = Math.max(p.y, groundAround(p.x, p.z, r) + above);
  return p;
}

const ground = (x: number, z: number, lift = 0) => new THREE.Vector3(x, heightAt(x, z) + lift, z);

// ── the beacon flight ───────────────────────────────────────────────────────

function beaconsPlan(reduced: boolean): Plan {
  const chain = beaconChain(content().beacons);
  const fires = chain.map((l) => ground(l.x, l.z, 9));
  const mt = ground(toWorldX(SITES.minastirith.u), toWorldZ(SITES.minastirith.v));
  const ed = ground(toWorldX(SITES.edoras.u), toWorldZ(SITES.edoras.v));
  // the chain runs from the White City to the Golden Hall; the camera flies
  // its northern (Rohan) side, looking up the line across the peaks
  const along = new THREE.Vector3(ed.x - mt.x, 0, ed.z - mt.z).normalize();
  const north = new THREE.Vector3(along.z, 0, -along.x);
  if (north.z > 0) north.negate();
  const kicker = "THE BEACONS OF GONDOR";

  // the close: past the Golden Hall, turning to look back down the burning
  // chain over its roof
  const last = {
    eye: clear(ed.clone().addScaledVector(north, 120).addScaledVector(along, 70).setY(ed.y + 62), 30, 40),
    look: ed.clone().addScaledVector(along, -70).setY(ed.y + 22),
  };
  const answer = [
    { at: 0.5, caption: caption({ kicker: "EDORAS", text: "And Rohan will answer." }) },
  ];

  if (reduced) {
    // one still, wide shot of the whole chain ablaze
    const mid = fires.reduce((acc, f) => acc.add(f), new THREE.Vector3()).divideScalar(Math.max(1, fires.length));
    const eye = clear(mid.clone().addScaledVector(north, 240).addScaledVector(along, -40).setY(mid.y + 120), 40, 60);
    return {
      track: null, duration: 0, accel: 0, decel: 0, cues: [],
      tail: [
        { at: 0, caption: caption({ kicker, text: "The beacons are lit!", sub: chain.map((l) => l.name).join(" · ") }) },
        { at: 2.4, caption: caption({ kicker, text: "Gondor calls for aid!" }) },
        { at: 4.2, caption: caption({ kicker: "EDORAS", text: "And Rohan will answer." }) },
      ],
      tailLength: 6.4,
      end: { eye, look: mid.setY(mid.y + 6) },
      fov: 50, endFov: 50, day: BEACON_DAY,
    };
  }

  // eye beats sit beside each fire on a smoothed line, so the camera does
  // not weave with the zig-zag of peaks the fires stand on
  const eyes: THREE.Vector3[] = [];
  const looks: THREE.Vector3[] = [];
  eyes.push(clear(mt.clone().addScaledVector(along, -60).addScaledVector(north, 50).setY(mt.y + 120), 30, 70));
  looks.push(fires[0] ?? last.look);
  let s = -Infinity;
  fires.forEach((f, i) => {
    const prev = fires[Math.max(0, i - 1)];
    const next = fires[Math.min(fires.length - 1, i + 1)];
    const sx = (prev.x + 2 * f.x + next.x) / 4;
    const sz = (prev.z + 2 * f.z + next.z) / 4;
    const sy = (prev.y + 2 * f.y + next.y) / 4;
    // progress along the line never runs backwards
    s = Math.max((sx - mt.x) * along.x + (sz - mt.z) * along.z, s + 18);
    const lat = (sx - mt.x) * north.x + (sz - mt.z) * north.z;
    const e = new THREE.Vector3(mt.x, sy + 48, mt.z).addScaledVector(along, s - 70).addScaledVector(north, lat + 72);
    eyes.push(clear(e, 30, 42));
    looks.push(f.clone().setY(f.y + 4));
  });
  eyes.push(last.eye);
  looks.push(last.look);
  const tr = track(eyes, looks);

  const cues: Cue[] = [{ t: 0, caption: caption({ kicker: "THE BEACONS OF MINAS TIRITH", text: "The beacons are lit!" }) }];
  // fire i is the look target at beat i+1; it catches as the gaze swings to it
  chain.forEach((l, i) => cues.push({ t: (i + 0.55) / tr.beats, fire: i + 1, caption: caption({ kicker, text: l.name + "!" }) }));
  cues.push({ t: (tr.beats - 0.45) / tr.beats, caption: caption({ kicker, text: "Gondor calls for aid!" }) });

  return {
    track: tr, duration: 10.5, accel: 1.4, decel: 2.4, cues,
    tail: answer, tailLength: 3.2, end: last, fov: 50, endFov: 46, day: BEACON_DAY,
  };
}

// ── the finale ──────────────────────────────────────────────────────────────

/** Settled over Hobbiton, looking west into the low sun. */
function homePose() {
  const h = ground(toWorldX(SITES.hobbiton.u), toWorldZ(SITES.hobbiton.v));
  return {
    eye: clear(h.clone().add(new THREE.Vector3(150, 72, 55)), 30, 40),
    look: h.clone().add(new THREE.Vector3(-70, 12, -15)),
  };
}

/**
 * Where each land is seen best (chosen from shots all round each one): its
 * landmark, the side the camera stands on (x, z), and how far above its foot
 * to aim. The White City's tiers against Mindolluin from the south-east; the
 * Dark Tower from the south with Orodruin beside it; Erebor's gate head-on
 * under its cliff; the Hidden Valley from the west, where it opens.
 */
const VANTAGE: Record<string, { site: MapSite; from: [number, number]; aim: number }> = {
  gondor: { site: SITES.minastirith, from: [0.7, 0.7], aim: 28 },
  mordor: { site: SITES.baraddur, from: [0.25, 1], aim: 40 },
  dwarf: { site: SITES.erebor, from: [0.15, 1], aim: 22 },
  elf: { site: SITES.rivendell, from: [-1, 0.15], aim: 10 },
};

/** Clouds drift at 190+ (and hang lower): the flyover keeps under them. */
const CLOUD_FLOOR = 170;

function finalePlan(reduced: boolean): Plan {
  const { regions } = content();
  const home = homePose();
  const shire = regions.find((r) => r.id === "shire");
  const homeCaption = caption({
    kicker: (shire?.common.label ?? "Home").toUpperCase(),
    text: shire?.place ?? "The Shire",
  });
  const verse = caption({ text: "…out from the door where it began.", verse: true });
  const base = { end: home, endFov: 46, day: FINALE_DAY };
  if (reduced) {
    return { ...base, track: null, duration: 0, accel: 0, decel: 0, cues: [], tail: [], tailLength: 0, fov: 46 };
  }

  // each conquered land by its landmark, nearest first from the steed; home last
  const steed = runtime.pos.clone();
  const todo = regions
    .filter((r) => r.id !== "shire")
    .map((r) => {
      const v = VANTAGE[r.id];
      const p = v ? ground(toWorldX(v.site.u), toWorldZ(v.site.v)) : ground(toWorldX(r.x), toWorldZ(r.y));
      return { r, p, v };
    });
  const tour: typeof todo = [];
  let at = steed;
  while (todo.length) {
    let bi = 0;
    todo.forEach((c, i) => {
      if (c.p.distanceToSquared(at) < todo[bi].p.distanceToSquared(at)) bi = i;
    });
    at = todo[bi].p;
    tour.push(todo.splice(bi, 1)[0]);
  }

  const eyes: THREE.Vector3[] = [runtime.camPos.clone()];
  const looks: THREE.Vector3[] = [steed.clone()];
  const cues: Cue[] = [{ t: 0, caption: caption({ text: "The Road goes ever on and on…", verse: true }) }];
  // beat: the waypoint a land is reached at; from: the one before its leg,
  // where the gaze starts to swing toward it (its caption comes with the turn)
  const beats: { beat: number; from: number; caption: CineCaption }[] = [];

  // rise off the steed, still looking down at it
  const first = tour[0]?.p ?? home.look;
  const toFirst = first.clone().sub(steed).setY(0).normalize();
  eyes.push(clear(steed.clone().addScaledVector(toFirst, -50).setY(Math.min(steed.y + 90, CLOUD_FLOOR)), 40, 60));
  looks.push(steed.clone());

  // a long leg lifts just clear of whatever ranges lie under it, no higher
  const crossing = (from: THREE.Vector3, to: THREE.Vector3, lookAt: THREE.Vector3) => {
    if (from.distanceTo(to) < 520) return;
    let top = 0;
    for (let i = 1; i < 16; i++) {
      const k = i / 16;
      top = Math.max(top, groundAround(from.x + (to.x - from.x) * k, from.z + (to.z - from.z) * k, 40));
    }
    const mid = from.clone().lerp(to, 0.5);
    mid.y = Math.max(Math.min(mid.y, CLOUD_FLOOR), top + 45);
    eyes.push(mid);
    looks.push(lookAt.clone());
  };

  tour.forEach(({ r, p, v }, i) => {
    const prev = eyes[eyes.length - 1];
    const next = tour[i + 1]?.p ?? home.look;
    // the side it is seen from; an unknown land is met head-on
    const from = v ? new THREE.Vector3(v.from[0], 0, v.from[1]) : prev.clone().sub(p);
    from.setY(0).normalize();
    // a short dolly across its face, drifting the way the road goes on
    const side = new THREE.Vector3(-from.z, 0, from.x);
    if (side.dot(next.clone().sub(p)) < 0) side.negate();
    const look = p.clone().setY(p.y + (v?.aim ?? 12));
    const stand = p.clone().addScaledVector(from, 150).setY(p.y + 62);
    const e1 = clear(stand.clone().addScaledVector(side, -45), 30, 30);
    const e2 = clear(stand.clone().addScaledVector(side, 45), 30, 30);
    const leg = eyes.length - 1;
    crossing(prev, e1, look);
    eyes.push(e1, e2);
    looks.push(look, look.clone());
    beats.push({ beat: eyes.length - 2, from: leg, caption: caption({ kicker: r.common.label.toUpperCase(), text: r.place }) });
  });
  // and home: in low from the east over the Shire, settling as the sun goes down
  const pre = clear(home.look.clone().add(new THREE.Vector3(360, 0, 110)).setY(home.eye.y + 30), 60, 45);
  const leg = eyes.length - 1;
  crossing(eyes[eyes.length - 1], pre, home.look);
  eyes.push(pre);
  looks.push(home.look.clone());
  beats.push({ beat: eyes.length - 1, from: leg, caption: homeCaption });
  eyes.push(home.eye.clone());
  looks.push(home.look.clone());

  const tr = track(eyes, looks);
  for (const b of beats) cues.push({ t: (b.from + 0.55) / tr.beats, caption: b.caption });
  cues.sort((a, b) => a.t - b.t);
  // slow over each land's dolly (the midpoint of its two beats) and the arrival
  const holds = beats.map((b, i) => (b.beat + (i < beats.length - 1 ? 0.5 : 0)) / tr.beats);

  return {
    ...base, track: tr, cues, fov: 52,
    duration: 0, accel: 0, decel: 0, pace: pace(tr, holds, 240, 55, 16, 22),
    tail: [{ at: 0.3, caption: verse }], tailLength: 2.6,
  };
}

// ── triggers ────────────────────────────────────────────────────────────────

/** Nothing else has the stage: no tale, form, book, course or photo open. */
const stageFree = (s: GameState) =>
  s.phase === "map" && !s.region && !s.contactOpen && !s.codexOpen && !s.trialsOpen && !s.questOpen &&
  !s.photoMode && !s.activeTrial && !s.ravenFlying && s.cinematic === null;

function journeyComplete(s: GameState) {
  const c = content();
  return (
    c.regions.every((r) => s.visited[r.id]) &&
    c.lostPages.every((p) => s.pages[p.id]) &&
    c.beacons.every((b) => s.beacons[b.id])
  );
}

interface Pending {
  id: CineId;
  /** performance.now() before which it may not start */
  notBefore: number;
  /** seconds the stage must have been free */
  settle: number;
}

// ── the player ──────────────────────────────────────────────────────────────

type Stage = "lead" | "fly" | "tail" | "skip" | "scroll" | "exit";

interface Run {
  id: CineId;
  plan: Plan | null; // null on the cover: only the closing scroll
  stage: Stage;
  clock: number;
  cue: number;
  tailCue: number;
  dayFrom: number;
  heading: number;
  roll: number;
  directed: boolean;
  reduced: boolean;
}

const _eye = new THREE.Vector3();
const _look = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/** Wrap-aware blend of two times of day (0..1 around the clock). */
function dayLerp(a: number, b: number, k: number) {
  const d = ((((b - a) % 1) + 1.5) % 1) - 0.5;
  return (((a + d * k) % 1) + 1) % 1;
}

/** The follow camera's pose behind the steed — where CameraRig will want to be. */
function followPose(eye: THREE.Vector3, look: THREE.Vector3) {
  const eagle = game().mount === "eagle";
  _fwd.set(Math.cos(runtime.heading), 0, Math.sin(runtime.heading));
  eye.copy(runtime.pos).addScaledVector(_fwd, eagle ? -25 : -30).y += eagle ? 10.5 : 12.5;
  look.copy(runtime.pos).addScaledVector(_fwd, 14).y += 3.4;
}

function direct(eye: THREE.Vector3, look: THREE.Vector3, fov: number, stiffness: number, roll: number) {
  // a NaN eye would black the whole frame out through the bloom
  if (!Number.isFinite(eye.x + eye.y + eye.z + look.x + look.y + look.z + roll)) return;
  const d = runtime.director;
  d.owner = "cinematic";
  d.eye.copy(eye);
  d.look.copy(look);
  d.fov = fov;
  d.stiffness = stiffness;
  d.roll = roll;
}

/** Stiffness that lands the camera in one frame (finite: dt can be 0). */
const SNAP = 1e4;

/** Plays the beacon-chain and finale camera sequences through runtime.director. */
export function Cinematics() {
  const run = useRef<Run | null>(null);
  // frames left of handing the camera back (one snapped to the follow pose)
  const handBack = useRef(0);
  const pending = useRef<Pending[]>([]);
  const freeFor = useRef(0);
  const setEvents = useThree((s) => s.setEvents);
  const playing = useGame((s) => s.cinematic !== null);

  // the world takes no clicks while a cinematic plays: a marker's hit volume
  // would start the autopilot under the camera's feet
  useEffect(() => {
    if (!playing) return;
    setEvents({ enabled: false });
    return () => setEvents({ enabled: true });
  }, [playing, setEvents]);

  // ── watch the journey for the moments that earn a cinematic ──
  useEffect(() => {
    const queue = (p: Pending) => {
      if (!pending.current.some((q) => q.id === p.id)) pending.current.push(p);
      pending.current.sort((a, b) => (a.id === b.id ? 0 : a.id === "beacons" ? -1 : 1));
    };
    const queueFinale = (delay: number) => {
      const s = game();
      if (!s.finaleSeen && journeyComplete(s) && run.current?.id !== "finale")
        queue({ id: "finale", notBefore: performance.now() + delay, settle: 3 });
    };
    // a save that finished before the finale existed sees it once
    queueFinale(2500);
    let prev = game();
    const offGame = useGame.subscribe((s) => {
      const { beacons } = content();
      // the last beacon catching — a transition, never an already-lit save
      if (s.beacons !== prev.beacons && allBeaconsLit(s.beacons, beacons) && !allBeaconsLit(prev.beacons, beacons)) {
        chainFire.hold = true;
        queue({ id: "beacons", notBefore: performance.now() + 1500, settle: 0.8 });
      }
      if (s.visited !== prev.visited || s.pages !== prev.pages || s.beacons !== prev.beacons || s.finaleSeen !== prev.finaleSeen)
        queueFinale(3500);
      prev = s;
    });
    // live content can change what "complete" means after boot
    const offContent = useContent.subscribe(() => queueFinale(2500));
    return () => {
      offGame();
      offContent();
    };
  }, []);

  // never leave the camera or the sky held if the player goes away
  useEffect(
    () => () => {
      if (runtime.director.owner === "cinematic") runtime.director.owner = null;
      if (run.current?.plan) runtime.dayLock = null;
      chainFire.upTo = Infinity;
      chainFire.hold = false;
      useCine.setState({ active: null, scroll: false, veil: false, caption: null, lit: 0 });
      run.current = null;
    },
    [],
  );

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = game();
    const want = s.cinematic;
    let r = run.current;

    // ── a cinematic ended (finished, skipped, Esc) or another replaced it ──
    if (r && want !== r.id) {
      if (r.directed) handBack.current = 2;
      if (r.plan) {
        runtime.dayLock = null;
        // the beacons burned in a dusk of their own; the journey resumes at
        // its own hour. The finale leaves the world in its golden hour.
        if (r.id === "beacons") runtime.dayTime = r.dayFrom;
      }
      chainFire.upTo = Infinity;
      chainFire.hold = false;
      cineCtl.skip = false;
      useCine.setState({ active: null, scroll: false, veil: false, caption: null });
      run.current = r = null;
    }
    if (handBack.current > 0) {
      // one frame snapped to where the follow camera will be, then let go —
      // no swoop back across half the map
      if (--handBack.current > 0) {
        followPose(_eye, _look);
        direct(_eye, _look, 55, SNAP, 0);
      } else if (runtime.director.owner === "cinematic") runtime.director.owner = null;
    }

    // ── start one ──
    if (!r && want) {
      const reduced = reducedMotion();
      const onMap = s.phase === "map";
      pending.current = pending.current.filter((p) => p.id !== want);
      if (want === "beacons" && !onMap) {
        s.setCinematic(null); // nothing to fly over yet
        return;
      }
      if (want === "finale") s.markFinaleSeen();
      const plan = !onMap ? null : want === "beacons" ? beaconsPlan(reduced) : finalePlan(reduced);
      r = run.current = {
        id: want, plan, stage: "lead", clock: 0, cue: 0, tailCue: 0,
        dayFrom: runtime.dayTime, heading: NaN, roll: 0, directed: false, reduced,
      };
      handBack.current = 0;
      freeFor.current = 0; // the next one waits for a free stage after this ends
      cineCtl.skip = false;
      if (!plan) {
        // on the cover there is no world to fly: straight to the scroll
        r.stage = "scroll";
        useCine.setState({ active: want, scroll: true, veil: false, caption: null });
      } else if (want === "beacons") {
        useCine.setState({ active: want, scroll: false, veil: true, caption: null, chain: beaconChain(content().beacons).map((l) => l.name), lit: 0 });
      } else {
        // the finale rises straight off the steed; only the reduced cut needs the veil
        useCine.setState({ active: want, scroll: false, veil: plan.track === null, caption: null, chain: [], lit: 0 });
        if (plan.track) r.stage = "fly";
      }
    }

    // ── nothing playing: start the next earned one once the stage is free ──
    if (!r) {
      const next = pending.current[0];
      if (!next) return;
      const free = stageFree(s) && morph.value > 0.999;
      freeFor.current = free ? freeFor.current + dt : 0;
      const ready =
        free && freeFor.current >= next.settle && performance.now() >= next.notBefore &&
        // the finale lets the achievement toasts have their moment first
        (next.id !== "finale" || s.toasts.length === 0);
      if (!ready) return;
      pending.current.shift();
      const valid =
        next.id === "beacons" ? allBeaconsLit(s.beacons, content().beacons) : !s.finaleSeen && journeyComplete(s);
      if (valid) s.setCinematic(next.id);
      else if (next.id === "beacons") chainFire.hold = false;
      return;
    }

    const plan = r.plan;
    if (!plan) return; // the cover's scroll: the overlay has it
    r.clock += dt;

    if (r.stage === "lead") {
      // the veil is closing over the steed; cut to the opening once it is black
      if (r.clock < VEIL_S) return;
      r.directed = true;
      if (plan.track) {
        plan.track.eye.getPoint(0, _eye);
        plan.track.look.getPoint(0, _look);
      } else {
        _eye.copy(plan.end.eye);
        _look.copy(plan.end.look);
      }
      direct(_eye, _look, plan.fov, SNAP, 0);
      runtime.dayLock = plan.day;
      if (r.id === "beacons") {
        chainFire.hold = false;
        chainFire.upTo = plan.track ? 0 : Infinity;
        useCine.setState({ lit: plan.track ? 0 : useCine.getState().chain.length });
      }
      useCine.setState({ veil: false, scroll: r.id === "finale" && !plan.track });
      r.stage = plan.track ? "fly" : r.id === "finale" ? "scroll" : "tail";
      r.clock = 0;
      return;
    }

    if (r.stage === "fly" && plan.track) {
      const tr = plan.track;
      if (cineCtl.skip) {
        cineCtl.skip = false;
        r.stage = "skip";
        r.clock = 0;
        useCine.setState({ veil: true, caption: null });
      } else {
        r.directed = true;
        const u = plan.pace ? paced(plan.pace, r.clock) : travel(r.clock, plan.duration, plan.accel, plan.decel);
        const t = tr.eye.getUtoTmapping(u, 0);
        tr.eye.getPoint(t, _eye);
        tr.look.getPoint(t, _look);
        // bank gently into the turns, as a camera bird would
        const h = Math.atan2(_look.z - _eye.z, _look.x - _eye.x);
        if (Number.isFinite(r.heading) && dt > 0) {
          const turn = Math.atan2(Math.sin(h - r.heading), Math.cos(h - r.heading)) / dt;
          r.roll += (THREE.MathUtils.clamp(-turn * 0.18, -0.09, 0.09) - r.roll) * Math.min(1, 2 * dt);
        }
        r.heading = h;
        const fov = THREE.MathUtils.lerp(plan.fov, plan.endFov, THREE.MathUtils.smoothstep(u, 0.8, 1));
        direct(_eye, _look, fov, 4.5, r.roll);
        if (r.id === "finale") runtime.dayLock = dayLerp(r.dayFrom, plan.day, THREE.MathUtils.smootherstep(u, 0.1, 0.95));
        else runtime.dayLock = plan.day;

        while (r.cue < plan.cues.length && plan.cues[r.cue].t <= t) {
          const c = plan.cues[r.cue++];
          if (c.fire !== undefined) {
            chainFire.upTo = c.fire;
            useCine.setState({ lit: c.fire });
          }
          if (c.caption) useCine.setState({ caption: c.caption });
        }
        if (r.clock >= (plan.pace?.total ?? plan.duration)) {
          r.stage = "tail";
          r.clock = 0;
        }
        return;
      }
    }

    if (r.stage === "skip") {
      // the finale's skip: cut under the veil to the closing scroll
      if (r.clock < VEIL_S) return;
      direct(plan.end.eye, plan.end.look, plan.endFov, SNAP, 0);
      runtime.dayLock = plan.day;
      useCine.setState({ veil: false, scroll: true, caption: null });
      r.stage = "scroll";
      r.clock = 0;
      return;
    }

    if (r.stage === "tail" && r.id === "finale" && cineCtl.skip) {
      // already home: skipping the last line just opens the scroll
      cineCtl.skip = false;
      useCine.setState({ caption: null, scroll: true });
      r.stage = "scroll";
      r.clock = 0;
      return;
    }

    if (r.stage === "tail" || r.stage === "exit") {
      runtime.dayLock = plan.day;
      direct(plan.end.eye, plan.end.look, plan.endFov, 4.5, r.roll *= Math.exp(-2 * dt));
      if (r.stage === "exit") return;
      while (r.tailCue < plan.tail.length && plan.tail[r.tailCue].at <= r.clock) {
        useCine.setState({ caption: plan.tail[r.tailCue++].caption });
      }
      if (r.clock >= plan.tailLength) {
        r.stage = "exit";
        if (r.id === "beacons") finishCinematic();
        else {
          useCine.setState({ caption: null, scroll: true });
          r.stage = "scroll";
          r.clock = 0;
        }
      }
      return;
    }

    if (r.stage === "scroll") {
      // a slow drift around the hill while the scroll is read
      runtime.dayLock = plan.day;
      const drift = r.reduced ? 0 : Math.sin(r.clock * 0.05) * 0.18;
      const c = Math.cos(drift);
      const sn = Math.sin(drift);
      const dx = plan.end.eye.x - plan.end.look.x;
      const dz = plan.end.eye.z - plan.end.look.z;
      _eye.set(plan.end.look.x + dx * c - dz * sn, plan.end.eye.y, plan.end.look.z + dx * sn + dz * c);
      direct(_eye, plan.end.look, plan.endFov, 2.5, 0);
    }
  });

  return null;
}
