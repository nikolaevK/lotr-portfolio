"use client";

import { useEffect, useMemo } from "react";
import { Experience } from "@/three/Experience";
import { Overlay } from "@/ui/Overlay";
import { attachKeyboard, attachMouse } from "@/input/controls";
import { runtime } from "@/game/runtime";
import { useGame } from "@/state/store";
import { useContent } from "@/state/content";
import { CURSORS, MAP_W, MAP_H } from "@/data/content";
import { voice } from "@/audio/voice";
import { audio } from "@/audio/engine";
import { loadTerrainData } from "@/three/terrainData";
import { solidAt } from "@/three/obstacles";

export default function App() {
  const cursor = useGame((s) => s.cursor);
  const escape = useGame((s) => s.escape);
  const toggleOverview = useGame((s) => s.toggleOverview);

  useEffect(() => {
    const offK = attachKeyboard({
      onEscape: () => escape(),
      onOverview: () => {
        const g = useGame.getState();
        if (g.phase === "map" && !g.cinematic) toggleOverview();
      },
      onAnyMove: () => {
        // steering takes the reins from the autopilot — but in photo mode the
        // keys move the camera, and the journey resumes after
        if (!useGame.getState().photoMode) runtime.autoTarget = null;
      },
      onToggle: (k) => {
        const g = useGame.getState();
        if (g.cinematic) return;
        // the Red Book opens from the cover too — no flight needed to read it
        if (k === "b") return g.setCodex(!g.codexOpen);
        if (g.phase !== "map") return;
        // not over an open tale or the raven's letter — Esc those first
        if ((k === "p" || k === "t") && (g.region || g.contactOpen || g.codexOpen || g.trialsOpen)) return;
        if (k === "p") g.setPhotoMode(!g.photoMode);
        else if (k === "t" && !g.activeTrial) g.setTrialsOpen(!g.trialsOpen);
        else if (k === "g") g.toggleGuide();
      },
    });
    const offM = attachMouse();
    return () => {
      offK();
      offM();
    };
  }, [escape, toggleOverview]);

  // live content from Turso replaces the bundled fallback once fetched; the
  // terrain bake starts now too, so it is done while the cover is being read
  useEffect(() => {
    useContent.getState().hydrate();
    loadTerrainData();
  }, []);

  // auto quality: modest hardware starts low (user can toggle in HUD)
  useEffect(() => {
    const coarse = matchMedia("(pointer: coarse)").matches;
    const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
    if ((coarse || weak) && !localStorage.getItem("there-and-back-again-v1")) {
      useGame.setState({ quality: "low" });
    }
    // voice lines read mute state & publish subtitles through the store
    voice.bind({
      isMuted: () => useGame.getState().muted,
      onCaption: (c) => useGame.setState({ voiceCaption: c }),
      onDuck: (on) => audio.duck(on),
    });
    // tiny debug/demo hook: __lotr.teleport(u, v, heading?) in map fractions
    (window as unknown as { __lotr?: object }).__lotr = {
      teleport: (u: number, v: number, heading?: number, altitude?: number) => {
        runtime.pos.x = u * MAP_W;
        runtime.pos.z = v * MAP_H;
        runtime.vel.set(0, 0, 0);
        runtime.speed = 0;
        runtime.autoTarget = null;
        if (typeof heading === "number") runtime.heading = heading;
        if (typeof altitude === "number") runtime.pos.y = altitude;
      },
      state: () => ({
        x: runtime.pos.x,
        y: runtime.pos.y,
        z: runtime.pos.z,
        // height above the land or landmark below — what flight physics holds
        agl: runtime.pos.y - solidAt(runtime.pos.x, runtime.pos.z),
        bank: runtime.bank,
        heading: runtime.heading,
        speed: runtime.speed,
        overview: useGame.getState().overview,
      }),
    };
  }, []);

  const cursorCss = useMemo(() => {
    const c = CURSORS.find((x) => x.id === cursor);
    return c ? `url("${c.icon}") 6 4, auto` : "auto";
  }, [cursor]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0e0a06", overflow: "hidden", cursor: cursorCss }}>
      <Experience />
      <Overlay />
    </div>
  );
}
