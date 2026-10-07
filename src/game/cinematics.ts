"use client";

import { create } from "zustand";
import { MAP_W, MAP_H, toWorldX, toWorldZ, type Beacon } from "@/data/content";
import { heightAt } from "@/three/noise";
import { useGame } from "@/state/store";

/**
 * Shared state for the two cinematics. Cinematics.tsx (inside the Canvas)
 * runs the clock and the camera; CinematicOverlay.tsx draws the letterbox,
 * captions and the closing scroll; Beacons.tsx lights the chain. They meet
 * here so none of them has to import another.
 */

// ── the beacon chain ────────────────────────────────────────────────────────

/**
 * The beacons of Anórien, from Minas Tirith west toward Rohan. The game's own
 * beacons (content) carry some of these names; the rest stand between them as
 * scenery that only the beacon cinematic sets alight. Spots are approximate —
 * each extra is settled onto a real perch of the White Mountains at runtime.
 */
const CANON: { name: string; u: number; v: number }[] = [
  { name: "Amon Dîn", u: 0.585, v: 0.592 },
  { name: "Eilenach", u: 0.558, v: 0.573 },
  { name: "Nardol", u: 0.5535, v: 0.593 },
  { name: "Erelas", u: 0.545, v: 0.584 },
  { name: "Min-Rimmon", u: 0.5375, v: 0.59 },
  { name: "Calenhad", u: 0.5285, v: 0.5755 },
  { name: "Halifirien", u: 0.531, v: 0.558 },
];

