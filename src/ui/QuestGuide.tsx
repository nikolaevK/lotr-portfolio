"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGame } from "@/state/store";
import { content, useContent } from "@/state/content";
import { runtime } from "@/game/runtime";
import { travelTo, travelToPoint } from "@/game/actions";
import { audio } from "@/audio/engine";
import { reducedMotion } from "@/game/prefs";
import { PARCHMENT_BG, parchmentOverlay } from "@/ui/parchment";
import {
  LEAGUE, bearingDeg, chooseObjective, leaguesText, pendingObjectives, windName, type Objective,
} from "@/game/guide";

type Layout = "corner" | "stack" | "landscape";

// The compass ribbon shows 180° of horizon. Its widths (useLayout) are
// multiples of 12 so the 15° ticks land on whole pixels.
const SPAN = 180;
const BAND_H = 26;
const IN_VIEW = 84; // degrees off-centre before the marker pins to an edge as "behind"
const EVAL_MS = 250; // re-pick the nearest objective this often, not every frame

// the eight winds over three full turns, so the strip slides without a seam
const WINDS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const TICKS = Array.from({ length: 24 }, (_, i) => ({ deg: i * 45, label: WINDS[i % 8] }));

const KIND_COLOR: Record<Objective["kind"], string> = { region: "#e8b95c", page: "#f4ecd8", beacon: "#ff8a3a" };

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Follow the HUD's own breakpoints (Hud.tsx) so the guide folds with it:
 *  desktop → card in the corner mirroring the minimap; phones and tablets →
 *  a slim pill under the ribbon; landscape phones → ribbon in the top bar's
 *  free middle and the pill between the thumb controls. */
function useLayout() {
  const [l, setL] = useState({ kind: "corner" as Layout, ribbonTop: 118, ribbonW: 420 });
  useEffect(() => {
    const compact = matchMedia("(max-width: 760px), (pointer: coarse) and (max-height: 520px)");
    const medium = matchMedia("(max-width: 1359px)");
    const touch = matchMedia("(pointer: coarse)");
    const landscape = matchMedia("(pointer: coarse) and (max-height: 520px)");
    const all = [compact, medium, touch, landscape];
    const upd = () => {
      const kind: Layout = landscape.matches ? "landscape" : compact.matches || touch.matches ? "stack" : "corner";
      // just under the weather caption, which the HUD drops to 118px on medium widths
      const mid = medium.matches && !compact.matches;
      const ribbonTop = kind === "landscape" ? 25 : mid ? 158 : 118;
      // narrower on laptops, where the HUD's left column reaches down past it
      const ribbonW = kind === "landscape" ? 240 : kind === "stack" ? 300 : mid ? 360 : 420;
      setL((p) => (p.kind === kind && p.ribbonTop === ribbonTop && p.ribbonW === ribbonW ? p : { kind, ribbonTop, ribbonW }));
    };
    upd();
    for (const m of all) m.addEventListener("change", upd);
    return () => {
      for (const m of all) m.removeEventListener("change", upd);
    };
  }, []);
  return l;
}

/** Ride for the objective: chapters by id (so the tale opens on arrival), the
 *  rest as plain map points. */
function ride(o: Objective) {
  if (o.regionId) return travelTo(o.regionId);
  audio.sfx("tick");
  travelToPoint(o.x, o.z);
}

const paper: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  background: PARCHMENT_BG,
  border: "2px solid #6b5327",
  borderRadius: 3,
  color: "#2b1a0a",
  textAlign: "left",
  cursor: "pointer",
  transition: "filter .15s",
};

// the card hangs like the minimap (same drop shadow), with burnt edges
const CARD_SHADOW = "0 10px 30px rgba(0,0,0,.55), inset 0 0 22px rgba(90,60,20,.38), inset 0 0 3px rgba(60,30,8,.5)";
const PILL_SHADOW = "0 6px 18px rgba(0,0,0,.5), inset 0 0 12px rgba(90,60,20,.4)";

