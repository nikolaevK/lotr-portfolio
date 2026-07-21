"use client";

import { useEffect, useRef, useState } from "react";
import { input } from "@/input/controls";
import { useGame } from "@/state/store";

/** Virtual joystick + fire/boost buttons for coarse-pointer devices. */
export function TouchControls() {
  const phase = useGame((s) => s.phase);
  const [isTouch, setIsTouch] = useState(false);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);

  useEffect(() => {
    setIsTouch(matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    return () => {
      input.stickActive = false;
      input.stickX = 0;
      input.stickY = 0;
    };
  }, []);

  if (!isTouch || phase !== "map") return null;

  const R = 56;

  const setStick = (clientX: number, clientY: number) => {
    const base = baseRef.current;
    const knob = knobRef.current;
    if (!base || !knob) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = (clientX - cx) / R;
    let dy = (clientY - cy) / R;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    input.stickActive = true;
    input.stickX = dx;
    input.stickY = dy;
    knob.style.transform = `translate(${dx * R * 0.62}px, ${dy * R * 0.62}px)`;
  };

  const release = () => {
    pointerId.current = null;
    input.stickActive = false;
    input.stickX = 0;
    input.stickY = 0;
    if (knobRef.current) knobRef.current.style.transform = "translate(0px, 0px)";
  };

  const holdBtn = (key: "fire" | "boost"): React.HTMLAttributes<HTMLButtonElement> => ({
    onPointerDown: (e) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      input[key] = true;
    },
    onPointerUp: () => {
      input[key] = false;
    },
    onPointerCancel: () => {
      input[key] = false;
    },
  });

  return (
    <>
      {/* joystick — left */}
      <div
        ref={baseRef}
        onPointerDown={(e) => {
          pointerId.current = e.pointerId;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setStick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (pointerId.current === e.pointerId) setStick(e.clientX, e.clientY);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        style={{
          position: "absolute",
          left: "calc(22px + env(safe-area-inset-left))",
          bottom: "calc(26px + env(safe-area-inset-bottom))",
          width: R * 2,
          height: R * 2,
          borderRadius: "50%",
          background: "rgba(24,16,7,.5)",
          border: "2px solid #7a5f2a",
          zIndex: 25,
          pointerEvents: "auto",
          touchAction: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          ref={knobRef}
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 30%, #e2b25c, #7a5218)",
            border: "1px solid #4a3a18",
            pointerEvents: "none",
          }}
        />
      </div>
      {/* buttons — right */}
      <div style={{ position: "absolute", right: "calc(22px + env(safe-area-inset-right))", bottom: "calc(30px + env(safe-area-inset-bottom))", display: "flex", gap: 14, zIndex: 25, pointerEvents: "auto" }}>
        <button
          {...holdBtn("boost")}
          className="cinzel"
          style={{
            width: 74,
            height: 74,
            borderRadius: "50%",
            background: "rgba(24,16,7,.7)",
            border: "2px solid #7a5f2a",
            color: "#e2c682",
            fontSize: 12,
            letterSpacing: ".08em",
            touchAction: "none",
          }}
        >
          SOAR
        </button>
        <button
          {...holdBtn("fire")}
          className="cinzel"
          style={{
            width: 86,
            height: 86,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 30%, #8c2114, #4a0e06)",
            border: "2px solid #c9963c",
            color: "#f6d9b0",
            fontSize: 13,
            letterSpacing: ".08em",
            touchAction: "none",
          }}
        >
          FIRE
        </button>
      </div>
    </>
  );
}
