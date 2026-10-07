"use client";

import { EDGE, MAP_W, MAP_H, toWorldX, toWorldZ } from "@/data/content";
import { content } from "@/state/content";
import { runtime } from "@/game/runtime";
import { useGame } from "@/state/store";
import { audio } from "@/audio/engine";

/** Fly the dragon to a region (marker / quest-log click — concept parity). */
export function travelTo(regionId: string) {
  const r = content().regions.find((x) => x.id === regionId);
  if (!r) return;
  audio.sfx("tick");
  useGame.setState({ questOpen: false });
  if (useGame.getState().phase !== "map") return;
  runtime.autoTarget = { x: toWorldX(r.x), z: toWorldZ(r.y), id: r.id };
  if (runtime.cooldown === r.id) runtime.cooldown = null;
}

/** Fly to an arbitrary world position (minimap click). */
export function travelToPoint(x: number, z: number) {
  if (useGame.getState().phase !== "map") return;
  // the steed is held EDGE inside the map; a target beyond that is unreachable
  runtime.autoTarget = {
    x: Math.min(Math.max(x, EDGE.x), MAP_W - EDGE.x),
    z: Math.min(Math.max(z, EDGE.z), MAP_H - EDGE.z),
  };
}
