"use client";

import { useEffect, useRef } from "react";
import { MAP_W, MAP_H, REGIONS, toWorldX, toWorldZ } from "@/data/content";
import { runtime } from "@/game/runtime";
import { useGame } from "@/state/store";
import { travelToPoint } from "@/game/actions";

const W = 208;
const H = 117;

export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phase = useGame((s) => s.phase);

  useEffect(() => {
    if (phase !== "map") return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.src = "/assets/map.jpg";

    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 100) return; // ~10 fps is plenty
      last = t;
      const st = useGame.getState();
      ctx.clearRect(0, 0, W, H);
      if (img.complete) ctx.drawImage(img, 0, 0, W, H);
      else {
        ctx.fillStyle = "#d8c493";
        ctx.fillRect(0, 0, W, H);
      }
      ctx.fillStyle = "rgba(20,13,6,.18)";
      ctx.fillRect(0, 0, W, H);
      // region dots
      for (const r of REGIONS) {
        const x = r.x * W;
        const y = r.y * H;
        ctx.beginPath();
        ctx.arc(x, y, 3.4, 0, Math.PI * 2);
        ctx.fillStyle = r.ring;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(0,0,0,.55)";
        ctx.stroke();
        if (st.visited[r.id]) {
          ctx.fillStyle = "#1a1208";
          ctx.font = "700 6px serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("✓", x, y + 0.5);
        }
      }
      // autopilot target
      if (runtime.autoTarget) {
        const x = (runtime.autoTarget.x / MAP_W) * W;
        const y = (runtime.autoTarget.z / MAP_H) * H;
        ctx.strokeStyle = "#e8b95c";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x - 4, y - 4);
        ctx.lineTo(x + 4, y + 4);
        ctx.moveTo(x + 4, y - 4);
        ctx.lineTo(x - 4, y + 4);
        ctx.stroke();
      }
      // the dragon
      const dx = (runtime.pos.x / MAP_W) * W;
      const dy = (runtime.pos.z / MAP_H) * H;
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(runtime.heading + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4.4, 5);
      ctx.lineTo(0, 2.4);
      ctx.lineTo(-4.4, 5);
      ctx.closePath();
      ctx.fillStyle = st.mount === "eagle" ? "#8a6432" : "#96201d";
      ctx.fill();
      ctx.strokeStyle = "#f4ecd8";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  if (phase !== "map") return null;

  return (
    <div
      className="minimap"
      style={{
        position: "absolute",
        left: 16,
        bottom: 16,
        zIndex: 20,
        pointerEvents: "auto",
        border: "2px solid #6b5327",
        borderRadius: 3,
        boxShadow: "0 10px 30px rgba(0,0,0,.6), inset 0 0 18px rgba(60,38,10,.55)",
        overflow: "hidden",
        cursor: "crosshair",
        animation: "fadeIn .8s",
      }}
      title="Click to send the dragon"
    >
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ display: "block" }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const u = (e.clientX - rect.left) / rect.width;
          const v = (e.clientY - rect.top) / rect.height;
          travelToPoint(u * MAP_W, v * MAP_H);
        }}
      />
    </div>
  );
}
