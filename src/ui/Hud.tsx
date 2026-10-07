"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useContent, xpEarned, xpMax } from "@/state/content";
import { useGame } from "@/state/store";

const btnStyle: React.CSSProperties = {
  background: "rgba(24,16,7,.88)",
  border: "1px solid #7a5f2a",
  color: "#e2c682",
  fontSize: 13,
  letterSpacing: ".06em",
  padding: "9px 14px",
  cursor: "pointer",
  borderRadius: 2,
};

// laptop widths: the same bar, a size tighter, so it fits on one row
const mediumBtn: React.CSSProperties = {
  ...btnStyle,
  fontSize: 12,
  letterSpacing: ".04em",
  padding: "8px 9px",
  whiteSpace: "nowrap",
};

// phone buttons: one fixed height, no wrapping — uniform row whatever the label
const compactBtn: React.CSSProperties = {
  ...btnStyle,
  height: 44,
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  whiteSpace: "nowrap",
  fontSize: 11,
  letterSpacing: ".08em",
};

const CURSOR_ICONS: { id: string; title: string; icon: React.ReactNode }[] = [
  {
    id: "staff",
    title: "Gandalf's staff",
    icon: (
    <svg width="22" height="22" viewBox="0 0 32 32">
      <line x1="9" y1="29" x2="22" y2="7" stroke="#8a6f38" strokeWidth="3" strokeLinecap="round" />
      <circle cx="24" cy="5" r="4" fill="#fff3c4" stroke="#c9963c" strokeWidth="1.5" />
    </svg>
    ),
  },
  {
    id: "blade",
    title: "Strider's blade",
    icon: (
    <svg width="22" height="22" viewBox="0 0 32 32">
      <polygon points="16,1 20,20 16,29 12,20" fill="#cfd6da" stroke="#8a9096" strokeWidth="1" />
      <rect x="10" y="19" width="12" height="3" fill="#6b4d1e" />
      <rect x="14.5" y="22" width="3" height="8" fill="#4a2f14" />
    </svg>
    ),
  },
  {
    id: "ring",
    title: "The One Ring",
    icon: (
    <svg width="22" height="22" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="9" fill="none" stroke="#e8b923" strokeWidth="4" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="#fff3c4" strokeWidth="1" />
    </svg>
    ),
  },
  {
    id: "axe",
    title: "Dwarven axe",
    icon: (
    <svg width="22" height="22" viewBox="0 0 32 32">
      <line x1="11" y1="29" x2="20" y2="8" stroke="#6b4d1e" strokeWidth="3" strokeLinecap="round" />
      <polygon points="14,3 27,8 20,16 13,10" fill="#aeb6bc" stroke="#7d858c" strokeWidth="1" />
    </svg>
    ),
  },
  {
    id: "bow",
    title: "Elven bow",
    icon: (
    <svg width="22" height="22" viewBox="0 0 32 32">
      <path d="M9,3 Q27,16 9,29" fill="none" stroke="#8a6f38" strokeWidth="2.5" />
      <line x1="9" y1="3" x2="9" y2="29" stroke="#d8c493" strokeWidth="1" />
      <line x1="5" y1="16" x2="24" y2="16" stroke="#cfd6da" strokeWidth="1.5" />
      <polygon points="27,16 22,13.5 22,18.5" fill="#cfd6da" />
    </svg>
    ),
  },
];

const ICON = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "#e2c682", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** An open book — the Red Book codex. */
const BookIcon = () => (
  <svg {...ICON} aria-hidden>
    <path d="M12 6.5C10 5 7 4.6 3.5 5v13c3.5-.4 6.5 0 8.5 1.5 2-1.5 5-1.9 8.5-1.5V5C17 4.6 14 5 12 6.5z" />
    <path d="M12 6.5v13" />
  </svg>
);

/** A gate ring with a flight line through it — the flight trials. */
const TrialIcon = () => (
  <svg {...ICON} aria-hidden>
    <ellipse cx="13" cy="12" rx="5" ry="8" />
    <path d="M2 14.5l8-1.5M16.5 10.5L22 9.5" />
  </svg>
);

