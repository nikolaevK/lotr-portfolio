"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGame, type GameState } from "@/state/store";
import { moveAxes } from "@/input/controls";
import {
  COURSES, bestKey, courseGates, formatTime, medalFor, trialLive, useTrial,
  type Course, type Medal, type Steed,
} from "@/game/trials";
import { reducedMotion } from "@/game/prefs";
import { PARCHMENT_BG, parchmentOverlay, EDGE_BURN } from "@/ui/parchment";
import { useDialog } from "@/ui/a11y";

const ACCENT = "#8a6420";
const INK = "#241a0c";
const FADED = "#6d5a33";
// tabular figures, so a running clock does not shuffle sideways
const FIGURES: React.CSSProperties = { fontFamily: "var(--font-garamond), serif", fontVariantNumeric: "tabular-nums lining-nums" };
const LABEL: React.CSSProperties = { fontSize: 10, letterSpacing: ".18em", color: "#9c8a5e" };

const MEDAL_TONES: Record<Medal, [string, string, string]> = {
  gold: ["#fff3c4", "#e8b923", "#8a6420"],
  silver: ["#ffffff", "#c9d1d6", "#68727a"],
  bronze: ["#f6d2a8", "#b8722c", "#5e3510"],
};
const MEDALS = ["gold", "silver", "bronze"] as const; // in the order of Course.medals
const MEDAL_NAME: Record<Medal, string> = { gold: "Gold", silver: "Silver", bronze: "Bronze" };
const STEED_NAME: Record<Steed, string> = { dragon: "dragon", eagle: "eagle" };
const CRY_MS = 1500;
const CARD_MS = 7000; // the finish card puts itself away after this long unattended

/** A panel over the flight — the finish card stands aside for it (Esc closes it first). */
const layered = (s: GameState) =>
  !!s.region || s.contactOpen || s.questOpen || s.codexOpen || s.photoMode || s.trialsOpen || s.cinematic !== null;

/** A struck medal on a short ribbon. */
function MedalIcon({ medal, size = 22 }: { medal: Medal; size?: number }) {
  const id = useId();
  const [hi, mid, lo] = MEDAL_TONES[medal];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flex: "none" }}>
      <defs>
        <radialGradient id={id} cx="38%" cy="34%" r="70%">
          <stop offset="0" stopColor={hi} />
          <stop offset=".55" stopColor={mid} />
          <stop offset="1" stopColor={lo} />
        </radialGradient>
      </defs>
      <path d="M7 1h4l2 7H9zM13 1h4l-2 7h-4z" fill="#7a2418" />
      <circle cx="12" cy="15" r="7.5" fill={`url(#${id})`} stroke={lo} strokeWidth=".8" />
      <circle cx="12" cy="15" r="5" fill="none" stroke={hi} strokeOpacity=".55" strokeWidth=".7" />
    </svg>
  );
}

/** Tracks a media query (rotation, window resizes). */
function useMedia(query: string) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = matchMedia(query);
    const upd = () => setOn(mq.matches);
    upd();
    mq.addEventListener("change", upd);
    return () => mq.removeEventListener("change", upd);
  }, [query]);
  return on;
}

/**
 * Where the in-flight panel goes: under the weather caption, which Hud.tsx
 * drops lower on laptop widths (same breakpoints); on a landscape phone there
 * is no room under the top bar, so it sits in the bar's empty middle — and
 * where that middle is narrow, without the best-to-beat. Narrow or short
 * screens get the one-row panel.
 */
function useLayout() {
  const compact = useMedia("(max-width: 760px), (pointer: coarse) and (max-height: 520px)");
  const inBar = useMedia("(pointer: coarse) and (max-height: 520px)");
  const medium = useMedia("(max-width: 1359px)");
  const narrow = useMedia("(max-width: 520px)");
  const tightBar = useMedia("(max-width: 719px)");
  const coarse = useMedia("(pointer: coarse)");
  return {
    top: inBar ? 10 : medium && !compact ? 160 : 122,
    slim: inBar || narrow,
    showTarget: !(inBar && tightBar),
    coarse,
  };
}