export interface ChainLink {
  key: string;
  name: string;
  x: number;
  z: number;
  /** the content beacon behind this link; null for the chain's scenery */
  contentId: number | null;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * How a pyre would sit at (x, z): `top` is the level of its stone platform
 * (r 4.2) — mostly cut into the high side, never buried more than a unit
 * there — and `expo` how far its downhill edge stands proud of the ground
 * just beyond (r 5.5): the height of fill that shows.
 */
export function footing(x: number, z: number) {
  let max = heightAt(x, z);
  let sum = max;
  let low = Infinity;
  for (let a = 0; a < 8; a++) {
    const c = Math.cos(a * 0.7854);
    const s = Math.sin(a * 0.7854);
    const h1 = heightAt(x + c * 1.8, z + s * 1.8);
    const h2 = heightAt(x + c * 3.6, z + s * 3.6);
    max = Math.max(max, h1, h2);
    sum += h1 + h2;
    low = Math.min(low, heightAt(x + c * 5.5, z + s * 5.5));
  }
  const top = Math.max((max + sum / 17) / 2, max - 1);
  return { top, expo: top - low };
}

/** The best-scoring spot within r of (x, z), on a `step` grid. */
function seek(x: number, z: number, r: number, step: number, score: (dist: number, top: number, expo: number) => number) {
  let best = -Infinity;
  let bx = x;
  let bz = z;
  for (let dz = -r; dz <= r; dz += step)
    for (let dx = -r; dx <= r; dx += step) {
      const d = Math.hypot(dx, dz);
      if (d > r) continue;
      const f = footing(x + dx, z + dz);
      const sc = score(d, f.top, f.expo);
      if (sc > best) {
        best = sc;
        bx = x + dx;
        bz = z + dz;
      }
    }
  return { x: bx, z: bz };
}

/** Scenery beacons take a high perch within 12 units — but a broad one. */
const perch = (u: number, v: number) =>
  seek(u * MAP_W, v * MAP_H, 12, 3, (_d, top, expo) => top - 6 * Math.max(0, expo - 2.5));

/**
 * A content beacon's pyre settles onto the flattest ground within 8 units of
 * its spot (a steep flank would leave its platform standing on stilts). The
 * lighting checks keep the content position; a few units never matter there.
 */
const settle = (x: number, z: number) => seek(x, z, 8, 2, (d, _top, expo) => -expo - 0.1 * d);

let chainMemo: { src: Beacon[]; chain: ChainLink[] } | null = null;

/**
 * The whole chain in lighting order (Minas Tirith first): the content beacons
 * plus the canonical beacons they lack, every pyre on its footing. Memoised
 * on the content array — the footing searches cost about ten milliseconds.
 */
export function beaconChain(beacons: Beacon[]): ChainLink[] {
  if (chainMemo?.src === beacons) return chainMemo.chain;
  const links: { link: ChainLink; rank: number }[] = [];
  const named = new Set(beacons.map((b) => fold(b.name)));
  const canonRank = (x: number, z: number, name: string) => {
    const i = CANON.findIndex((c) => fold(c.name) === fold(name));
    if (i >= 0) return i;
    // a beacon the admin named afresh slots in beside its nearest canon spot
    let best = 0;
    let bd = Infinity;
    CANON.forEach((c, j) => {
      const d = Math.hypot(toWorldX(c.u) - x, toWorldZ(c.v) - z);
      if (d < bd) {
        bd = d;
        best = j;
      }
    });
    return best + 0.5;
  };
  for (const b of beacons) {
    const x = toWorldX(b.x);
    const z = toWorldZ(b.y);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const p = settle(x, z);
    links.push({ link: { key: `b${b.id}`, name: b.name, x: p.x, z: p.z, contentId: b.id }, rank: canonRank(x, z, b.name) });
  }
  CANON.forEach((c, i) => {
    if (named.has(fold(c.name))) return;
    const p = perch(c.u, c.v);
    // never stack scenery on a content beacon an admin has moved here
    if (links.some(({ link: l }) => l.contentId !== null && Math.hypot(l.x - p.x, l.z - p.z) < 25)) return;
    links.push({ link: { key: `canon-${i}`, name: c.name, x: p.x, z: p.z, contentId: null }, rank: i });
  });
  const chain = links.sort((a, b) => a.rank - b.rank).map((e) => e.link);
  chainMemo = { src: beacons, chain };
  return chain;
}

/** Every content beacon lit (and there is at least one). */
export function allBeaconsLit(lit: Record<number, boolean>, beacons: Beacon[]) {
  return beacons.length > 0 && beacons.every((b) => lit[b.id]);
}

/**
 * Which fires may burn, read by Beacons.tsx every frame. `hold` keeps the
 * scenery dark between the last beacon catching and the cinematic starting;
 * during the cinematic `upTo` lets the chain ignite link by link.
 */
export const chainFire = { hold: false, upTo: Infinity };

// ── the overlay's view of a cinematic ───────────────────────────────────────

export interface CineCaption {
  id: number;
  kicker?: string;
  text: string;
  sub?: string;
  /** set in italic Fell, as a line of verse */
  verse?: boolean;
}

interface CineUI {
  /** letterbox and skip are up */
  active: "beacons" | "finale" | null;
  /** the finale's closing scroll is open */
  scroll: boolean;
  /** full-screen black, for cuts */
  veil: boolean;
  caption: CineCaption | null;
  /** the beacon flight's fuse: every name in the chain, and how many burn */
  chain: string[];
  lit: number;
}

export const useCine = create<CineUI>()(() => ({
  active: null,
  scroll: false,
  veil: false,
  caption: null,
  chain: [],
  lit: 0,
}));

let captionSeq = 0;
export const caption = (c: Omit<CineCaption, "id">): CineCaption => ({ ...c, id: ++captionSeq });

/** Seconds the veil takes to close — the overlay's CSS fade matches it. */
export const VEIL_S = 0.45;

/** Requests from the overlay to the player in the Canvas. */
export const cineCtl = { skip: false };

let finishing = false;

/**
 * End the running cinematic gracefully: fade to black, hand the camera back
 * while nothing is visible, then run `after` (open the raven, the Red Book…).
 * On the cover there is no world behind it to hide, so it ends at once.
 */
export function finishCinematic(after?: () => void) {
  if (finishing) return;
  const end = () => {
    finishing = false;
    useGame.getState().setCinematic(null);
    after?.();
  };
  if (useGame.getState().phase !== "map") return end();
  finishing = true;
  useCine.setState({ veil: true });
  setTimeout(end, VEIL_S * 1000);
}
