"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { VOICE_LINES, voice } from "@/audio/voice";
import { runtime } from "@/game/runtime";
import { morph } from "@/three/Terrain";
import { useGame } from "@/state/store";
import { toWorldX, toWorldZ } from "@/data/content";

/** Fires location voice-lines when the dragon enters a storied place. */
export function VoiceTriggers() {
  const inside = useRef(new Set<string>());
  const acc = useRef(0);

  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.4) return; // ~2.5 checks/sec is plenty
    acc.current = 0;

    const s = useGame.getState();
    if (s.phase !== "map" || morph.value < 0.8) return;

    for (const line of VOICE_LINES) {
      const d = Math.hypot(toWorldX(line.u) - runtime.pos.x, toWorldZ(line.v) - runtime.pos.z);
      if (d < line.radius) {
        if (!inside.current.has(line.id)) {
          inside.current.add(line.id);
          voice.playZone(line);
        }
      } else if (d > line.radius * 1.5) {
        inside.current.delete(line.id); // must leave before it can fire again
      }
    }
  });

  return null;
}
