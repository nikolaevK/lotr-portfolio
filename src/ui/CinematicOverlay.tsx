"use client";

import { useEffect, useId } from "react";
import { useShallow } from "zustand/react/shallow";
import { game, useGame } from "@/state/store";
import { useContent } from "@/state/content";
import { cineCtl, finishCinematic, useCine, VEIL_S } from "@/game/cinematics";
import { EDGE_BURN, GOLD_EMBOSS, LEATHER_BG, PARCHMENT_BG, parchmentOverlay } from "@/ui/parchment";
import { useDialog } from "@/ui/a11y";

const BAR = "clamp(44px, 11vh, 118px)";
const ACCENT = "#8a6420";
const INK = "#241a0c";
const FADED = "#6d5a33";

const CSS = `
@keyframes cineCaption { from { opacity: 0; transform: translateY(-10px) scale(.985); filter: blur(6px) } to { opacity: 1; transform: none; filter: none } }
@keyframes cineScroll { from { opacity: 0; transform: translateY(26px) scaleY(.9) } to { opacity: 1; transform: none } }
.cine-fuse { display: flex }
@media (max-width: 760px) { .cine-fuse { display: none } }
@media (max-width: 760px) { .cine-knob { display: none } }
.cine-cta { transition: filter .2s, transform .1s }
.cine-cta:hover { filter: brightness(1.12) }
.cine-cta:active { transform: translateY(1px) }
@media (prefers-reduced-motion: reduce) {
  .cine-bar { transition: none !important }
  .cine-caption, .cine-sheet { animation: fadeIn .4s both !important }
}
`;

/** Skip (or Esc): the finale's flight skips to its scroll; anything else ends gracefully. */
function skip() {
  const { active, scroll } = useCine.getState();
  if (active === "finale" && !scroll) cineCtl.skip = true;
  else finishCinematic();
}

