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
  rise: 0, // -1..1 (Q down / E up) — the photo-mode camera's vertical axis
  // analog stick (touch) overrides keys when active
  stickActive: false,
  stickX: 0,
  stickY: 0,
};

const keys: Record<string, boolean> = {};

const MOVE_KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
const HELD_KEYS = new Set([...MOVE_KEYS, "shift", "f", " ", "q", "e"]);

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
  input.rise = (keys["e"] ? 1 : 0) - (keys["q"] ? 1 : 0);
}

/** A field the visitor types into: every key but Esc belongs to it. */
function isField(el: Element | null) {
  return (
    !!el &&
    (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el as HTMLElement).isContentEditable)
  );
}

/** Focus rests on the page itself (or the canvas), not on any control. */
function onPage(el: Element | null) {
  return !el || el === document.body || el === document.documentElement || el.tagName === "CANVAS";
}

export interface InputCallbacks {
  onEscape?: () => void;
  onOverview?: () => void;
  onAnyMove?: () => void;
  /** single-key toggles: P photo mode, B the Red Book, T trials, G quest guide */
  onToggle?: (key: "p" | "b" | "t" | "g") => void;
}

export function attachKeyboard(cb: InputCallbacks) {
  const onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    // a release always counts, wherever focus went meanwhile — a key held
    // while a dialog took focus would otherwise stay pressed
    if (e.type === "keyup") {
      if (keys[k]) {
        keys[k] = false;
        recompute();
      }
      return;
    }
    // Esc backs out of everything, even mid-sentence in the raven's form
    if (k === "escape") {
      cb.onEscape?.();
      return;
    }
    const target = e.target as Element | null;
    // Cmd/Ctrl chords are the browser's (find, reload…); macOS also never
    // sends the keyup of a key released while Cmd is held
    if (isField(target) || e.ctrlKey || e.metaKey) return;

    if (k === "m") {
      cb.onOverview?.();
      return;
    }
    if (!e.repeat && (k === "p" || k === "b" || k === "t" || k === "g")) {
      cb.onToggle?.(k);
      return;
    }
    if (!HELD_KEYS.has(k)) return;
    // Space presses the focused button or link; it breathes fire only from the page
    if (k === " " && !onPage(target)) return;
    // the steed is frozen behind a modal: arrows and Space scroll its pages instead
    if (target?.closest('[aria-modal="true"]')) return;
    if (k !== "shift") e.preventDefault();
    keys[k] = true;
    if (MOVE_KEYS.has(k)) cb.onAnyMove?.();
    recompute();
  };
  // A mouse click leaves focus on the HUD button it pressed, and Space would
  // then press it again instead of breathing fire: hand focus back to the
  // page. Keyboard presses (detail 0), fields and modal dialogs keep theirs.
  const onClick = (e: MouseEvent) => {
    const el = document.activeElement;
    if (e.detail === 0 || !(el instanceof HTMLElement) || isField(el) || el.closest('[aria-modal="true"]')) return;
    el.blur();
  };
  const blur = () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    recompute();
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  window.addEventListener("click", onClick);
  window.addEventListener("blur", blur);
  return () => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKey);
    window.removeEventListener("click", onClick);
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
