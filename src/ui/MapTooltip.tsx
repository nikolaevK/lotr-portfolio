"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useGame } from "@/state/store";

/** Subtle parchment tooltip that follows the cursor over map-view places. */
export function MapTooltip() {
  const hover = useGame((s) => s.mapHover);
  const overview = useGame((s) => s.overview);
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef({ x: -9999, y: -9999 });

  const place = (el: HTMLDivElement) => {
    const pad = 18;
    const w = el.offsetWidth || 260;
    const x = Math.min(last.current.x + pad, window.innerWidth - w - 12);
    const y = Math.max(last.current.y - 14, 12);
    el.style.transform = `translate(${x}px, ${y}px)`;
  };

  // track the cursor only while in map view
  useEffect(() => {
    if (!overview) return;
    const onMove = (e: PointerEvent) => {
      last.current.x = e.clientX;
      last.current.y = e.clientY;
      if (ref.current) place(ref.current);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [overview]);

  // the div mounts after the pointermove that triggered the hover — seed its
  // position from the last known cursor coords or it flashes at the top-left
  useLayoutEffect(() => {
    if (hover && ref.current) place(ref.current);
  }, [hover]);

  if (!overview || !hover) return null;

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        maxWidth: 280,
        pointerEvents: "none",
        zIndex: 26,
        background: "rgba(24,16,7,.92)",
        border: "1px solid #7a5f2a",
        borderRadius: 2,
        padding: "9px 14px 10px",
        boxShadow: "0 8px 24px rgba(0,0,0,.5)",
        animation: "fadeIn .18s",
      }}
    >
      <div className="cinzel" style={{ fontSize: 12, letterSpacing: ".14em", color: "#e2c682" }}>
        {hover.title.toUpperCase()}
      </div>
      <div style={{ fontSize: 14, fontStyle: "italic", color: "#b8a678", marginTop: 3, lineHeight: 1.35 }}>
        {hover.text}
      </div>
    </div>
  );
}