const closeBtn: React.CSSProperties = {
  position: "absolute",
  background: "none",
  border: "none",
  color: "#6b4f22",
  fontSize: 17,
  lineHeight: 1,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

const glow = (e: React.PointerEvent<HTMLElement>, on: boolean) => {
  e.currentTarget.style.filter = on ? "brightness(1.07) saturate(1.1)" : "";
};

function Diamond({ kind, size = 9 }: { kind: Objective["kind"]; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        flex: "none",
        width: size,
        height: size,
        transform: "rotate(45deg)",
        background: KIND_COLOR[kind],
        border: "1px solid #3a2408",
      }}
    />
  );
}

/** Quest guide: the next objective on a parchment card (click to ride there)
 *  and a compass ribbon with its bearing. G or the × hides it. */
export function QuestGuide() {
  const s = useGame(
    useShallow((st) => ({
      // the map must be up, and nothing else may own the screen
      shown:
        st.phase === "map" && st.guide && !st.activeTrial && !st.region &&
        !st.codexOpen && !st.contactOpen && !st.trialsOpen,
      morphStart: st.morphStart,
      tone: st.tone,
      mount: st.mount,
      toggleGuide: st.toggleGuide,
    })),
  );
  const regions = useContent((c) => c.regions);
  const layout = useLayout();
  const [obj, setObj] = useState<Objective | null | undefined>(undefined);

  const objRef = useRef<Objective | null | undefined>(undefined);
  const stripRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const diamondRef = useRef<HTMLSpanElement>(null);
  const chevronRef = useRef<HTMLSpanElement>(null);
  const markTextRef = useRef<HTMLSpanElement>(null);
  const distRef = useRef<HTMLSpanElement>(null);
  const rideRef = useRef<HTMLSpanElement>(null);
  const layoutRef = useRef(layout);
  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // One rAF loop while shown: per-frame bearings go straight into the DOM;
  // React state changes only when the objective itself does. A layout effect,
  // so the first pick lands before paint and a stale objective never flashes.
  useLayoutEffect(() => {
    if (!s.shown) return;
    const reduced = reducedMotion();
    const evaluate = () => {
      const st = useGame.getState();
      const prev = objRef.current;
      const next = chooseObjective(
        pendingObjectives(st, content()),
        runtime.pos.x,
        runtime.pos.z,
        prev?.key ?? null,
        runtime.autoTarget,
      );
      if (prev === undefined || next?.key !== prev?.key || next?.kicker !== prev?.kicker) {
        objRef.current = next;
        setObj(next);
      }
    };
    evaluate();

    let raf = 0;
    let last = performance.now();
    let nextEval = last + EVAL_MS;
    let view = NaN; // eased facing, radians, heading convention
    // what the DOM shows now — text is rewritten only when these change
    let shownSig = -1;
    let shownRide = -1;
    let markEl: Element | null = null;
    let distEl: Element | null = null;
    let rideEl: Element | null = null;

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((t - last) / 1000, 0.1);
      last = t;
      if (t >= nextEval) {
        nextEval = t + EVAL_MS;
        evaluate();
      }
      const W = layoutRef.current.ribbonW;
      const ppd = W / SPAN;

      // rider view faces the steed's heading; the map view looks map-north.
      // Eased, so flipping between them swings the compass instead of jumping.
      const facing = useGame.getState().overview ? -Math.PI / 2 : runtime.heading;
      view = Number.isNaN(view) || reduced ? facing : view + wrap(facing - view) * (1 - Math.exp(-10 * dt));
      const viewDeg = ((((view + Math.PI / 2) * 180) / Math.PI) % 360 + 360) % 360;
      const strip = stripRef.current;
      if (strip) strip.style.transform = `translateX(${(W / 2 - (viewDeg + 360) * ppd).toFixed(1)}px)`;

      const o = objRef.current;
      if (!o) return;
      const dx = o.x - runtime.pos.x;
      const dz = o.z - runtime.pos.z;
      const n = Math.max(1, Math.round(Math.hypot(dx, dz) / LEAGUE));
      const bearing = bearingDeg(dx, dz);
      const rel = ((bearing - viewDeg + 540) % 360) - 180; // + = to the right
      const side = Math.abs(rel) <= IN_VIEW ? 0 : rel < 0 ? 1 : 2; // 0 ahead, 1/2 behind-left/right
      const x = side === 0 ? W / 2 + rel * ppd : side === 1 ? 12 : W - 12;
      const marker = markerRef.current;
      if (marker) marker.style.transform = `translateX(${x.toFixed(1)}px)`;

      const wind = Math.round(bearing / 45) % 8;
      const sig = n * 32 + wind * 4 + side;
      const markText = markTextRef.current;
      const dist = distRef.current;
      // remounted elements (a new objective) start empty, so they force a write
      if (sig !== shownSig || markText !== markEl || dist !== distEl) {
        shownSig = sig;
        markEl = markText;
        distEl = dist;
        const chevron = chevronRef.current;
        const diamond = diamondRef.current;
        const lg = leaguesText(n);
        if (markText) {
          markText.textContent = side ? lg + " behind" : lg;
          // keep the label inside the ribbon when the marker is pinned to an edge
          markText.style.transform = side === 0 ? "translateX(-50%)" : side === 1 ? "translateX(-12px)" : "translateX(calc(-100% + 12px))";
        }
        if (chevron) {
          chevron.style.display = side ? "flex" : "none";
          chevron.style.transform = side === 2 ? "scaleX(-1)" : "none"; // drawn pointing left
        }
        if (diamond) diamond.style.display = side ? "none" : "block";
        if (dist) dist.textContent = layoutRef.current.kind === "corner" ? `${lg} ${windName(bearing)}` : lg;
      }

      // the card admits it when the steed is already on its way
      const at = runtime.autoTarget;
      const enRoute = at && Math.abs(at.x - o.x) < 1 && Math.abs(at.z - o.z) < 1 ? 1 : 0;
      const rideLabel = rideRef.current;
      if (rideLabel && (enRoute !== shownRide || rideLabel !== rideEl)) {
        shownRide = enRoute;
        rideEl = rideLabel;
        rideLabel.textContent = enRoute ? "RIDING…" : "RIDE ›";
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [s.shown]);

  if (!s.shown || obj === undefined) return null;

  // the first appearance waits for the map to finish rising; a new objective
  // (a remounted card) just fades in
  const delay = Math.max(0, Math.round(s.morphStart + 3200 - performance.now()));
  const enter: React.CSSProperties = reducedMotion() ? {} : { animation: `fadeIn .9s ease ${delay}ms both` };
  const corner = layout.kind === "corner";
  const W = layout.ribbonW;
  const ppd = W / SPAN;
  const tip = "Ride there — your steed knows the way · G hides or shows the guide";

  let sub: string | undefined;
  if (obj?.regionId) sub = regions.find((r) => r.id === obj.regionId)?.[s.tone].label;
  else if (obj?.kind === "beacon") sub = s.mount === "dragon" ? "Breathe fire upon its pyre (F)" : "Cry out above its pyre (F)";

  const close = (size: number, inset: number) => (
    <button
      onClick={s.toggleGuide}
      aria-label="Hide the quest guide"
      title="Hide the guide (G brings it back)"
      style={{ ...closeBtn, top: inset, right: inset, width: size, height: size }}
    >
      ×
    </button>
  );

  // ── the objective: a card in the corner, or a one-line pill on phones ──
  let card: React.ReactNode;
  if (corner) {
    card = (
      <div
        key={obj?.key ?? "done"}
        style={{
          position: "absolute",
          right: "calc(16px + env(safe-area-inset-right))",
          bottom: "calc(16px + env(safe-area-inset-bottom))",
          width: 212, // the minimap's width: the two frame the bottom corners
          zIndex: 20,
          pointerEvents: "auto",
          ...enter,
        }}
      >
        {obj ? (
          <button
            onClick={() => ride(obj)}
            onPointerEnter={(e) => glow(e, true)}
            onPointerLeave={(e) => glow(e, false)}
            // no aria-label: the card's own words (what, how far, which way) are its name
            title={tip}
            style={{ ...paper, display: "block", width: "100%", padding: "10px 14px 9px", boxShadow: CARD_SHADOW }}
          >
            <span style={parchmentOverlay} />
            <span className="cinzel" style={{ position: "relative", display: "flex", alignItems: "center", gap: 7, fontSize: 11, letterSpacing: ".16em", color: "#8c2e1e", paddingRight: 14 }}>
              <Diamond kind={obj.kind} size={7} />
              {obj.kicker}
            </span>
            <span style={{ position: "relative", display: "block", marginTop: 5, fontSize: 17, lineHeight: 1.18, fontWeight: 600, color: "#2b1a0a" }}>
              {obj.title}
            </span>
            {sub && (
              <span style={{ position: "relative", display: "block", marginTop: 3, fontSize: 14, lineHeight: 1.25, fontStyle: "italic", color: "#5e4520" }}>
                {sub}
              </span>
            )}
            <span style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginTop: 7, paddingTop: 6, borderTop: "1px solid rgba(107,83,39,.35)" }}>
              <span ref={distRef} style={{ fontSize: 13.5, fontStyle: "italic", color: "#4a3418", whiteSpace: "nowrap" }} />
              <span ref={rideRef} className="cinzel" style={{ fontSize: 11, letterSpacing: ".14em", color: "#8c2e1e", whiteSpace: "nowrap" }} />
            </span>
          </button>
        ) : (
          <div style={{ ...paper, cursor: "default", padding: "10px 14px 12px", boxShadow: CARD_SHADOW }}>
            <span style={parchmentOverlay} />
            <div className="cinzel" style={{ position: "relative", fontSize: 11, letterSpacing: ".16em", color: "#8c2e1e" }}>THE TALE IS TOLD</div>
            <div className="fell" style={{ position: "relative", marginTop: 5, fontSize: 18, lineHeight: 1.2, color: "#2b1a0a" }}>
              There and back again
            </div>
            <div style={{ position: "relative", marginTop: 4, fontSize: 14, lineHeight: 1.25, fontStyle: "italic", color: "#5e4520" }}>
              Every chapter charted, every page found, every beacon lit.
            </div>
          </div>
        )}
        {close(24, 3)}
      </div>
    );
  } else {
    const landscape = layout.kind === "landscape";
    card = (
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 20,
          ...(landscape
            ? { bottom: "calc(14px + env(safe-area-inset-bottom))" }
            : { top: `calc(${layout.ribbonTop + 50}px + env(safe-area-inset-top))` }),
        }}
      >
        <div
          key={obj?.key ?? "done"}
          style={{
            position: "relative",
            pointerEvents: "auto",
            // landscape: clear of the joystick (left) and FIRE/SOAR (right)
            maxWidth: landscape
              ? "calc(100vw - 408px - env(safe-area-inset-left) - env(safe-area-inset-right))"
              : "calc(100vw - 32px)",
            ...enter,
          }}
        >
          {obj ? (
            <button
              onClick={() => ride(obj)}
              aria-label={`${obj.title}. Ride there.`}
              title={tip}
              style={{ ...paper, display: "flex", alignItems: "center", gap: 8, maxWidth: "100%", height: 44, padding: "0 40px 0 12px", whiteSpace: "nowrap", boxShadow: PILL_SHADOW }}
            >
              <span style={parchmentOverlay} />
              <Diamond kind={obj.kind} />
              <span style={{ position: "relative", overflow: "hidden", textOverflow: "ellipsis", fontSize: 15, fontWeight: 600 }}>{obj.title}</span>
              <span ref={distRef} style={{ position: "relative", flex: "none", fontSize: 13, fontStyle: "italic", color: "#5a4220" }} />
            </button>
          ) : (
            <div className="fell" style={{ ...paper, cursor: "default", height: 44, display: "flex", alignItems: "center", padding: "0 40px 0 14px", fontSize: 16, whiteSpace: "nowrap", boxShadow: PILL_SHADOW }}>
              <span style={parchmentOverlay} />
              <span style={{ position: "relative" }}>There and back again — the tale is told</span>
            </div>
          )}
          {close(44, 0)}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* the compass ribbon — decorative; the card carries the same news */}
      {obj && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: `calc(${layout.ribbonTop}px + env(safe-area-inset-top))`,
            left: "50%",
            width: W,
            marginLeft: -W / 2,
            height: BAND_H + 18,
            pointerEvents: "none",
            zIndex: 20,
            ...enter,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: `0 0 auto 0`,
              height: BAND_H,
              overflow: "hidden",
              background: "rgba(20,13,6,.58)",
              borderTop: "1px solid rgba(201,150,60,.6)",
              borderBottom: "1px solid rgba(201,150,60,.6)",
              // the horizon fades out at both ends
              maskImage: "linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent)",
              WebkitMaskImage: "linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent)",
            }}
          >
            <div
              ref={stripRef}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                height: "100%",
                width: 3 * 360 * ppd,
                // a fine tick every 15°
                backgroundImage: "linear-gradient(90deg, rgba(226,198,130,.55) 0 1px, transparent 1px)",
                backgroundSize: `${15 * ppd}px 5px`,
                backgroundRepeat: "repeat-x",
                backgroundPosition: "0 100%",
                willChange: "transform",
              }}
            >
              {TICKS.map((t) => {
                const cardinal = t.label.length === 1;
                return (
                  <span
                    key={t.deg}
                    className="cinzel"
                    style={{
                      position: "absolute",
                      left: t.deg * ppd,
                      top: 0,
                      height: BAND_H - 4,
                      display: "flex",
                      alignItems: "center",
                      transform: "translateX(-50%)",
                      fontSize: cardinal ? 12 : 9,
                      fontWeight: cardinal ? 700 : 400,
                      letterSpacing: ".04em",
                      color: t.label === "N" ? "#e8b95c" : cardinal ? "#efe0b4" : "rgba(216,196,147,.75)",
                      textShadow: "0 1px 3px rgba(0,0,0,.85)",
                    }}
                  >
                    {t.label}
                  </span>
                );
              })}
            </div>
          </div>
          {/* where you face */}
          <span
            style={{
              position: "absolute",
              top: -1,
              left: W / 2 - 5,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: "6px solid #e2c682",
            }}
          />
          {/* the objective's marker, its distance beneath */}
          <div ref={markerRef} style={{ position: "absolute", top: 0, left: 0, willChange: "transform" }}>
            <span
              ref={diamondRef}
              style={{
                position: "absolute",
                left: -6,
                top: BAND_H / 2 - 6,
                width: 12,
                height: 12,
                transform: "rotate(45deg)",
                background: `linear-gradient(135deg, #fff6d8, ${KIND_COLOR[obj.kind]} 60%)`,
                border: "1px solid #3a2408",
                boxShadow: `0 0 10px ${KIND_COLOR[obj.kind]}`,
              }}
            />
            {/* "behind you": a double chevron at the edge, pointing the way to turn */}
            <span
              ref={chevronRef}
              style={{
                position: "absolute",
                left: -9,
                top: 0,
                width: 18,
                height: BAND_H,
                display: "none",
                alignItems: "center",
                justifyContent: "center",
                filter: `drop-shadow(0 0 4px ${KIND_COLOR[obj.kind]}) drop-shadow(0 1px 1px #000)`,
              }}
            >
              <svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke={KIND_COLOR[obj.kind]} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 2L3 7l5 5M14 2L9 7l5 5" />
              </svg>
            </span>
            <span
              ref={markTextRef}
              style={{
                position: "absolute",
                left: 0,
                top: BAND_H + 2,
                whiteSpace: "nowrap",
                fontSize: 12.5,
                lineHeight: "15px",
                fontStyle: "italic",
                color: "#f2e7c8",
                // a backing like the weather caption's: legible on a bright sky
                background: "rgba(20,13,6,.55)",
                padding: "0 6px",
                borderRadius: 2,
                textShadow: "0 1px 3px rgba(0,0,0,.9)",
              }}
            />
          </div>
        </div>
      )}
      {card}
      {/* a new objective is news worth hearing */}
      <span className="sr-only" aria-live="polite">
        {obj ? `Next: ${obj.title}` : ""}
      </span>
    </>
  );
}
