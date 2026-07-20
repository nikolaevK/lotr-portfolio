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

export default function App() {
  const cursor = useGame((s) => s.cursor);
  const escape = useGame((s) => s.escape);
  const toggleOverview = useGame((s) => s.toggleOverview);

  useEffect(() => {
    const offK = attachKeyboard({
      onEscape: () => escape(),
      onOverview: () => {
        if (useGame.getState().phase === "map") toggleOverview();
      },
      onAnyMove: () => {
        runtime.autoTarget = null;
      },
    });
    const offM = attachMouse();
    return () => {
      offK();
      offM();
    };
  }, [escape, toggleOverview]);

  // live content from Turso replaces the bundled fallback once fetched
  useEffect(() => {
    useContent.getState().hydrate();
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
      teleport: (u: number, v: number, heading?: number) => {
        runtime.pos.x = u * MAP_W;
        runtime.pos.z = v * MAP_H;
        runtime.vel.set(0, 0, 0);
        runtime.autoTarget = null;
        if (typeof heading === "number") runtime.heading = heading;
      },
      state: () => ({
        x: runtime.pos.x,
        z: runtime.pos.z,
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