/** A compass rose — the quest guide. */
const CompassIcon = () => (
  <svg {...ICON} aria-hidden>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 5.5l2 6.5-2 6.5-2-6.5z" />
  </svg>
);

/** A camera — photo mode. */
const CameraIcon = () => (
  <svg {...ICON} aria-hidden>
    <path d="M3.5 8h4l1.5-2.5h6L16.5 8h4v11h-17z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);

/** The cursor picker — a row of five, or (on narrower screens) the active one
 *  with the rest in a drop-down, so the top bar never has to wrap. */
function CursorPicker({ folded }: { folded: boolean }) {
  const cursor = useGame((s) => s.cursor);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  // a drop-down: any press elsewhere closes it, and unfolding resets it
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => setOpen(false), [folded]);
  const box: React.CSSProperties = {
    display: "flex", gap: 4, background: "rgba(24,16,7,.88)", border: "1px solid #7a5f2a", padding: 6, borderRadius: 2, justifyContent: "center",
  };
  if (!folded) {
    return (
      <div style={box} role="group" aria-label="Choose your cursor">
        {CURSOR_ICONS.map((c) => (
          <CursorButton key={c.id} id={c.id} title={c.title}>{c.icon}</CursorButton>
        ))}
      </div>
    );
  }
  const active = CURSOR_ICONS.find((c) => c.id === cursor) ?? CURSOR_ICONS[2];
  return (
    <div
      ref={root}
      style={{ position: "relative" }}
      // Esc folds the drop-down and hands focus back to its trigger
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <div style={box} onClick={() => setOpen(!open)} title="Choose your cursor">
        <CursorButton
          ref={trigger}
          id={active.id}
          title={active.title}
          // a disclosure, not a menu: the drop-down is a row of plain buttons
          trigger={{ "aria-label": `Choose your cursor — current: ${active.title}`, "aria-expanded": open, "aria-controls": listId }}
        >
          {active.icon}
        </CursorButton>
      </div>
      {open && (
        <div
          id={listId}
          role="group"
          aria-label="Cursors"
          style={{ ...box, position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 2 }}
          onClick={() => {
            setOpen(false);
            trigger.current?.focus(); // a keyboard choice lands back on the trigger
          }}
        >
          {CURSOR_ICONS.map((c) => (
            <CursorButton key={c.id} id={c.id} title={c.title}>{c.icon}</CursorButton>
          ))}
        </div>
      )}
    </div>
  );
}