/** Letterbox, captions and skip for cinematics; the finale's closing scroll. */
export function CinematicOverlay() {
  const ui = useCine();
  // voice lines' subtitles live in the HUD, which a cinematic hides
  const voice = useGame((s) => s.voiceCaption);
  const bars = ui.active !== null && !ui.scroll;
  const cap = bars ? ui.caption : null;

  // Esc is Skip while a cinematic plays — caught before the game's own Esc,
  // which would end it outright and throw the closing scroll away
  const active = ui.active !== null;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.repeat) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      skip();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active]);

  const barStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    height: BAR,
    background: "#050302",
    transition: "transform .8s cubic-bezier(.6,0,.2,1)",
    pointerEvents: "none",
    zIndex: 64,
  };

  return (
    <>
      <style>{CSS}</style>
      <div
        className="cine-bar"
        style={{
          ...barStyle,
          top: 0,
          transform: bars ? "none" : "translateY(-101%)",
          borderBottom: "1px solid rgba(201,150,60,.14)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {bars && ui.active === "beacons" && ui.chain.length > 0 && (
          <div className="cinzel cine-fuse" style={{ gap: 10, alignItems: "center", fontSize: 11.5, letterSpacing: ".16em" }}>
            {ui.chain.map((name, i) => (
              <span key={name + i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {i > 0 && <span style={{ color: i < ui.lit ? "#c9963c" : "#3e3222", fontSize: 7 }}>◆</span>}
                <span
                  style={{
                    color: i < ui.lit ? "#ffd58a" : "#5d4d33",
                    textShadow: i < ui.lit ? "0 0 10px rgba(255,140,40,.9)" : "none",
                    transition: "color .5s, text-shadow .5s",
                  }}
                >
                  {name.toUpperCase()}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div
        className="cine-bar"
        style={{
          ...barStyle,
          bottom: 0,
          transform: bars ? "none" : "translateY(101%)",
          borderTop: "1px solid rgba(201,150,60,.14)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {bars && (
          <button
            onClick={skip}
            className="cinzel hud-btn"
            title="Skip (Esc)"
            style={{
              position: "absolute",
              right: "calc(14px + env(safe-area-inset-right))",
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "auto",
              background: "rgba(24,16,7,.88)",
              border: "1px solid #7a5f2a",
              color: "#e2c682",
              fontSize: 12,
              letterSpacing: ".16em",
              padding: "0 16px",
              height: 36,
              borderRadius: 2,
              cursor: "pointer",
            }}
          >
            SKIP ›
          </button>
        )}
      </div>

      {/* read aloud as it changes, for whoever cannot watch it */}
      <div className="sr-only" role="status" aria-live="polite">
        {bars
          ? [cap?.kicker, cap?.text, cap?.sub, voice]
              .filter((t): t is string => !!t)
              .map((t) => (/[.!?…]$/.test(t) ? t : t + "."))
              .join(" ")
          : ""}
      </div>

      {bars && (cap || voice) && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            margin: "0 auto",
            width: "min(94vw, 980px)",
            // under the top bar: the bottom of the screen belongs to the toasts
            top: `calc(${BAR} + 3.5vh)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            zIndex: 66,
            pointerEvents: "none",
          }}
        >
          {cap && (
            <div
              key={cap.id}
              className="cine-caption"
              style={{
                width: "100%",
                padding: "10px 0 16px",
                textAlign: "center",
                background: "radial-gradient(ellipse 52% 62% at 50% 50%, rgba(0,0,0,.4), transparent 78%)",
                animation: "cineCaption .7s cubic-bezier(.2,.8,.2,1) both",
              }}
            >
              {cap.kicker && (
                <div className="cinzel" style={{ fontSize: "clamp(10.5px, 1.2vw, 13px)", fontWeight: 700, letterSpacing: ".3em", color: "#f0cf7f", textShadow: "0 1px 2px rgba(0,0,0,.9), 0 0 12px rgba(0,0,0,.85)" }}>
                  {cap.kicker}
                </div>
              )}
              <div
                className={cap.verse ? "fell" : "cinzel"}
                style={{
                  marginTop: 6,
                  fontSize: cap.verse ? "clamp(24px, 3.6vw, 40px)" : "clamp(28px, 5.2vw, 58px)",
                  fontWeight: cap.verse ? 400 : 700,
                  fontStyle: cap.verse ? "italic" : "normal",
                  letterSpacing: cap.verse ? ".01em" : ".05em",
                  lineHeight: 1.12,
                  color: "#fbeccb",
                  textShadow: "0 0 3px rgba(0,0,0,.8), 0 2px 14px rgba(0,0,0,.95), 0 0 26px rgba(255,140,40,.45)",
                  textWrap: "balance",
                }}
              >
                {cap.text}
              </div>
              {cap.sub && (
                <div style={{ marginTop: 8, fontStyle: "italic", fontSize: "clamp(14px, 1.6vw, 18px)", color: "#e8d6a8", textShadow: "0 2px 10px rgba(0,0,0,.95)", textWrap: "balance" }}>
                  {cap.sub}
                </div>
              )}
            </div>
          )}
          {/* the voice line's subtitle, as the HUD would show it */}
          {voice && (
            <div
              style={{
                maxWidth: "92vw",
                padding: "6px 20px",
                borderRadius: 2,
                background: "rgba(10,6,2,.5)",
                fontStyle: "italic",
                fontSize: "clamp(15px, 1.6vw, 19px)",
                color: "#f2e7c8",
                textAlign: "center",
                textShadow: "0 2px 10px rgba(0,0,0,.95)",
                animation: "fadeIn .5s",
              }}
            >
              {voice}
            </div>
          )}
        </div>
      )}

      {ui.active === "finale" && ui.scroll && <ClosingScroll leaving={ui.veil} />}

      {/* the cut to black between the world and a cinematic */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#000",
          opacity: ui.veil ? 1 : 0,
          transition: `opacity ${VEIL_S}s ease`,
          pointerEvents: "none",
          zIndex: 90,
        }}
      />
    </>
  );
}

/** A turned wooden rod with gilt finials, top and bottom of the scroll. */
function Rod() {
  const knob: React.CSSProperties = {
    position: "absolute",
    top: 1,
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: "radial-gradient(circle at 34% 28%, #eec171, #a06c26 48%, #5c3a14 78%, #3b220c)",
    boxShadow: "0 3px 7px rgba(0,0,0,.55), inset 0 -3px 5px rgba(0,0,0,.45), inset 0 2px 3px rgba(255,230,170,.35)",
  };
  return (
    <div style={{ position: "relative", height: 28, zIndex: 2, margin: "0 6px" }}>
      <div
        style={{
          position: "absolute",
          left: -12,
          right: -12,
          top: 3,
          height: 22,
          borderRadius: 11,
          background:
            "repeating-linear-gradient(90deg, rgba(30,16,4,.22) 0 2px, transparent 2px 9px, rgba(60,35,12,.16) 9px 12px, transparent 12px 21px), linear-gradient(#9a6b33 0%, #5c3a18 38%, #331d0a 58%, #6b4520 100%)",
          boxShadow: "0 4px 9px rgba(0,0,0,.45), inset 0 -7px 9px rgba(0,0,0,.5), inset 0 4px 5px rgba(255,225,170,.22)",
        }}
      />
      <div className="cine-knob" style={{ ...knob, left: -34 }} />
      <div className="cine-knob" style={{ ...knob, right: -34 }} />
    </div>
  );
}

function Flourish() {
  return (
    <svg viewBox="0 0 260 18" aria-hidden style={{ display: "block", width: 220, height: 15, margin: "4px auto 14px" }}>
      <defs>
        <linearGradient id="cineFlourish" gradientUnits="userSpaceOnUse" x1="8" y1="0" x2="252" y2="0">
          <stop offset="0" stopColor="#a8781e" stopOpacity="0" />
          <stop offset=".3" stopColor="#a8781e" />
          <stop offset=".5" stopColor="#e2c06d" />
          <stop offset=".7" stopColor="#a8781e" />
          <stop offset="1" stopColor="#a8781e" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M8,9 H112 M148,9 H252" stroke="url(#cineFlourish)" strokeWidth="1.2" fill="none" />
      <path d="M112,9 q6,-7 12,0 q-6,7 -12,0 M148,9 q-6,-7 -12,0 q6,7 12,0" stroke="#a8781e" strokeWidth="1.1" fill="none" />
      <path d="M130,2 L136,9 L130,16 L124,9 Z" fill="#c9963c" stroke="#8a6420" strokeWidth=".8" />
      <circle cx="130" cy="9" r="1.6" fill="#f4dc9a" />
    </svg>
  );
}

/** "There and Back Again": the last page of the journey, with the ways onward. */
function ClosingScroll({ leaving }: { leaving: boolean }) {
  const panel = useDialog<HTMLDivElement>(true, { modal: true });
  const titleId = useId();
  const phase = useGame((s) => s.phase);
  const progress = useGame(useShallow((s) => ({ visited: s.visited, pages: s.pages, beacons: s.beacons })));
  const c = useContent(
    useShallow((ct) => ({
      regions: ct.regions,
      lostPages: ct.lostPages,
      beacons: ct.beacons,
      titles: ct.titles,
      profile: ct.profile,
      resumeVariants: ct.resumeVariants,
    })),
  );

  const lands = c.regions.filter((r) => progress.visited[r.id]).length;
  const pages = c.lostPages.filter((p) => progress.pages[p.id]).length;
  const fires = c.beacons.filter((b) => progress.beacons[b.id]).length;
  const complete = lands === c.regions.length && pages === c.lostPages.length && fires === c.beacons.length;
  const title = c.titles.length ? c.titles[Math.min(lands, c.titles.length - 1)] : null;
  const resume = c.resumeVariants.find((v) => v.isDefault) ?? c.resumeVariants[0];
  const name = c.profile?.name ?? "Konstantin Nikolaev";
  const email = c.profile?.email ?? "konstantin@nikolaev.us";
  const onMap = phase === "map";

  const cta: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    padding: "9px 12px",
    fontSize: 12.5,
    letterSpacing: ".13em",
    borderRadius: 2,
    cursor: "pointer",
    textDecoration: "none",
    textAlign: "center",
  };
  const primary: React.CSSProperties = { ...cta, background: "#3d2b10", color: "#ecd9a0", border: "1px solid #c9963c", boxShadow: "0 3px 10px rgba(40,24,6,.35)" };
  const secondary: React.CSSProperties = { ...cta, background: "rgba(201,150,60,.12)", color: "#3a2c14", border: "1px solid rgba(138,100,32,.6)" };

  const ledger: [number, number, string][] = [
    [lands, c.regions.length, "LANDS CHARTED"],
    [pages, c.lostPages.length, "PAGES FOUND"],
    [fires, c.beacons.length, "BEACONS LIT"],
  ];

  return (
    <div
      // scrollable backdrop + margin:auto child, so a short landscape phone
      // can still reach every button
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 105,
        display: "flex",
        overflowX: "hidden",
        overflowY: "auto",
        padding: "18px 12px",
        background: "radial-gradient(ellipse at 50% 55%, rgba(8,5,2,.2), rgba(8,5,2,.72))",
        // it goes down with the world when a way onward is chosen
        opacity: leaving ? 0 : 1,
        transition: `opacity ${VEIL_S}s ease`,
        pointerEvents: leaving ? "none" : "auto",
        animation: "fadeIn .8s",
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="cine-sheet"
        style={{ width: "min(660px, 92vw)", margin: "auto", outline: "none", filter: "drop-shadow(0 30px 50px rgba(0,0,0,.7))", animation: "cineScroll 1s cubic-bezier(.2,.8,.2,1) both" }}>
        <Rod />
        <div style={{ position: "relative", margin: "-5px 0", isolation: "isolate", padding: "clamp(20px, 4vw, 30px) clamp(18px, 5.5vw, 46px)", color: INK, textAlign: "center" }}>
          {/* the paper frays at its edges; the words and buttons stay crisp */}
          <div style={{ position: "absolute", inset: 0, zIndex: -1, background: PARCHMENT_BG, boxShadow: EDGE_BURN, filter: "url(#roughPaper)", pointerEvents: "none" }} />
          <div style={{ ...parchmentOverlay, zIndex: -1 }} />

          <div className="cinzel" style={{ fontSize: 12, letterSpacing: ".26em", color: ACCENT }}>
            {complete ? "THE RED BOOK IS COMPLETE" : "FROM THE RED BOOK OF WESTMARCH"}
          </div>
          <h2 id={titleId} className="cinzel" style={{ fontWeight: 700, fontSize: "clamp(28px, 5.8vw, 40px)", lineHeight: 1.08, margin: "8px 0 5px", color: "#2c1f0d" }}>
            There and Back Again
          </h2>
          <div style={{ fontSize: 16, fontStyle: "italic", color: FADED, textWrap: "balance" }}>
            Being the record of one engineer’s road, from the Shire to the White City
          </div>
          <Flourish />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
            {ledger.map(([n, of, label]) => (
              <div key={label} style={{ padding: "6px 4px", border: "1px solid rgba(138,100,32,.45)", borderRadius: 2, background: "rgba(201,150,60,.08)" }}>
                <div className="cinzel" style={{ fontSize: 22, fontWeight: 700, color: "#2c1f0d" }}>
                  {n}<span style={{ fontSize: 14, color: FADED }}> / {of}</span>
                </div>
                <div className="cinzel" style={{ fontSize: 9.5, letterSpacing: ".14em", color: ACCENT, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {title && (
            <div style={{ background: LEATHER_BG, border: "1px solid #c9963c", borderRadius: 2, padding: "8px 14px", boxShadow: "inset 0 0 14px rgba(0,0,0,.5), 0 3px 8px rgba(40,24,6,.3)", marginBottom: 14 }}>
              <div className="cinzel" style={{ fontSize: 10, letterSpacing: ".3em", color: "#b8915a" }}>TITLE EARNED</div>
              <div className="cinzel" style={{ ...GOLD_EMBOSS, fontSize: "clamp(16px, 3.4vw, 20px)", fontWeight: 700, marginTop: 3, textWrap: "balance" }}>{title}</div>
            </div>
          )}

          <p style={{ margin: 0, fontSize: 16.5, lineHeight: 1.5, textAlign: "left", textWrap: "pretty" }}>
            Traveller, you have flown the whole of my road: the lecture halls of the Shire, long nights of study among
            the Elves, honest work in the Dwarf-halls, the hard miles through Mordor, and the White City, where I build
            today. Thank you for riding every league of it with me. The next chapter is unwritten — if your realm has a
            quest that needs a builder, I would be glad to hear of it.
          </p>
          <div className="fell" style={{ marginTop: 6, fontSize: 21, fontStyle: "italic", textAlign: "right", color: "#3a2c14" }}>
            — {name.split(" ")[0]}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginTop: 14 }}>
            {onMap ? (
              <button className="cinzel cine-cta" style={primary} onClick={() => finishCinematic(() => game().setContact(true))}>
                SEND A RAVEN
              </button>
            ) : (
              // a raven cannot leave a closed book — on the cover, the old road
              <a className="cinzel cine-cta" style={primary} href={`mailto:${email}`}>
                SEND A RAVEN
              </a>
            )}
            <button className="cinzel cine-cta" style={secondary} onClick={() => finishCinematic(() => game().setCodex(true))}>
              READ THE RED BOOK
            </button>
            {resume && (
              <a className="cinzel cine-cta" style={secondary} href={resume.path} target="_blank" rel="noreferrer" download>
                DOWNLOAD THE RÉSUMÉ
              </a>
            )}
            <button className="cinzel cine-cta" style={secondary} onClick={() => finishCinematic()}>
              {onMap ? "KEEP FLYING" : "CLOSE THE SCROLL"}
            </button>
          </div>
        </div>
        <Rod />
      </div>
    </div>
  );
}
