"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/state/store";

const SEEN_KEY = "there-and-back-again-rotate-hint";

/** One-time nudge for portrait phones — the world is composed for landscape. */
export function OrientationHint() {
  const phase = useGame((s) => s.phase);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SEEN_KEY)) return;
    const mq = matchMedia("(orientation: portrait) and (pointer: coarse)");
    const upd = () => setShow(mq.matches);
    upd();
    mq.addEventListener("change", upd);
    return () => mq.removeEventListener("change", upd);
  }, []);

  if (!show || phase !== "map") return null;

  const dismiss = () => {
    sessionStorage.setItem(SEEN_KEY, "1");
    setShow(false);
  };

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: "calc(150px + env(safe-area-inset-bottom))",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "rgba(24,16,7,.88)",
        border: "1px solid #7a5f2a",
        borderRadius: 2,
        padding: "10px 12px 10px 16px",
        zIndex: 24,
        pointerEvents: "auto",
        maxWidth: "94vw",
        animation: "fadeIn .6s",
      }}
    >
      <span style={{ fontSize: 18, color: "#e2c682" }}>⟳</span>
      <span style={{ fontSize: 14, fontStyle: "italic", color: "#c7b485" }}>Turn your device — Middle-earth is wide</span>
      <button
        onClick={dismiss}
        className="cinzel"
        style={{
          background: "none",
          border: "1px solid #4a3a18",
          borderRadius: 2,
          color: "#c7b485",
          fontSize: 12,
          padding: "6px 10px",
          cursor: "pointer",
        }}
      >
        ✕
      </button>
    </div>
  );
}
