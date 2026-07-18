"use client";

import { useGame } from "@/state/store";

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div
      style={{
        position: "absolute",
        bottom: 70,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 70,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: "linear-gradient(#2b1c0a, #1c1207)",
            border: "1px solid #c9963c",
            padding: "10px 22px",
            borderRadius: 2,
            animation: "toastIn .4s cubic-bezier(.22,1,.36,1)",
            boxShadow: "0 10px 30px rgba(0,0,0,.6)",
            textAlign: "center",
          }}
        >
          <div className="cinzel" style={{ fontSize: 12, letterSpacing: ".2em", color: "#c9963c" }}>{t.kicker}</div>
          <div style={{ fontSize: 16, color: "#ecd9a0", marginTop: 2 }}>{t.msg}</div>
        </div>
      ))}
    </div>
  );
}
