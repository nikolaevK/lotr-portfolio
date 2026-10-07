import { toWorldX, toWorldZ, type Beacon, type LostPage } from "@/data/content";

/**
 * The quest guide's brain: what is worth doing next, and how far away it is in
 * the words of the books. Pure functions — QuestGuide.tsx owns the timing.
 */

/** One thing worth doing next, in world space. */
export interface Objective {
  key: string; // stable identity: "region:elf", "page:3", "beacon:1"
  kind: "region" | "page" | "beacon";
  x: number;
  z: number;
  regionId?: string; // chapters travel by id, so the autopilot opens the tale
  kicker: string;
  title: string;
}

interface Progress {
  visited: Record<string, boolean>;
  pages: Record<number, boolean>;
  beacons: Record<number, boolean>;
}

interface World {
  regions: { id: string; x: number; y: number; place: string }[];
  lostPages: LostPage[];
  beacons: Beacon[];
}

/** World units per league: Hobbiton→Rivendell spans ~460 units here, which is
 *  the ~130 leagues of Frodo's road in the books. */
export const LEAGUE = 3.5;

// "The Shire" reads "Seek the Shire" mid-sentence
const midSentence = (place: string) => place.replace(/^The /, "the ");

/** Everything still undone: the unvisited chapters first; only once every
 *  chapter is charted do the lost pages and unlit beacons count. */
export function pendingObjectives(p: Progress, w: World): Objective[] {
  const chapters = w.regions.filter((r) => !p.visited[r.id]);
  if (chapters.length > 0) {
    return chapters.map((r) => ({
      key: "region:" + r.id,
      kind: "region",
      x: toWorldX(r.x),
      z: toWorldZ(r.y),
      regionId: r.id,
      kicker: "THE NEXT CHAPTER",
      title: "Seek " + midSentence(r.place),
    }));
  }
  const found = w.lostPages.filter((pg) => p.pages[pg.id]).length;
  const lit = w.beacons.filter((b) => p.beacons[b.id]).length;
  const out: Objective[] = [];
  for (const pg of w.lostPages) {
    if (p.pages[pg.id]) continue;
    out.push({
      key: "page:" + pg.id,
      kind: "page",
      x: toWorldX(pg.x),
      z: toWorldZ(pg.y),
      kicker: `LOST PAGES · ${found}/${w.lostPages.length}`,
      title: "Seek the page " + pg.hint,
    });
  }
  for (const b of w.beacons) {
    if (p.beacons[b.id]) continue;
    out.push({
      key: "beacon:" + b.id,
      kind: "beacon",
      x: toWorldX(b.x),
      z: toWorldZ(b.y),
      kicker: `BEACONS · ${lit}/${w.beacons.length} LIT`,
      title: "Kindle the beacon of " + b.name,
    });
  }
  return out;
}

/**
 * Pick the objective: the chapter the autopilot is already bound for, else
 * the nearest — but hold the current one unless another is clearly nearer,
 * and never switch mid-autopilot, so the card doesn't flicker between two
 * goals at similar range. Null = nothing left to do.
 */
export function chooseObjective(
  list: Objective[],
  x: number,
  z: number,
  currentKey: string | null,
  autoTarget: { id?: string } | null,
): Objective | null {
  if (list.length === 0) return null;
  if (autoTarget?.id) {
    const bound = list.find((o) => o.regionId === autoTarget.id);
    if (bound) return bound;
  }
  let best = list[0];
  let bestD = Infinity;
  let current: Objective | null = null;
  let currentD = Infinity;
  for (const o of list) {
    const d = Math.hypot(o.x - x, o.z - z);
    if (d < bestD) {
      best = o;
      bestD = d;
    }
    if (o.key === currentKey) {
      current = o;
      currentD = d;
    }
  }
  if (current && (autoTarget || currentD <= bestD * 1.3)) return current;
  return best;
}

const POINTS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

/** Compass bearing in degrees, clockwise from map-north (+X is east, +Z south). */
export function bearingDeg(dx: number, dz: number) {
  return ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
}

/** The eight-wind name for a bearing. */
export const windName = (deg: number) => POINTS[Math.round(deg / 45) % 8];

/** "1 league" / "132 leagues" for a world distance. */
export function leaguesText(n: number) {
  return n === 1 ? "1 league" : `${n} leagues`;
}
