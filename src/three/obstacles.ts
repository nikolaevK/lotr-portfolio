import { SITES, toWorldX, toWorldZ } from "@/data/content";
import { heightAt } from "@/three/noise";
import { terrainData, sampleFeature } from "@/three/terrainData";

/**
 * The solid bulk of the landmarks, as soft domes over the terrain, so the
 * steed climbs over Orthanc instead of flying through it and the chase camera
 * never ends up inside a tower. Heights are measured from each landmark's own
 * ground (the same anchor Landmarks.tsx builds on); r is the solid radius and
 * the top eases off over `skirt` units beyond it.
 */
interface Obstacle { u: number; v: number; r: number; h: number; skirt?: number }

const OBSTACLES: Obstacle[] = [
  { ...SITES.minastirith, r: 30, h: 40 }, // seven tiers
  { ...SITES.minastirith, r: 7, h: 70 }, // the Tower of Ecthelion
  { ...SITES.orthanc, r: 9, h: 66 },
  { ...SITES.orthanc, r: 29, h: 8 }, // the ring-wall
  { ...SITES.baraddur, r: 12, h: 110 },
  { ...SITES.erebor, r: 30, h: 54 },
  { ...SITES.edoras, r: 14, h: 22 },
  { ...SITES.hobbiton, r: 19, h: 16 },
  { u: SITES.hobbiton.u + 26 / 3072, v: SITES.hobbiton.v + 14 / 1728, r: 6, h: 16 }, // the mill
  { ...SITES.rivendell, r: 20, h: 22 },
  { ...SITES.lorien, r: 24, h: 34 },
  { ...SITES.havens, r: 13, h: 19 },
  { ...SITES.weathertop, r: 12, h: 8 },
  // the cliff over the Doors: 22 wide, 52 long, so three domes along it
  { u: SITES.moria.u + 15 / 3072, v: SITES.moria.v - 15 / 1728, r: 13, h: 40 },
  { u: SITES.moria.u + 15 / 3072, v: SITES.moria.v, r: 13, h: 40 },
  { u: SITES.moria.u + 15 / 3072, v: SITES.moria.v + 15 / 1728, r: 13, h: 40 },
];

const SKIRT = 16;
let built: { x: number; z: number; r: number; top: number; skirt: number }[] | null = null;

function obstacles() {
  if (!built) {
    built = OBSTACLES.map((o) => {
      const x = toWorldX(o.u);
      const z = toWorldZ(o.v);
      return { x, z, r: o.r, top: heightAt(x, z) + o.h, skirt: o.skirt ?? SKIRT };
    });
  }
  return built;
}

/** Height of the woods' canopy over the land (Forests.tsx grows up to ~17). */
const CANOPY = 15;

/** Highest solid surface at (x, z): the land, the forest canopy, or a landmark. */
export function solidAt(x: number, z: number) {
  let h = heightAt(x, z);
  const td = terrainData();
  if (td) {
    const f = sampleFeature(td, x, z, 0);
    if (f > 0.05) h += CANOPY * Math.min(1, (f - 0.05) / 0.35);
  }
  for (const o of obstacles()) {
    const dx = x - o.x;
    const dz = z - o.z;
    const R = o.r + o.skirt;
    if (dx * dx + dz * dz >= R * R) continue;
    const d = Math.hypot(dx, dz);
    // a dome: full height over the solid radius, easing to nothing by its skirt
    const t = d <= o.r ? 1 : 1 - (d - o.r) / o.skirt;
    const top = o.top - (1 - t * t * (3 - 2 * t)) * (o.top - h);
    if (top > h) h = top;
  }
  return h;
}
