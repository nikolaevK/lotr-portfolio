"use client";

import { useGame } from "@/state/store";

/** The messenger raven — 2D overlay flight, ported from the concept. */
export function Raven() {
  const flying = useGame((s) => s.ravenFlying);
  if (!flying) return null;
  return (
    <div style={{ position: "absolute", width: 70, height: 40, zIndex: 60, animation: "ravenFly 2.4s ease-in forwards", pointerEvents: "none" }}>
      <div style={{ position: "absolute", top: 14, left: 22, width: 26, height: 10, background: "#141414", borderRadius: "60% 90% 40% 40%" }} />
      <div
        style={{
          position: "absolute",
          top: 2,
          left: 16,
          width: 22,
          height: 16,
          background: "#1c1c1c",
          clipPath: "polygon(100% 100%, 0 0, 60% 100%)",
          transformOrigin: "bottom center",
          animation: "ravenFlap .3s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 2,
          left: 34,
          width: 22,
          height: 16,
          background: "#1c1c1c",
          clipPath: "polygon(0 100%, 100% 0, 40% 100%)",
          transformOrigin: "bottom center",
          animation: "ravenFlap .3s ease-in-out infinite",
        }}
      />
    </div>
  );
}