/** Flight trials: the course picker, the in-flight timer, the results. */
export function TrialHud() {
  const g = useGame(
    useShallow((s) => ({ trialsOpen: s.trialsOpen, activeTrial: s.activeTrial, phase: s.phase, layered: layered(s) })),
  );
  const t = useTrial(useShallow((s) => ({ phase: s.phase, result: s.result })));
  // a finish card is done with once the book of trials opens or the journey
  // starts over — it must not come back when the picker closes
  useEffect(() => {
    if (g.trialsOpen || g.phase !== "map") useTrial.setState({ result: null });
  }, [g.trialsOpen, g.phase]);
  if (g.phase !== "map") return null;
  const course = COURSES.find((c) => c.id === g.activeTrial);
  return (
    <>
      {course && t.phase !== "idle" && <FlightPanel course={course} />}
      {course && t.phase === "countdown" && <Countdown />}
      {course && t.phase === "racing" && <Cry text={course.cry} />}
      {g.trialsOpen && <Picker />}
      {t.result && !g.activeTrial && !g.layered && <Results />}
    </>
  );
}

/** Time, gates and the best to beat — plus the guide toward an unseen gate. */
function FlightPanel({ course }: { course: Course }) {
  const { top, slim, showTarget, coarse } = useLayout();
  const { passed, total } = useTrial(useShallow((s) => ({ passed: s.passed, total: s.total })));
  const steed = useGame((s) => s.mount);
  const best = useGame((s) => s.trialBest[bestKey(course.id, s.mount)]);
  const clock = useRef<HTMLSpanElement>(null);
  const arrow = useRef<HTMLDivElement>(null);

  // the clock and the guide follow the frame loop, not React
  useEffect(() => {
    let raf = 0;
    let shown = "";
    const tick = () => {
      const txt = formatTime(trialLive.elapsed);
      if (clock.current && txt !== shown) clock.current.textContent = shown = txt;
      const a = arrow.current;
      if (a) {
        // round the steed on an ellipse clear of the top bar and the panel;
        // a gate astern is shown on the side of the shorter turn
        const ang = Math.sign(trialLive.angle) * Math.min(Math.abs(trialLive.angle), Math.PI * 0.72);
        const rx = Math.min(innerWidth * 0.3, innerHeight * 0.42);
        const ry = innerHeight * 0.17;
        a.style.opacity = trialLive.guide ? "1" : "0";
        a.style.transform = `translate(-50%, -50%) translate(${Math.sin(ang) * rx}px, ${-Math.cos(ang) * ry}px) rotate(${ang}rad)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const target = best !== undefined ? { tag: "BEST", time: best } : { tag: "GOLD", time: course.medals[steed][0] };
  const x = coarse ? 44 : 32; // a thumb-sized target on touch screens
  return (
    <>
      <div
        role="timer"
        aria-label={`${course.name}: gate ${passed} of ${total}`}
        style={{
          position: "absolute",
          top: `calc(${top}px + env(safe-area-inset-top))`,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 21,
          display: "flex",
          alignItems: "center",
          gap: slim ? 12 : 16,
          padding: slim ? "3px 3px 3px 14px" : "6px 6px 6px 18px",
          background: "rgba(24,16,7,.86)",
          border: "1px solid #7a5f2a",
          outline: "1px solid rgba(201,150,60,.18)",
          outlineOffset: 2,
          borderRadius: 2,
          boxShadow: "0 8px 26px rgba(0,0,0,.45)",
          pointerEvents: "auto",
          whiteSpace: "nowrap",
          animation: "fadeIn .5s",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          {!slim && <span className="cinzel" style={LABEL}>{course.name.toUpperCase()}</span>}
          <span ref={clock} style={{ ...FIGURES, fontSize: slim ? 22 : 30, lineHeight: 1.05, color: "#f2dfa6", minWidth: slim ? 76 : 104 }}>
            0:00.00
          </span>
        </div>
        <Stat k="GATES" v={`${passed}/${total}`} slim={slim} />
        {showTarget && <Stat k={target.tag} v={formatTime(target.time)} slim={slim} dim />}
        <button
          onClick={() => useGame.getState().endTrial(null)}
          className="cinzel hud-btn"
          title="Abandon the trial (Esc)"
          aria-label="Abandon the trial"
          style={{ width: x, height: x, minHeight: 0, padding: 0, background: "transparent", border: "1px solid #4a3a18", color: "#c7b485", cursor: "pointer", borderRadius: 2, fontSize: 13, alignSelf: "center" }}
        >
          ✕
        </button>
      </div>
      {/* a chevron circling the steed, pointing to a gate behind or off to the side */}
      <div
        ref={arrow}
        aria-hidden
        style={{ position: "absolute", left: "50%", top: "50%", zIndex: 21, pointerEvents: "none", opacity: 0, transition: "opacity .35s", filter: "drop-shadow(0 0 6px rgba(255,190,80,.7))" }}
      >
        <svg width="46" height="46" viewBox="0 0 46 46">
          <circle cx="23" cy="23" r="21" fill="rgba(24,16,7,.45)" stroke="rgba(201,150,60,.55)" strokeWidth="1" />
          <path d="M12 25 L23 14 L34 25 M12 33 L23 22 L34 33" fill="none" stroke="#ffd98a" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </>
  );
}

function Stat({ k, v, slim, dim }: { k: string; v: string; slim: boolean; dim?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: slim ? "row" : "column", alignItems: slim ? "baseline" : "flex-start", gap: slim ? 6 : 0 }}>
      <span className="cinzel" style={LABEL}>{k}</span>
      <span style={{ ...FIGURES, fontSize: slim ? 16 : 19, color: dim ? "#c7b485" : "#ecd9a0" }}>{v}</span>
    </div>
  );
}

const bigNumeral: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  // under the panel, and on a short landscape phone still clear of the voice
  // subtitles (bottom: 168) below
  top: "min(30%, calc(100% - 290px))",
  textAlign: "center",
  lineHeight: 1,
  zIndex: 30,
  pointerEvents: "none",
  color: "#ffe4a0",
  // inked edge first, so the gold reads over bright sky and snow alike
  WebkitTextStroke: "1.5px rgba(58,34,8,.85)",
  textShadow: "0 2px 0 rgba(40,22,4,.9), 0 0 16px rgba(0,0,0,.55), 0 0 30px rgba(255,170,50,.7)",
};

/** 3 · 2 · 1, each numeral struck in and fading. */
function Countdown() {
  const count = useTrial((s) => s.count);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const still = reducedMotion();
    ref.current?.animate(
      [
        { transform: still ? "none" : "scale(1.7)", opacity: 0 },
        { transform: "scale(1)", opacity: 1, offset: 0.3 },
        { transform: still ? "none" : "scale(.94)", opacity: 0.15 },
      ],
      { duration: 980, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" },
    );
  }, [count]);
  return (
    <div ref={ref} className="cinzel" role="status" style={{ ...bigNumeral, fontSize: "clamp(72px, 15vh, 128px)", fontWeight: 700 }}>
      {count}
    </div>
  );
}

/**
 * The cry as the countdown ends — then it fades off. Timed from the run's own
 * start, so a HUD remounted after photo mode or a cinematic does not cry again.
 */
function Cry({ text }: { text: string }) {
  const goAt = useTrial((s) => s.goAt);
  const [over] = useState(() => performance.now() - goAt > CRY_MS);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (over) return;
    const anim = ref.current?.animate(
      [
        { transform: reducedMotion() ? "none" : "scale(1.35)", opacity: 0 },
        { transform: "scale(1)", opacity: 1, offset: 0.18 },
        { transform: "scale(1)", opacity: 1, offset: 0.6 },
        { transform: "scale(1)", opacity: 0 },
      ],
      { duration: CRY_MS, easing: "ease-out", fill: "forwards" },
    );
    if (anim) anim.currentTime = Math.max(0, performance.now() - goAt);
  }, [goAt, over]);
  if (over) return null;
  return (
    <div ref={ref} className="cinzel" role="status" style={{ ...bigNumeral, fontSize: "clamp(28px, 6.5vmin, 58px)", fontWeight: 700, letterSpacing: ".08em", padding: "0 16px" }}>
      {text}
    </div>
  );
}

/** A parchment sheet shared by the picker and the results (centred, or kept to the top). */
function Sheet({ children, width, top, ...rest }: { children: React.ReactNode; width: number; top?: boolean } & React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      {...rest}
      className="on-parchment"
      style={{
        width: `min(${width}px, 94vw)`,
        margin: top ? "0 auto auto" : "auto",
        border: "2px solid #6b5327",
        outline: "1px solid rgba(201,150,60,.4)",
        outlineOffset: 3,
        borderRadius: 3,
        boxShadow: "0 30px 80px rgba(0,0,0,.7)",
        color: INK,
        position: "relative",
        overflow: "hidden",
        isolation: "isolate",
        pointerEvents: "auto",
        animation: "riseIn .45s cubic-bezier(.22,1,.36,1)",
      }}
    >
      <div style={{ position: "absolute", inset: 0, zIndex: -1, background: PARCHMENT_BG, boxShadow: EDGE_BURN, filter: "url(#roughPaper)", pointerEvents: "none" }} />
      <div style={parchmentOverlay} />
      {children}
    </div>
  );
}

const sheetBtn: React.CSSProperties = {
  fontSize: 12.5,
  letterSpacing: ".14em",
  padding: "0 16px",
  minHeight: 44, // a thumb-sized target
  background: "#3d2b10",
  color: "#ecd9a0",
  border: "1px solid #c9963c",
  cursor: "pointer",
  borderRadius: 2,
  whiteSpace: "nowrap",
};
const quietBtn: React.CSSProperties = { ...sheetBtn, background: "transparent", color: "#4a3514", border: "1px solid rgba(107,83,39,.7)" };

/** The book of trials: every course, its medals and the rider's best — on the steed now ridden. */
function Picker() {
  const steed = useGame((s) => s.mount);
  const best = useGame((s) => s.trialBest);
  const close = () => useGame.getState().setTrialsOpen(false);
  const panel = useDialog<HTMLDivElement>(true, { modal: true });
  const id = useId();
  // lay the courses out while the book is read, so FLY starts without a hitch
  useEffect(() => {
    const t = setTimeout(() => COURSES.forEach(courseGates), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      onClick={close}
      style={{ position: "absolute", inset: 0, background: "rgba(8,5,2,.6)", zIndex: 50, display: "flex", overflowY: "auto", padding: "20px 12px", animation: "fadeIn .3s", pointerEvents: "auto" }}
    >
      <Sheet ref={panel} width={600} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div style={{ position: "relative", padding: "clamp(20px, 4vw, 30px) clamp(16px, 4.5vw, 36px) clamp(18px, 3vw, 26px)" }}>
          <button onClick={close} aria-label="Close" className="cinzel" style={{ position: "absolute", top: 6, right: 6, width: 44, height: 44, background: "none", border: "none", color: FADED, fontSize: 18, cursor: "pointer" }}>
            ✕
          </button>
          <div className="cinzel" style={{ fontSize: 12, letterSpacing: ".22em", color: ACCENT }}>TESTS OF WING</div>
          <h2 id={`${id}-title`} className="cinzel" style={{ fontWeight: 700, fontSize: "clamp(22px, 5vw, 27px)", margin: "6px 0 2px" }}>Flight Trials</h2>
          <div style={{ fontSize: 16, fontStyle: "italic", color: FADED, marginBottom: 14, textWrap: "pretty" }}>
            Thread the golden gates in order; the clock runs from the cry to the last gate. Medals and bests are the{" "}
            {STEED_NAME[steed]}&rsquo;s — each steed is timed apart.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {COURSES.map((c) => (
              <CourseRow key={c.id} course={c} steed={steed} best={best[bestKey(c.id, steed)]} />
            ))}
          </div>
        </div>
      </Sheet>
    </div>
  );
}

function CourseRow({ course, steed, best }: { course: Course; steed: Steed; best: number | undefined }) {
  const earned = best !== undefined ? medalFor(course, steed, best) : null;
  const times = course.medals[steed];
  return (
    <div style={{ position: "relative", border: "1px solid rgba(107,83,39,.45)", background: "rgba(255,248,226,.32)", borderRadius: 2, padding: "12px 14px 12px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px" }}>
      <div style={{ flex: "1 1 300px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span className="cinzel" style={{ fontWeight: 700, fontSize: 17 }}>{course.name}</span>
          <span className="cinzel" style={{ fontSize: 10.5, letterSpacing: ".16em", color: ACCENT }}>{course.gates.length} GATES</span>
        </div>
        <div style={{ fontSize: 15, fontStyle: "italic", color: FADED, lineHeight: 1.4, marginTop: 3, textWrap: "pretty" }}>{course.blurb}</div>
        <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
          {MEDALS.map((m, i) => (
            <span key={m} title={`${MEDAL_NAME[m]} on the ${STEED_NAME[steed]}: ${formatTime(times[i])} or better`} style={{ display: "inline-flex", alignItems: "center", gap: 4, ...FIGURES, fontSize: 14.5, color: "#3a2c14" }}>
              <MedalIcon medal={m} size={18} />
              {formatTime(times[i])}
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto" }}>
        <div style={{ textAlign: "right" }}>
          <div className="cinzel" style={{ fontSize: 10, letterSpacing: ".18em", color: ACCENT }}>BEST</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end", ...FIGURES, fontSize: 17 }}>
            {earned && <MedalIcon medal={earned} size={18} />}
            {best !== undefined ? formatTime(best) : "—"}
          </div>
        </div>
        <button onClick={() => useGame.getState().startTrial(course.id)} className="cinzel hud-btn" style={sheetBtn} aria-label={`Fly ${course.name}`}>
          FLY
        </button>
      </div>
    </div>
  );
}

/**
 * The finish: time, medal, best — and the way back to the start line. It is
 * not modal: it puts itself away when the rider flies on, or after a while
 * unattended, so it never sits centre-screen through the rest of the flight.
 */
function Results() {
  const result = useTrial((s) => s.result)!;
  const course = COURSES.find((c) => c.id === result.course)!;
  const { time, prev, medal, steed } = result;
  const record = prev !== undefined && time < prev;
  const short = useMedia("(max-height: 520px)");
  const again = useRef<HTMLButtonElement>(null);
  const panel = useDialog<HTMLDivElement>(true, { modal: false, initial: again });
  const id = useId();
  const dismiss = () => useTrial.setState({ result: null });
  const flyAgain = () => useGame.getState().startTrial(course.id);

  useEffect(() => {
    const card = panel.current;
    // Esc: the card is the top layer only when nothing else is open — read
    // before the store's own Esc handler (capture phase) closes that layer.
    // Enter flies again, but only from the page itself or the card: never
    // while typing elsewhere (the raven's letter) or with a panel open.
    const onKey = (e: KeyboardEvent) => {
      if (layered(useGame.getState())) return;
      const at = document.activeElement;
      if (e.key === "Escape") dismiss();
      else if (e.key === "Enter" && (!at || at === document.body || (card?.contains(at) && !(at instanceof HTMLButtonElement)))) {
        useGame.getState().startTrial(result.course);
      }
    };
    // flying on puts the card away — a fresh press, not the W still held
    // from the finish — and so does the clock, unless it is being read
    let released = false;
    let shown = 0;
    let last = performance.now();
    const watch = setInterval(() => {
      const now = performance.now();
      const attended = !!card && (card.matches(":hover") || card.contains(document.activeElement));
      if (!attended) shown += now - last;
      last = now;
      const thrust = -moveAxes().y;
      if (thrust < 0.1) released = true;
      if ((released && thrust > 0.3) || shown > CARD_MS) dismiss();
    }, 100);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      clearInterval(watch);
    };
  }, [panel, result.course]);

  const times = course.medals[steed];
  // the next medal up, as something to fly for
  const up = medal === "silver" ? 0 : medal === "bronze" ? 1 : medal === null ? 2 : null;
  const on = `on the ${STEED_NAME[steed]}`;
  const medalLine = medal ? (
    <div className="cinzel" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, letterSpacing: ".14em", fontWeight: 700, color: "#3a2c14" }}>
      <MedalIcon medal={medal} size={short ? 26 : 30} />
      {MEDAL_NAME[medal].toUpperCase()}
    </div>
  ) : (
    <div className="cinzel" style={{ fontSize: 13, letterSpacing: ".14em", color: FADED }}>NO MEDAL THIS TIME</div>
  );
  return (
    // on a short screen the card keeps to the top and stays compact, clear of
    // the toasts (bottom: 96) below
    <div style={{ position: "absolute", inset: 0, zIndex: 40, display: "flex", overflowY: "auto", padding: short ? "calc(62px + env(safe-area-inset-top)) 12px 12px" : "20px 12px", pointerEvents: "none" }}>
      <Sheet ref={panel} width={460} top={short} role="dialog" aria-labelledby={`${id}-title`} tabIndex={-1}>
        <div style={{ padding: short ? "8px 16px 9px" : "clamp(18px, 4vw, 26px) clamp(16px, 4.5vw, 28px) clamp(16px, 3vw, 22px)", textAlign: "center" }}>
          {/* on a short screen the line below already tells a record */}
          {!short && (
            <div className="cinzel" style={{ fontSize: 12, letterSpacing: ".22em", color: ACCENT }}>
              {record ? "A NEW RECORD IN THE BOOK" : "THE TRIAL IS FLOWN"}
            </div>
          )}
          <h2 id={`${id}-title`} className="cinzel" style={{ fontWeight: 700, fontSize: short ? 18 : 21, margin: short ? "2px 0 0" : "6px 0 2px" }}>{course.name}</h2>
          <div style={{ display: "flex", flexDirection: short ? "row" : "column", alignItems: "center", justifyContent: "center", gap: short ? 16 : 0 }}>
            <div style={{ ...FIGURES, fontSize: short ? 38 : 50, lineHeight: 1.1, color: INK, margin: short ? 0 : "4px 0 6px" }}>{formatTime(time)}</div>
            {medalLine}
          </div>
          <div style={{ fontSize: short ? 14.5 : 15.5, fontStyle: "italic", color: FADED, marginTop: short ? 2 : 6, textWrap: "balance" }}>
            {prev === undefined
              ? `Your first flight of it ${on}, set down in the Red Book.`
              : record
                ? `${(prev - time).toFixed(2)} s swifter than your old best ${on}.`
                : `Your best ${on} stands at ${formatTime(prev)}.`}
            {up !== null && <> {MEDAL_NAME[MEDALS[up]]} at {formatTime(times[up])}.</>}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: short ? 7 : 16 }}>
            <button ref={again} onClick={flyAgain} className="cinzel hud-btn" style={sheetBtn} title="Fly again (Enter)">
              FLY AGAIN
            </button>
            <button onClick={() => useGame.getState().setTrialsOpen(true)} className="cinzel hud-btn" style={quietBtn}>
              CHOOSE COURSE
            </button>
            <button onClick={dismiss} className="cinzel hud-btn" style={quietBtn} title="Close (Esc)">
              CLOSE
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