function CursorButton({
  id,
  title,
  trigger,
  ref,
  children,
}: {
  id: string;
  title: string;
  /** set on the folded picker's trigger, which opens the drop-down rather than choosing */
  trigger?: { "aria-label": string; "aria-expanded": boolean; "aria-controls": string };
  ref?: React.Ref<HTMLButtonElement>;
  children: React.ReactNode;
}) {
  const cursor = useGame((s) => s.cursor);
  const setCursor = useGame((s) => s.setCursor);
  const active = cursor === id;
  return (
    <button
      ref={ref}
      onClick={() => setCursor(id)}
      title={title}
      {...(trigger ?? { "aria-label": title, "aria-pressed": active })}
      style={{
        width: 34,
        height: 34,
        border: `1px solid ${active ? "#c9963c" : "#4a3a18"}`,
        background: active ? "rgba(201,150,60,.18)" : "transparent",
        cursor: "pointer",
        borderRadius: 2,
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}

export function Hud() {
  // subscribe only to what the HUD shows — a full-store subscription re-renders
  // this whole tree on every toast/cursor/panel change
  const s = useGame(
    useShallow((st) => ({
      phase: st.phase, visited: st.visited, pages: st.pages, beacons: st.beacons,
      tone: st.tone, mount: st.mount, overview: st.overview,
      quality: st.quality, muted: st.muted, weatherZone: st.weatherZone,
      caption: st.caption, voiceCaption: st.voiceCaption,
      toggleQuest: st.toggleQuest, toggleTone: st.toggleTone, setMount: st.setMount,
      toggleOverview: st.toggleOverview, toggleQuality: st.toggleQuality,
      toggleMute: st.toggleMute, setContact: st.setContact, questOpen: st.questOpen,
      setCodex: st.setCodex, setTrialsOpen: st.setTrialsOpen, setPhotoMode: st.setPhotoMode,
      guide: st.guide, toggleGuide: st.toggleGuide, activeTrial: st.activeTrial,
    })),
  );
  const [isTouch] = useState(() => typeof window !== "undefined" && matchMedia("(pointer: coarse)").matches);
  // phones get a folded HUD: progress and secondary buttons behind toggles
  // (tracks rotation, so a listener rather than init-once like isTouch).
  // Second query: landscape phones are ~850px WIDE but ~390px tall — width
  // alone would hand them the desktop layout with no vertical room for it.
  const [compact, setCompact] = useState(false);
  // laptop widths: the full bar, tightened, with the cursor picker folded
  const [medium, setMedium] = useState(false);
  // the narrowest phones (≤380 px) can't fit the book beside the quest log:
  // it moves to the top of the ⋯ menu
  const [narrow, setNarrow] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(max-width: 760px), (pointer: coarse) and (max-height: 520px)");
    const mm = matchMedia("(max-width: 1359px)");
    const mn = matchMedia("(max-width: 380px)");
    const upd = () => {
      setCompact(mq.matches);
      setMedium(mm.matches && !mq.matches);
      setNarrow(mn.matches);
    };
    upd();
    mq.addEventListener("change", upd);
    mm.addEventListener("change", upd);
    mn.addEventListener("change", upd);
    return () => {
      mq.removeEventListener("change", upd);
      mm.removeEventListener("change", upd);
      mn.removeEventListener("change", upd);
    };
  }, []);
  // the keyboard hint bar makes no sense on touch/phones — teach the map
  // gestures once, as a toast, the first time the map view opens
  useEffect(() => {
    // touch devices only — a narrow desktop window can't pinch or tap
    if (!s.overview || !isTouch) return;
    const key = "there-and-back-again-map-hint";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    useGame.getState().toast("THE MAP", "Drag to roam · pinch to zoom · tap a place for its tale");
  }, [s.overview, isTouch]);
  const c = useContent(
    useShallow((ct) => ({ regions: ct.regions, titles: ct.titles, lostPages: ct.lostPages, beacons: ct.beacons, xp: ct.xp })),
  );
  if (s.phase !== "map") return null;
  const bar = compact ? compactBtn : medium ? mediumBtn : btnStyle;

  const XP_MAX = xpMax(c);
  const xp = xpEarned({ visited: s.visited, pages: s.pages, beacons: s.beacons }, c);
  const count = Object.keys(s.visited).length;
  const pagesN = Object.keys(s.pages).length;
  const beaconsN = Object.keys(s.beacons).length;

  return (
    <>
      {/* top bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          // notch/home-bar clearance on viewport-fit=cover phones
          padding:
            "calc(16px + env(safe-area-inset-top)) calc(20px + env(safe-area-inset-right)) 16px calc(20px + env(safe-area-inset-left))",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          pointerEvents: "none",
          // above TouchControls (25): the open ⋯ menu must win taps over FIRE/SOAR
          zIndex: 26,
          animation: "fadeIn .8s",
        }}
      >
        <div style={{ pointerEvents: "auto", display: "flex", flexDirection: "column", gap: 8, maxWidth: compact ? "60vw" : medium ? 214 : "48vw" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={s.toggleQuest}
              title="Quest log"
              aria-label={`Quest log — ${count} of ${c.regions.length} lands charted`}
              aria-haspopup="dialog"
              aria-expanded={s.questOpen}
              className="cinzel hud-btn"
              style={compact ? compactBtn : { ...btnStyle, display: "flex", alignItems: "center", gap: 10, fontSize: 14, letterSpacing: ".1em", padding: "10px 16px", whiteSpace: "nowrap" }}
            >
              <span aria-hidden style={{ display: "inline-block", width: 10, height: 10, background: "#c9963c", transform: "rotate(45deg)", flex: "none" }} />
              {compact ? `${count}/${c.regions.length}` : `QUEST LOG · ${count} / ${c.regions.length}`}
            </button>
            {compact && !narrow && (
              <button onClick={() => s.setCodex(true)} className="cinzel hud-btn" style={{ ...compactBtn, width: 44, padding: 0 }} title="The Red Book" aria-label="The Red Book">
                <BookIcon />
              </button>
            )}
            {compact && (
              <button
                onClick={() => setStatsOpen(!statsOpen)}
                className="cinzel hud-btn"
                style={{ ...compactBtn, width: 44, padding: 0 }}
                title="Progress"
                aria-label="Progress"
                aria-expanded={statsOpen}
              >
                {statsOpen ? "▲" : "▼"}
              </button>
            )}
          </div>
          {/* the fast path: every chapter as a book, for readers in a hurry */}
          {!compact && (
            <button
              onClick={() => s.setCodex(true)}
              className="cinzel hud-btn"
              title="Read every chapter as a book (B)"
              style={{ ...btnStyle, display: "flex", alignItems: "center", gap: 9, fontSize: 13, letterSpacing: ".12em", padding: "8px 14px", whiteSpace: "nowrap", alignSelf: "flex-start" }}
            >
              <BookIcon />
              THE RED BOOK
            </button>
          )}
          {(!compact || statsOpen) && (
            // phones: one opaque panel, or the guide's ribbon shows through the chips
            <div style={compact ? { display: "flex", flexDirection: "column", gap: 8, background: "rgba(14,9,4,.95)", border: "1px solid #4a3a18", padding: 8, borderRadius: 2 } : { display: "contents" }}>
          {c.titles.length > 0 && (
            <div style={{ background: "rgba(24,16,7,.7)", border: "1px solid #4a3a18", padding: "5px 12px", fontSize: 14, fontStyle: "italic", color: "#b8a678", borderRadius: 2 }}>
              {c.titles[Math.min(count, c.titles.length - 1)]}
            </div>
          )}
          {/* XP bar */}
          <div style={{ background: "rgba(24,16,7,.7)", border: "1px solid #4a3a18", padding: "6px 12px 8px", borderRadius: 2 }}>
            <div className="cinzel" style={{ fontSize: 10, letterSpacing: ".18em", color: "#9c8a5e", marginBottom: 4 }}>
              XP {xp} / {XP_MAX}
            </div>
            <div style={{ height: 5, background: "#241708", borderRadius: 3, overflow: "hidden", border: "1px solid #3a2d14" }}>
              <div
                style={{
                  height: "100%",
                  width: `${XP_MAX > 0 ? Math.min(100, (xp / XP_MAX) * 100) : 0}%`,
                  background: "linear-gradient(90deg, #8a6420, #e8b95c)",
                  transition: "width .8s cubic-bezier(.22,1,.36,1)",
                }}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <div className="cinzel" style={{ background: "rgba(24,16,7,.7)", border: "1px solid #4a3a18", padding: "4px 10px", fontSize: 11, letterSpacing: ".12em", color: "#c7b485", borderRadius: 2 }}>
              LOST PAGES {pagesN}/{c.lostPages.length}
            </div>
            <div className="cinzel" style={{ background: "rgba(24,16,7,.7)", border: "1px solid #4a3a18", padding: "4px 10px", fontSize: 11, letterSpacing: ".12em", color: beaconsN > 0 ? "#e8b95c" : "#c7b485", borderRadius: 2 }}>
              BEACONS {beaconsN}/{c.beacons.length}
            </div>
          </div>
            </div>
          )}
        </div>

        <div style={{ pointerEvents: "auto", position: "relative", display: "flex", gap: medium ? 6 : 8, alignItems: "center", flexWrap: compact ? "nowrap" : "wrap", justifyContent: "flex-end" }}>
          {compact && (
            <>
              <button onClick={s.toggleOverview} className="cinzel hud-btn" style={compactBtn} title="The high aerial view">
                {s.overview ? "RIDE" : "MAP"}
              </button>
              <button
                onClick={() => s.setContact(true)}
                className="cinzel hud-btn"
                style={{ ...compactBtn, background: "#3d2b10", border: "1px solid #c9963c", color: "#ecd9a0" }}
                aria-label="Send a raven"
                aria-haspopup="dialog"
              >
                RAVEN
              </button>
              <button
                onClick={() => setMoreOpen(!moreOpen)}
                className="cinzel hud-btn"
                style={{ ...compactBtn, width: 44, padding: 0, fontSize: 15 }}
                title="More"
                aria-label="More"
                aria-expanded={moreOpen}
              >
                {moreOpen ? "✕" : "⋯"}
              </button>
            </>
          )}
          {(!compact || moreOpen) && (
            // phones: a menu anchored under the row, never fighting it for width;
            // desktop: display:contents keeps children in the original flex row
            <div
              style={
                compact
                  ? { position: "absolute", top: "calc(100% + 8px)", right: 0, width: 210, display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch", maxHeight: "calc(100vh - 160px)", overflowY: "auto" }
                  : { display: "contents" }
              }
            >
          {compact && narrow && (
            <button onClick={() => { setMoreOpen(false); s.setCodex(true); }} className="cinzel hud-btn" style={bar}>
              THE RED BOOK
            </button>
          )}
          <CursorPicker folded={medium} />
          <button onClick={s.toggleTone} className="cinzel hud-btn" style={bar}>
            {s.tone === "common" ? "COMMON TONGUE" : "ELVISH MODE"}
          </button>
          <button
            onClick={() => s.setMount(s.mount === "dragon" ? "eagle" : "dragon")}
            className="cinzel hud-btn"
            style={s.activeTrial ? { ...bar, opacity: 0.5, cursor: "not-allowed" } : bar}
            disabled={!!s.activeTrial}
            title={s.activeTrial ? "A course is flown on the steed it began with" : "Change your steed"}
          >
            STEED: {s.mount === "dragon" ? "DRAGON" : "EAGLE"}
          </button>
          {!compact && (
            <button onClick={s.toggleOverview} className="cinzel hud-btn" style={bar} title="The high aerial view (M)">
              {s.overview ? "RIDE ON" : "MAP VIEW"}
            </button>
          )}
          {/* trials and photo mode: icons on a desktop bar, words in the phone menu */}
          <button
            onClick={() => {
              setMoreOpen(false); // the phone menu would cover the trial's timer
              s.setTrialsOpen(true);
            }}
            className="cinzel hud-btn"
            style={compact ? bar : { ...bar, display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 8px" }}
            title="Flight trials (T)"
            aria-label="Flight trials"
          >
            {compact ? "FLIGHT TRIALS" : <TrialIcon />}
          </button>
          <button
            onClick={() => {
              setMoreOpen(false);
              s.setPhotoMode(true);
            }}
            className="cinzel hud-btn"
            style={compact ? bar : { ...bar, display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 8px" }}
            title="Photo mode (P)"
            aria-label="Photo mode"
          >
            {compact ? "PHOTO MODE" : <CameraIcon />}
          </button>
          {/* once the guide's × has closed it, this brings it back (tablets and
              phones have no G key) */}
          <button
            onClick={s.toggleGuide}
            className="cinzel hud-btn"
            style={compact ? bar : { ...bar, display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 8px", opacity: s.guide ? 1 : 0.6 }}
            title={`Quest guide: ${s.guide ? "on" : "off"} (G)`}
            aria-label="Quest guide"
            aria-pressed={s.guide}
          >
            {compact ? `GUIDE: ${s.guide ? "ON" : "OFF"}` : <CompassIcon />}
          </button>
          <button onClick={s.toggleQuality} className="cinzel hud-btn" style={bar} title="Render quality">
            DETAIL: {s.quality === "high" ? "HIGH" : "LOW"}
          </button>
          <button onClick={s.toggleMute} className="cinzel hud-btn" style={bar}>
            {s.muted ? "SOUND: OFF" : "SOUND: ON"}
          </button>
          {!compact && (
            <button
              onClick={() => s.setContact(true)}
              className="cinzel hud-btn"
              aria-haspopup="dialog"
              style={{ ...bar, background: "#3d2b10", border: "1px solid #c9963c", color: "#ecd9a0", letterSpacing: ".08em", padding: medium ? "8px 10px" : "9px 16px" }}
            >
              SEND A RAVEN
            </button>
          )}
            </div>
          )}
        </div>
      </div>

      {/* weather caption — lower on medium screens, where the bar can wrap
          to a second row below ~1010px */}
      <div
        style={{
          position: "absolute",
          top: `calc(${medium ? 118 : 78}px + env(safe-area-inset-top))`,
          left: "50%",
          transform: "translateX(-50%)",
          fontStyle: "italic",
          fontSize: 16,
          color: "#e8d9ab",
          textShadow: "0 2px 8px rgba(0,0,0,.85)",
          background: "rgba(20,13,6,.55)",
          padding: "5px 20px",
          borderRadius: 2,
          opacity: s.weatherZone === "clear" ? 0 : 1,
          transition: "opacity 1.6s",
          pointerEvents: "none",
          zIndex: 20,
          whiteSpace: "nowrap",
          maxWidth: "88vw",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {s.caption}
      </div>

      {/* movie-style subtitle while a voice line plays */}
      {s.voiceCaption && (
        <div
          style={{
            position: "absolute",
            bottom: 168,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 22,
            pointerEvents: "none",
            fontStyle: "italic",
            fontSize: 19,
            color: "#f2e7c8",
            textShadow: "0 2px 10px rgba(0,0,0,.95), 0 0 4px rgba(0,0,0,.8)",
            background: "rgba(10,6,2,.45)",
            padding: "6px 22px",
            borderRadius: 2,
            whiteSpace: "nowrap",
            maxWidth: "92vw",
            overflow: "hidden",
            textOverflow: "ellipsis",
            animation: "fadeIn .5s",
          }}
        >
          {s.voiceCaption}
        </div>
      )}

      {/* controls hint — keyboard-only, and phones get the gesture toast instead */}
      {!isTouch && !compact && (
        <div
          style={{
            position: "absolute",
            bottom: 18,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(24,16,7,.8)",
            border: "1px solid #4a3a18",
            padding: "7px 20px",
            fontSize: medium ? 13 : 15,
            color: "#c7b485",
            zIndex: 20,
            borderRadius: 2,
            pointerEvents: "none",
            // centred between the minimap and its mirror on the right, so it
            // never slides under the map on a laptop-width window
            maxWidth: "calc(100vw - 520px)",
            width: "max-content",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          {s.overview ? (
            <>
              Map view — drag to roam · scroll to zoom · hover a place for its tale ·{" "}
              <b className="cinzel" style={{ color: "#e2c682" }}>W A S D</b> glide ·{" "}
              <b className="cinzel" style={{ color: "#e2c682" }}>M</b> to ride on
            </>
          ) : (
            <>
              <b className="cinzel" style={{ color: "#e2c682" }}>W</b> soars ahead · <b className="cinzel" style={{ color: "#e2c682" }}>A D</b> wheel ·{" "}
              <b className="cinzel" style={{ color: "#e2c682" }}>S</b> eases up · <b className="cinzel" style={{ color: "#e2c682" }}>SHIFT</b> swifter ·{" "}
              <b className="cinzel" style={{ color: "#e2c682" }}>F</b> {s.mount === "dragon" ? "dragon-fire" : "eagle-cry"} ·{" "}
              <b className="cinzel" style={{ color: "#e2c682" }}>M</b> map view · <b className="cinzel" style={{ color: "#e2c682" }}>B</b> red book ·{" "}
              <b className="cinzel" style={{ color: "#e2c682" }}>T</b> trials · <b className="cinzel" style={{ color: "#e2c682" }}>P</b> photo ·{" "}
              <b className="cinzel" style={{ color: "#e2c682" }}>G</b> guide · Esc closes
            </>
          )}
        </div>
      )}
    </>
  );
}
