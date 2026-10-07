import { create } from "zustand";
import { MAP_W, MAP_H, SEA_LEVEL } from "@/data/content";
import { solidAt } from "@/three/obstacles";
import { DRAGON_TUNING, EAGLE_TUNING, envelopeAt, springRate } from "@/three/flight";

/**
 * Flight trials: ring courses flown against the clock. The course data and
 * the geometry live here so the 3D gates (Trials.tsx) and the HUD
 * (TrialHud.tsx) agree on them.
 */

export type Medal = "gold" | "silver" | "bronze";
export type Steed = "dragon" | "eagle";

export interface Course {
  id: string;
  name: string;
  blurb: string;
  /** where the steed waits out the countdown (map u, v) */
  start: [number, number];
  /** gate centres in flying order (map u, v) */
  gates: [number, number][];
  /** seconds to beat for gold, silver, bronze — per steed, the eagle being the swifter */
  medals: Record<Steed, [number, number, number]>;
  /** called out as the countdown ends */
  cry: string;
}

/** Where a best time is kept: per course and per steed (store.endTrial writes it). */
export const bestKey = (course: string, steed: Steed) => `${course}:${steed}`;

export const COURSES: Course[] = [
  {
    id: "redhorn",
    name: "The Redhorn Pass",
    blurb: "Over the High Pass and down the vale of Anduin, back across Caradhras by the Redhorn Gate, then straight at the Doors of Durin, over Moria and the Golden Wood, and down the Great River to Rauros.",
    start: [0.442, 0.228],
    gates: [
      [0.522, 0.207],
      [0.57, 0.188],
      [0.582, 0.272],
      [0.565, 0.345],
      [0.515, 0.312],
      [0.462, 0.296],
      [0.452, 0.35],
      [0.492, 0.352],
      [0.537, 0.36],
      [0.565, 0.4],
      [0.588, 0.44],
      [0.603, 0.49],
    ],
    medals: { dragon: [19, 24, 32.5], eagle: [16.5, 19.5, 27.5] },
    cry: "FLY, YOU FOOLS!",
  },
  {
    id: "rohirrim",
    name: "The Ride of the Rohirrim",
    blurb: "Low and fast with the éoreds: from the gates of Isengard across the Emnets to the Wold, down through Anórien to the Pelennor beneath the White City, then home under the beacon-hills, over Edoras and Helm's Deep, and out by the Fords of Isen.",
    start: [0.489, 0.514],
    gates: [
      [0.522, 0.486],
      [0.548, 0.462],
      [0.572, 0.418],
      [0.603, 0.462],
      [0.606, 0.505],
      [0.628, 0.603],
      [0.603, 0.568],
      [0.57, 0.546],
      [0.479, 0.537],
      [0.452, 0.5],
      [0.405, 0.468],
    ],
    medals: { dragon: [16.5, 20.5, 28.5], eagle: [14, 17.5, 24] },
    cry: "FORTH, EORLINGAS!",
  },
  {
    id: "longlake",
    name: "The Long Lake Run",
    blurb: "Out of Mirkwood beneath the Front Gate of Erebor, over the Long Lake and down the River Running, round the Sea of Rhûn, then up the Redwater and home along the Iron Hills to the Mountain.",
    start: [0.59, 0.245],
    gates: [
      [0.65, 0.264],
      [0.681, 0.262],
      [0.698, 0.322],
      [0.735, 0.344],
      [0.775, 0.356],
      [0.825, 0.366],
      [0.846, 0.398],
      [0.806, 0.414],
      [0.768, 0.392],
      [0.772, 0.318],
      [0.786, 0.255],
      [0.757, 0.192],
      [0.712, 0.215],
    ],
    medals: { dragon: [19, 24, 32], eagle: [16, 20, 27] },
    cry: "BARUK KHAZÂD!",
  },
];

export interface Gate {
  x: number;
  y: number;
  z: number;
  /** unit facing in the ground plane — the way the course runs through it */
  nx: number;
  nz: number;
  /** the lowest the ring's centre may sink and still clear the land all round */
  floor: number;
}

/** Ring radius, world units — generous: the steed holds its own altitude. */
export const GATE_R = 17;
const TUBE = 0.8;
// a pass counts a little beyond the drawn ring, so grazing the rim is a pass
const PASS_R = GATE_R + 4;
// The rider steers but never chooses an altitude — the steed holds its own
// (flight.ts) — so the next ring floats up or down to meet it on the approach
export const FLOAT_NEAR = 300;
export const FLOAT_MAX = 28;
export const FLOAT_RATE = 2.5;
// how far a ring may turn from the way in toward the way out
const MAX_LEAN = (40 * Math.PI) / 180;

function unit(x: number, z: number): [number, number] {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}

const clampX = (x: number) => Math.min(Math.max(x, 0), MAP_W);
const clampZ = (z: number) => Math.min(Math.max(z, 0), MAP_H);
const groundAt = (x: number, z: number) => Math.max(solidAt(clampX(x), clampZ(z)), SEA_LEVEL);

// halfway between the two steeds, so a ring suits whichever is flown
const mid = (k: "boost" | "hover" | "hoverSpeedLift" | "altResponse") => (DRAGON_TUNING[k] + EAGLE_TUNING[k]) / 2;

/**
 * Hang each ring where the steed will already be. flight.ts holds the steed
 * on a spring above its clearance line (envelopeAt), so it climbs early for a
 * ridge and lags on a descent; a ghost flies the course's legs at a brisk
 * pace (between holding W and the boost) by that same rule and records its
 * height at every gate.
 */
