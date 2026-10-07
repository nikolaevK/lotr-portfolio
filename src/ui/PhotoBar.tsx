"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { audio } from "@/audio/engine";
import { reducedMotion } from "@/game/prefs";
import { runtime } from "@/game/runtime";
import { useGame } from "@/state/store";
import { LOOKS, captureFrame, cssFilter, lookById, photoSubject, usePhoto, type CamMode, type Look } from "@/three/PhotoMode";
import { LEATHER_BG, LEATHER_NOISE } from "@/ui/parchment";
import { composePostcard, placeName, postcardFile } from "@/ui/postcard";

const HOURS: [number, string][] = [
  [0, "Midnight"], [1, "Night"], [4.5, "First Light"], [5.5, "Dawn"], [7, "Morning"], [11, "Noon"],
  [13, "Afternoon"], [16.5, "Evening"], [17.5, "Dusk"], [19, "Nightfall"], [20.5, "Night"], [23, "Midnight"],
];

function hourName(h: number) {
  let word = HOURS[0][1];
  for (const [from, w] of HOURS) if (h >= from) word = w;
  const m = Math.round(h * 60) % 1440;
  return `${word} · ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/* ── the bar ─────────────────────────────────────────────────────────────── */

type DialId = "fov" | "roll" | "hour";

const DIALS: Record<DialId, { label: string; min: number; max: number; step: number; show: (v: number) => string }> = {
  fov: { label: "Field", min: 20, max: 90, step: 1, show: (v) => `${Math.round(v)}°` },
  // positive leans the camera to the right
  roll: { label: "Tilt", min: -30, max: 30, step: 0.5, show: (v) => (v === 0 ? "Level" : `${Math.abs(v)}° ${v > 0 ? "right" : "left"}`) },
  hour: { label: "Hour", min: 0, max: 24, step: 0.25, show: hourName },
};

function setDial(id: DialId, v: number, dragged: boolean) {
  // a soft detent at level for a dragged thumb (arrow keys step past it)
  if (id === "roll" && dragged && Math.abs(v) < 1.25) v = 0;
  if (id === "hour") runtime.dayLock = (v / 24) % 1; // PhotoMode lets go of it on exit
  usePhoto.setState(id === "fov" ? { fov: v } : id === "roll" ? { roll: v } : { hour: v });
}

const GOLD = "#e2c682";
const BTN: React.CSSProperties = {
  height: 34,
  padding: "0 11px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  background: "rgba(14,9,4,.6)",
  border: "1px solid #7a5f2a",
  color: GOLD,
  cursor: "pointer",
  borderRadius: 2,
  fontSize: 10.5,
  letterSpacing: ".14em",
  whiteSpace: "nowrap",
};
const LABEL: React.CSSProperties = { fontSize: 10, letterSpacing: ".2em", color: "#a8915c", textTransform: "uppercase" };
const VALUE: React.CSSProperties = { fontSize: 13.5, fontStyle: "italic", color: "#ecdcae", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 };
const WHISPER: React.CSSProperties = {
  fontStyle: "italic",
  fontSize: 15,
  color: "#e8d9ab",
  textShadow: "0 2px 8px rgba(0,0,0,.85)",
  background: "rgba(20,13,6,.6)",
  padding: "4px 16px",
  borderRadius: 2,
  textAlign: "center",
  maxWidth: "92vw",
  pointerEvents: "none",
};

const ICON = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const HideIcon = () => (
  <svg {...ICON} aria-hidden>
    <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M4 20L20 4" />
  </svg>
);
const CloseIcon = () => (
  <svg {...ICON} aria-hidden>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

// six iris blades: each runs from a corner of the inner hexagon, along the
// hexagon's edge direction, out to the rim
const BLADES = Array.from({ length: 6 }, (_, i) => {
  const a = (i * Math.PI) / 3;
  const px = 12 + 4.2 * Math.cos(a);
  const py = 12 + 4.2 * Math.sin(a);
  const dx = Math.cos(a + (2 * Math.PI) / 3);
  const dy = Math.sin(a + (2 * Math.PI) / 3);
  const b = (px - 12) * dx + (py - 12) * dy;
  const t = -b + Math.sqrt(b * b - (4.2 * 4.2 - 8.6 * 8.6));
  return `M${px.toFixed(2)} ${py.toFixed(2)}L${(px + dx * t).toFixed(2)} ${(py + dy * t).toFixed(2)}`;
}).join("");
const Aperture = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#2c1f0d" strokeWidth={1.5} strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="8.6" />
    <path d={BLADES} />
  </svg>
);

/** A little sample of what the look does to a sunlit landscape. */
const Swatch = ({ look }: { look: Look }) => (
  <span
    aria-hidden
    style={{
      position: "relative",
      width: 12,
      height: 12,
      flex: "none",
      borderRadius: "50%",
      overflow: "hidden",
      border: "1px solid rgba(0,0,0,.55)",
      background: "linear-gradient(135deg, #7da0d0 0%, #e8c27a 45%, #5f8a3e 72%, #8a3a2a 100%)",
      filter: cssFilter(look) || undefined,
    }}
  >
    {look.tint && (
      <span style={{ position: "absolute", inset: 0, background: look.tint.color, opacity: look.tint.alpha, mixBlendMode: "soft-light" }} />
    )}
  </span>
);

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  fill,
}: {
  label: string;
  value: T;
  options: { id: T; label: React.ReactNode; title?: string }[];
  onChange: (v: T) => void;
  /** stretch across the row, set tighter (the phone's looks) */
  fill?: boolean;
}) {
  return (
    // toggle buttons, not radios: arrow keys belong to the camera here
    <div role="group" aria-label={label} style={{ display: "flex", border: "1px solid #7a5f2a", borderRadius: 2, overflow: "hidden", flex: fill ? "1 1 auto" : "none" }}>
      {options.map((o, i) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            aria-pressed={on}
            title={o.title}
            onClick={() => onChange(o.id)}
            className="cinzel hud-btn"
            style={{
              ...BTN,
              ...(fill && { flex: "1 1 auto", padding: "0 5px", gap: 4, fontSize: 9.5, letterSpacing: ".05em" }),
              minWidth: 0,
              border: "none",
              borderLeft: i ? "1px solid #4a3a18" : "none",
              borderRadius: 0,
              background: on ? "linear-gradient(#6e4c1c, #3d2b10)" : "rgba(14,9,4,.55)",
              color: on ? "#f6e3a8" : "#a8915c",
              boxShadow: on ? "inset 0 1px 0 rgba(255,230,160,.22)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Slider({ id, value, tall }: { id: DialId; value: number; tall: boolean }) {
  const d = DIALS[id];
  const dragging = useRef(false);
  const release = (e: React.PointerEvent<HTMLInputElement>) => {
    dragging.current = false;
    // hand the keyboard back to the camera: the game ignores keys aimed at inputs
    e.currentTarget.blur();
  };
  return (
    <input
      type="range"
      aria-label={d.label}
      aria-valuetext={d.show(value).replace(" · ", ", ")}
      min={d.min}
      max={d.max}
      step={d.step}
      value={value}
      onPointerDown={() => (dragging.current = true)}
      onPointerUp={release}
      onPointerCancel={release}
      onChange={(e) => setDial(id, +e.target.value, dragging.current)}
      // the box is the hit area: roomy for a thumb
      style={{ width: "100%", margin: 0, height: tall ? 36 : 26, accentColor: "#c9963c", cursor: "pointer" }}
    />
  );
}

/** Fades in, lingers, fades away — remount (a new key) to say it again. */
function Whisper({ children, ms }: { children: React.ReactNode; ms: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], {
      duration: ms,
      fill: "forwards",
    });
  }, [ms]);
  return (
    <div ref={ref} style={{ ...WHISPER, opacity: 0 }}>
      {children}
    </div>
  );
}

function useMedia(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = matchMedia(query);
    const upd = () => setMatch(mq.matches);
    upd();
    mq.addEventListener("change", upd);
    return () => mq.removeEventListener("change", upd);
  }, [query]);
  return match;
}

const MODES: { id: CamMode; label: string; title: string }[] = [
  { id: "orbit", label: "ORBIT", title: "Circle the steed" },
  { id: "free", label: "FREE FLY", title: "Fly the camera anywhere" },
];

interface Postcard {
  url: string;
  file: File;
  place: string;
  share: boolean;
}

function Bar({ focusIn }: { focusIn: RefObject<boolean> }) {
  const p = usePhoto();
  // phones: the same breakpoints as the HUD's folded layout
  const compact = useMedia("(max-width: 760px), (pointer: coarse) and (max-height: 520px)");
  const short = useMedia("(max-height: 520px)");
  const [touch] = useState(() => matchMedia("(pointer: coarse)").matches);
  const [tab, setTab] = useState<DialId>("fov");
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<Postcard | null>(null);
  // what a screen reader hears when a capture lands (numbered, so a second
  // card of the same place is announced too)
  const [status, setStatus] = useState("");
  const taken = useRef(0);
  const flash = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  // photo mode can close while a postcard is still developing
  const alive = useRef(false);
  const look = lookById(p.look);

  useEffect(() => {
    alive.current = true;
    // opened from the keyboard: focus follows into the bar
    if (focusIn.current) toolbar.current?.querySelector("button")?.focus();
    return () => {
      alive.current = false;
    };
  }, [focusIn]);

  // H folds the bar away; map view, trials and the Red Book would pull the
  // camera out from under the shot, so their keys are held back here
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "h" && !e.repeat) usePhoto.setState((s) => ({ hidden: !s.hidden }));
      else if (k === "m" || k === "t" || k === "b") e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    if (!card) return;
    // a saved card bows out by itself; one waiting to be shared stays
    const t = card.share ? 0 : window.setTimeout(() => setCard(null), 5200);
    return () => {
      clearTimeout(t);
      URL.revokeObjectURL(card.url);
    };
  }, [card]);

  const capture = async () => {
    if (busy) return;
    setBusy(true);
    audio.sfx("shutter");
    if (!reducedMotion()) flash.current?.animate([{ opacity: 0.8 }, { opacity: 0 }], { duration: 450, easing: "ease-out" });
    let frame: HTMLCanvasElement | null = null;
    try {
      frame = await captureFrame();
      const { x, z, bearing } = photoSubject();
      const place = placeName(x, z);
      const now = new Date();
      // phones hand it to the share sheet (that needs a fresh tap) as a JPEG,
      // a fraction of the PNG's weight; elsewhere a PNG downloads at once
      const share = touch && !!navigator.canShare?.({ files: [new File([], "postcard.jpg", { type: "image/jpeg" })] });
      const blob = await composePostcard(frame, lookById(usePhoto.getState().look), place, bearing, now, share ? "image/jpeg" : "image/png");
      const file = postcardFile(blob, place, now);
      if (!share) download(file);
      if (!alive.current) return;
      setCard({ url: URL.createObjectURL(blob), file, place, share });
      const n = ++taken.current > 1 ? ` (${taken.current})` : "";
      setStatus(share ? `Postcard of ${place} ready to send${n}` : `Postcard of ${place} saved to your downloads${n}`);
    } catch {
      useGame.getState().toast("THE PLATE IS SPOILT", "That postcard could not be made — try once more");
    } finally {
      // WebKit frees canvas memory only on GC: give the frame's back now
      if (frame) frame.width = frame.height = 0;
      if (alive.current) setBusy(false);
    }
  };

  const share = async (file: File) => {
    try {
      await navigator.share({ files: [file], title: "A postcard from Middle-earth" });
    } catch {
      // the share sheet was dismissed
    }
  };

  const hint = touch
    ? p.mode === "orbit"
      ? "Drag to circle the steed · pinch to draw near"
      : "Drag to look · two fingers to drift · pinch to fly on"
    : p.mode === "orbit"
      ? "Drag to circle the steed · scroll to draw near · W A S D Q E nudge · H hides the bar · Esc returns"
      : "Drag to look · W A S D fly · Q E sink and rise · Shift for haste · H hides the bar · Esc returns";

  const modeSeg = <Segmented label="Camera" value={p.mode} options={MODES} onChange={(mode) => usePhoto.setState({ mode })} />;
  const lookSeg = (
    <Segmented
      label="Look"
      fill={compact}
      value={p.look}
      onChange={(id) => usePhoto.setState({ look: id })}
      options={LOOKS.map((l) => ({
        id: l.id,
        title: `${l.label} look`,
        label: (
          <>
            <Swatch look={l} />
            {l.label.toUpperCase()}
          </>
        ),
      }))}
    />
  );
  const tabs = (
    <Segmented
      label="Dial"
      value={tab}
      onChange={setTab}
      options={(Object.keys(DIALS) as DialId[]).map((id) => ({ id, label: DIALS[id].label.toUpperCase() }))}
    />
  );
  const actions = (
    <div style={{ display: "flex", gap: 6, flex: "none" }}>
      <button className="hud-btn" style={{ ...BTN, width: 34, padding: 0 }} onClick={() => usePhoto.setState({ hidden: true })} title="Hide the bar (H)" aria-label="Hide the bar">
        <HideIcon />
      </button>
      <button className="hud-btn" style={{ ...BTN, width: 34, padding: 0 }} onClick={() => useGame.getState().setPhotoMode(false)} title="Leave photo mode (Esc)" aria-label="Leave photo mode">
        <CloseIcon />
      </button>
    </div>
  );
  const seal = (
    <button
      onClick={capture}
      disabled={busy}
      className="hud-btn"
      title="Capture a postcard"
      aria-label="Capture a postcard"
      style={{
        width: compact ? 58 : 62,
        height: compact ? 58 : 62,
        flex: "none",
        padding: 0,
        borderRadius: "50%",
        cursor: busy ? "progress" : "pointer",
        background: "radial-gradient(circle at 36% 30%, #fbe7a6 0%, #d9a94e 38%, #a2731f 72%, #6b4810 100%)",
        border: "2px solid #2e1d08",
        boxShadow: "0 0 0 2px rgba(201,150,60,.45), 0 8px 22px rgba(0,0,0,.6), inset 0 -4px 8px rgba(60,30,0,.45), inset 0 3px 6px rgba(255,240,200,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: busy ? 0.7 : 1,
      }}
    >
      <Aperture size={compact ? 30 : 32} />
    </button>
  );
  const dialValue = (id: DialId) => (id === "fov" ? p.fov : id === "roll" ? p.roll : p.hour);
  const tabValue = <span style={{ ...VALUE, flex: "1 1 auto", textAlign: "right" }}>{DIALS[tab].show(dialValue(tab))}</span>;
  const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, minWidth: 0 };

  let body: React.ReactNode;
  if (!compact) {
    // two clusters, so a narrower window wraps them into two tidy rows
    const cluster: React.CSSProperties = { display: "flex", alignItems: "center", gap: 14 };
    body = (
      <>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "10px 22px", flex: "1 1 auto", minWidth: 0 }}>
          <div style={cluster}>
            {modeSeg}
            {(Object.keys(DIALS) as DialId[]).map((id) => (
              // a div, not a label: a click on the caption must not focus the input
              <div key={id} style={{ display: "flex", flexDirection: "column", gap: 2, width: id === "hour" ? 158 : 112 }}>
                <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span className="cinzel" style={LABEL}>
                    {DIALS[id].label}
                  </span>
                  <span style={VALUE}>{DIALS[id].show(dialValue(id))}</span>
                </span>
                <Slider id={id} value={dialValue(id)} tall={false} />
              </div>
            ))}
          </div>
          <div style={cluster}>
            {lookSeg}
            {actions}
          </div>
        </div>
        {seal}
      </>
    );
  } else if (short) {
    // landscape phone: two rows, the shutter at the thumb
    body = (
      <>
        <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={row}>
            {modeSeg}
            {tabs}
            <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column" }}>
              {tabValue}
              <Slider id={tab} value={dialValue(tab)} tall />
            </div>
          </div>
          <div style={row}>
            {lookSeg}
            {actions}
          </div>
        </div>
        {seal}
      </>
    );
  } else {
    // portrait phone: dials and shutter, then the looks across the full width
    body = (
      <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ ...row, justifyContent: "space-between" }}>
              {modeSeg}
              {actions}
            </div>
            <div style={row}>
              {tabs}
              {tabValue}
            </div>
            <Slider id={tab} value={dialValue(tab)} tall />
          </div>
          {seal}
        </div>
        <div style={row}>{lookSeg}</div>
      </div>
    );
  }

  return (
    <>
      {/* the look's colour wash over the live frame (the canvas carries its filter) */}
      {look.tint && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: look.tint.color,
            opacity: look.tint.alpha,
            mixBlendMode: "soft-light",
            pointerEvents: "none",
          }}
        />
      )}
      <div ref={flash} style={{ position: "absolute", inset: 0, background: "#fff6df", opacity: 0, pointerEvents: "none", zIndex: 29 }} />
      <div role="status" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap" }}>
        {status}
      </div>

      {p.hidden ? (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: "calc(24px + env(safe-area-inset-bottom))", display: "flex", justifyContent: "center", zIndex: 30 }}>
          <Whisper ms={2600}>{touch ? "Tap the frame to bring back the bar" : "Press H or click the frame to bring back the bar"}</Whisper>
        </div>
      ) : (
        <>
          {card && (
            <div style={{ position: "absolute", top: "calc(14px + env(safe-area-inset-top))", left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 31, pointerEvents: "none" }}>
              <div style={{ pointerEvents: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, animation: "toastIn .5s cubic-bezier(.22,1,.36,1)" }}>
                <img
                  src={card.url}
                  alt={`Postcard: ${card.place}`}
                  style={{
                    display: "block",
                    maxWidth: compact ? "min(64vw, 260px)" : 300,
                    maxHeight: short ? "36vh" : "40vh",
                    transform: "rotate(-1.5deg)",
                    filter: "drop-shadow(0 12px 22px rgba(0,0,0,.65))",
                  }}
                />
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {card.share ? (
                    <>
                      <button className="cinzel hud-btn" style={{ ...BTN, background: "#3d2b10", border: "1px solid #c9963c", color: "#ecd9a0" }} onClick={() => share(card.file)}>
                        SEND BY RAVEN
                      </button>
                      <button className="cinzel hud-btn" style={BTN} onClick={() => download(card.file)}>
                        SAVE
                      </button>
                    </>
                  ) : (
                    <span className="cinzel" style={{ ...BTN, cursor: "default", border: "1px solid #4a3a18" }}>
                      KEPT IN YOUR DOWNLOADS
                    </span>
                  )}
                  <button className="hud-btn" style={{ ...BTN, width: 34, padding: 0 }} onClick={() => setCard(null)} aria-label="Put the postcard away" title="Put it away">
                    <CloseIcon />
                  </button>
                </div>
              </div>
            </div>
          )}

          <div
            style={{
              position: "absolute",
              left: "env(safe-area-inset-left)",
              right: "env(safe-area-inset-right)",
              bottom: `calc(${compact ? 8 : 14}px + env(safe-area-inset-bottom))`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              padding: compact ? "0 8px" : "0 16px",
              zIndex: 30,
              pointerEvents: "none",
            }}
          >
            <Whisper key={p.mode} ms={7000}>
              {hint}
            </Whisper>
            <div
              ref={toolbar}
              role="toolbar"
              aria-label="Photo mode"
              style={{
                pointerEvents: "auto",
                position: "relative",
                width: compact ? "100%" : "max-content",
                maxWidth: "100%",
                display: "flex",
                alignItems: "center",
                gap: compact ? 10 : 16,
                padding: compact ? "8px 10px" : "10px 12px 10px 16px",
                background: `${LEATHER_NOISE}, ${LEATHER_BG}`,
                backgroundBlendMode: "multiply",
                backgroundSize: "220px 220px, cover",
                border: "1px solid #7a5f2a",
                borderRadius: 3,
                boxShadow: "0 14px 40px rgba(0,0,0,.65), inset 0 0 0 3px rgba(20,12,4,.5), inset 0 0 0 4px rgba(201,150,60,.26)",
                animation: "riseIn .5s cubic-bezier(.22,1,.36,1)",
              }}
            >
              {body}
            </div>
          </div>
        </>
      )}
    </>
  );
}

/** Photo mode controls and postcard capture. */
export function PhotoBar() {
  const on = useGame((s) => s.photoMode);
  // opened with Enter on a focused button (the HUD's camera): focus follows
  // into the bar, and back to that button on the way out
  const byKeyboard = useRef(false);
  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        if (s.photoMode === prev.photoMode) return;
        if (s.photoMode) {
          // the store changes before React unmounts the HUD: its button still has focus
          const a = document.activeElement;
          byKeyboard.current = a instanceof HTMLElement && a !== document.body && a.matches(":focus-visible");
        } else if (byKeyboard.current) {
          byKeyboard.current = false;
          // once React has put the HUD back
          setTimeout(() => {
            if (document.activeElement === document.body) document.querySelector<HTMLElement>('button[aria-label="Photo mode"]')?.focus();
          });
        }
      }),
    [],
  );
  return on ? <Bar focusIn={byKeyboard} /> : null;
}
