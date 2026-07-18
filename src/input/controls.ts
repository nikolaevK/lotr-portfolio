"use client";

/**
 * Keyboard + touch input, written into one mutable record that the
 * three.js loop reads every frame (no React state on the hot path).
 */
export const input = {
  x: 0, // -1..1 strafe (A/D)
  y: 0, // -1..1 forward axis on the map plane (W/S)
  boost: false,
  fire: false,
  // analog stick (touch) overrides keys when active
  stickActive: false,
  stickX: 0,
  stickY: 0,
};

const keys: Record<string, boolean> = {};

function recompute() {
  let x = 0;
  let y = 0;
  if (keys["a"] || keys["arrowleft"]) x -= 1;
  if (keys["d"] || keys["arrowright"]) x += 1;
  if (keys["w"] || keys["arrowup"]) y -= 1;
  if (keys["s"] || keys["arrowdown"]) y += 1;
  input.x = x;
  input.y = y;
  input.boost = !!keys["shift"];
  input.fire = !!keys["f"] || !!keys[" "];
}

export interface InputCallbacks {
  onEscape?: () => void;
  onOverview?: () => void;
  onAnyMove?: () => void;
}

export function attachKeyboard(cb: InputCallbacks) {
  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName ?? "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const k = e.key.toLowerCase();

    if (e.type === "keydown" && k === "escape") {
      cb.onEscape?.();
      return;
    }
    if (e.type === "keydown" && k === "m") {
      cb.onOverview?.();
      return;
    }
    if (
      ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift", "f", " "].includes(k)
    ) {
      if (k !== "shift") e.preventDefault();
      keys[k] = e.type === "keydown";
      if (e.type === "keydown" && ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        cb.onAnyMove?.();
      }
      recompute();
    }
  };
  const blur = () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    recompute();
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  window.addEventListener("blur", blur);
  return () => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKey);
    window.removeEventListener("blur", blur);
  };
}

/** Effective movement axes (touch stick wins over keys). */
export function moveAxes(): { x: number; y: number } {
  if (input.stickActive) return { x: input.stickX, y: input.stickY };
  return { x: input.x, y: input.y };
}

export const mouse = { x: 0, y: 0 };

export function attachMouse() {
  const onMove = (e: MouseEvent) => {
    mouse.x = e.clientX / window.innerWidth - 0.5;
    mouse.y = e.clientY / window.innerHeight - 0.5;
  };
  window.addEventListener("mousemove", onMove);
  return () => window.removeEventListener("mousemove", onMove);
}