function ghostHeights(pts: (readonly [number, number])[]): number[] {
  const speed = 80;
  const dt = 1 / 60;
  const s01 = speed / mid("boost");
  const hover = mid("hover") + s01 * mid("hoverSpeedLift");
  const response = mid("altResponse");
  const heights: number[] = [];
  let y = 0;
  let vy = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [dx, dz] = unit(pts[i][0] - ax, pts[i][1] - az);
    const len = Math.hypot(pts[i][0] - ax, pts[i][1] - az);
    for (let s = 0; s <= len; s += speed * dt) {
      const x = ax + dx * s;
      const z = az + dz * s;
      const target = envelopeAt(x, z, dx, dz, s01) + hover;
      if (i === 1 && s === 0) y = target; // settled at the start line
      const w = springRate(target - y, response);
      vy = Math.min(Math.max(vy + (w * w * (target - y) - 2 * w * vy) * dt, -80), 120);
      y = Math.max(y + vy * dt, groundAt(x, z) + 3);
    }
    heights.push(y);
  }
  return heights;
}

/** The lowest centre at which the whole ring clears land, canopy and towers. */
function ringFloor(x: number, z: number, nx: number, nz: number) {
  const R = GATE_R + TUBE;
  let floor = -Infinity;
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    const across = Math.cos(a) * R; // the ring spans the course: across it, and up
    floor = Math.max(floor, groundAt(x - nz * across, z + nx * across) + 2 - Math.sin(a) * R);
  }
  return floor;
}

const coursePoints = (c: Course) => [c.start, ...c.gates].map(([u, v]) => [u * MAP_W, v * MAP_H] as const);

function buildGates(c: Course): Gate[] {
  const pts = coursePoints(c);
  const heights = ghostHeights(pts);
  const gates: Gate[] = [];
  for (let i = 1; i < pts.length; i++) {
    const [x, z] = pts[i];
    const inDir = unit(x - pts[i - 1][0], z - pts[i - 1][1]);
    const outDir = i + 1 < pts.length ? unit(pts[i + 1][0] - x, pts[i + 1][1] - z) : inDir;
    // face halfway into the turn, but never more than 40° off the way in: on a
    // sharp turn the bisector would stand the ring edge-on to the arriving rider
    const turn = Math.atan2(inDir[0] * outDir[1] - inDir[1] * outDir[0], inDir[0] * outDir[0] + inDir[1] * outDir[1]);
    const face = Math.atan2(inDir[1], inDir[0]) + Math.max(-MAX_LEAN, Math.min(MAX_LEAN, turn / 2));
    const nx = Math.cos(face);
    const nz = Math.sin(face);
    const floor = ringFloor(x, z, nx, nz);
    gates.push({ x, z, nx, nz, floor, y: Math.max(heights[i - 1], floor) });
  }
  return gates;
}

const built = new Map<string, readonly Gate[]>();

/**
 * The course's gates in world space, facing along the racing line. Built once
 * per course (a few ms of terrain sampling) — the land never moves, and the
 * trials only run once the baked terrain is in (Terrain suspends until then).
 */
export function courseGates(c: Course): readonly Gate[] {
  let g = built.get(c.id);
  if (!g) built.set(c.id, (g = buildGates(c)));
  return g;
}

/** Start pose: on the start line, nose on the first gate. */
export function startPose(c: Course) {
  const [[x, z], [gx, gz]] = coursePoints(c);
  return { x, z, heading: Math.atan2(gz - z, gx - x), y: groundAt(x, z) + 14 };
}

/**
 * Did the step a→b fly through the gate? A segment test against the gate's
 * disc — the plane is crossed front to back, within the pass radius — so no
 * speed can skip a gate between two frames.
 */
export function crossedGate(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  g: Gate,
) {
  const da = (ax - g.x) * g.nx + (az - g.z) * g.nz;
  const db = (bx - g.x) * g.nx + (bz - g.z) * g.nz;
  if (da > 0 || db <= 0) return false;
  const t = da / (da - db);
  const px = ax + (bx - ax) * t - g.x;
  const py = ay + (by - ay) * t - g.y;
  const pz = az + (bz - az) * t - g.z;
  return px * px + py * py + pz * pz <= PASS_R * PASS_R;
}

export function medalFor(c: Course, steed: Steed, time: number): Medal | null {
  const [gold, silver, bronze] = c.medals[steed];
  if (time <= gold) return "gold";
  if (time <= silver) return "silver";
  if (time <= bronze) return "bronze";
  return null;
}

/** 0:42.37 */
export function formatTime(t: number) {
  const cs = Math.round(t * 100); // whole hundredths, so 59.996 reads 1:00.00, not 0:60.00
  const s = (cs % 6000) / 100;
  return `${Math.floor(cs / 6000)}:${s < 10 ? "0" : ""}${s.toFixed(2)}`;
}

export interface TrialResult {
  course: string;
  steed: Steed;
  time: number;
  medal: Medal | null;
  /** the steed's best this run was flown against (none on a first finish) */
  prev: number | undefined;
}

interface TrialView {
  /** what the flown course is doing; idle when none is */
  phase: "idle" | "countdown" | "racing";
  /** countdown numeral, 3…1 */
  count: number;
  /** performance.now() of the starting cry — a remounted HUD must not cry again */
  goAt: number;
  passed: number;
  total: number;
  /** the last finish, until the rider moves on */
  result: TrialResult | null;
}

/** Trial state the HUD renders from (Trials.tsx drives it). */
export const useTrial = create<TrialView>(() => ({ phase: "idle", count: 3, goAt: 0, passed: 0, total: 0, result: null }));

/**
 * Per-frame values the HUD polls on its own animation frame, so the clock
 * ticking and the guide turning never re-render React.
 */
export const trialLive = {
  elapsed: 0,
  /** the next gate is out of view to the side or behind: show the guide */
  guide: false,
  /** bearing to the next gate from the camera's heading, radians, + to the right */
  angle: 0,
};
