"use client";

import { useId } from "react";
import { useShallow } from "zustand/react/shallow";
import { useContent } from "@/state/content";
import { useGame } from "@/state/store";
import { travelTo } from "@/game/actions";
import { runtime } from "@/game/runtime";
import { useDialog, leaveForFlight } from "@/ui/a11y";

export function QuestLog() {
  const s = useGame(
    useShallow((st) => ({
      visited: st.visited, pages: st.pages, beacons: st.beacons,
      tone: st.tone, questOpen: st.questOpen, weatherZone: st.weatherZone,
      toggleQuest: st.toggleQuest, resetJourney: st.resetJourney,
    })),
  );
  const REGIONS = useContent((c) => c.regions);
  const TITLES = useContent((c) => c.titles);
  const LOST_PAGES = useContent((c) => c.lostPages);
  const BEACONS = useContent((c) => c.beacons);
  const count = Object.keys(s.visited).length;
  const pagesN = Object.keys(s.pages).length;
  const beaconsN = Object.keys(s.beacons).length;
  // a side panel, not a modal: the steed flies on while it is open
  const panel = useDialog<HTMLDivElement>(s.questOpen, { modal: false });
  const titleId = useId();

  return (
    <div
      ref={panel}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      // slid off-screen when closed: out of the tab order and the reading order
      inert={!s.questOpen}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        right: 0,
        width: 340,
        maxWidth: "88vw",
        background: "linear-gradient(#1c1207, #150d05)",
        borderLeft: "2px solid #7a5f2a",
        zIndex: 30,
        pointerEvents: "auto",
        transform: s.questOpen ? "translateX(0)" : "translateX(105%)",
        transition: "transform .45s cubic-bezier(.22,1,.36,1)",
        display: "flex",
        flexDirection: "column",
        boxShadow: "-12px 0 40px rgba(0,0,0,.5)",
      }}
    >
      <div style={{ padding: "20px 22px 14px", borderBottom: "1px solid #4a3a18", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div id={titleId} className="cinzel" style={{ fontSize: 18, letterSpacing: ".12em", color: "#e2c682" }}>QUEST LOG</div>
          {TITLES.length > 0 && (
            <div style={{ fontSize: 14, fontStyle: "italic", color: "#b8a678", marginTop: 2 }}>{TITLES[Math.min(count, TITLES.length - 1)]}</div>
          )}
        </div>
        <button onClick={s.toggleQuest} aria-label="Close the quest log" style={{ background: "none", border: "1px solid #6b5327", color: "#c7b485", width: 30, height: 30, cursor: "pointer", fontSize: 15, borderRadius: 2 }}>
          ✕
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* each land is a button that flies you there */}
        <ul aria-label="Lands to chart" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {REGIONS.map((r) => {
            const visited = !!s.visited[r.id];
            return (
              <li key={r.id}>
                <button
                  onClick={() => {
                    leaveForFlight(); // off to that land: Space should breathe fire, not reopen the log
                    travelTo(r.id);
                  }}
                  // the land beneath the steed right now
                  aria-current={s.weatherZone === r.id ? "location" : undefined}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    font: "inherit",
                    color: "inherit",
                    border: `1px solid ${visited ? "#7a5f2a" : "#3a2d14"}`,
                    background: visited ? "rgba(201,150,60,.07)" : "rgba(0,0,0,.2)",
                    padding: "12px 14px",
                    cursor: "pointer",
                    borderRadius: 2,
                  }}
                >
                  {/* spans, not divs: a button holds phrasing content only */}
                  <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span className="cinzel" style={{ fontSize: 14, letterSpacing: ".05em", color: visited ? "#e2c682" : "#b3a174" }}>{r.place}</span>
                    <span className="cinzel" style={{ fontSize: 12, color: visited ? "#8fb870" : "#8f7d55", letterSpacing: ".08em" }}>
                      {visited ? "CHARTED" : "UNKNOWN"}
                    </span>
                  </span>
                  <span style={{ display: "block", fontSize: 14, color: "#a89670", marginTop: 3 }}>{r[s.tone].label}</span>
                  {visited && (
                    <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px dashed #4a3a18" }}>
                      <span
                        aria-hidden
                        className="cinzel"
                        style={{
                          width: 26,
                          height: 26,
                          border: "1px solid #c9963c",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: 13,
                          color: "#e2c682",
                          background: "radial-gradient(circle, #3d2b10, #1c1207)",
                          flex: "none",
                        }}
                      >
                        {r.glyph}
                      </span>
                      <span style={{ fontSize: 13, fontStyle: "italic", color: "#c9963c" }}>{r.artifact.name}</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {/* side quests */}
        <div style={{ border: "1px solid #3a2d14", background: "rgba(0,0,0,.2)", padding: "12px 14px", borderRadius: 2 }}>
          <div className="cinzel" style={{ fontSize: 13, letterSpacing: ".08em", color: pagesN === LOST_PAGES.length ? "#7fa860" : "#c7b485" }}>
            THE LOST PAGES · {pagesN}/{LOST_PAGES.length}
          </div>
          <div style={{ fontSize: 14, fontStyle: "italic", color: "#ad9b70", marginTop: 4 }}>
            Pages of the Red Book drift on the winds — fly through them to recover the tale.
          </div>
        </div>
        <div style={{ border: "1px solid #3a2d14", background: "rgba(0,0,0,.2)", padding: "12px 14px", borderRadius: 2 }}>
          <div className="cinzel" style={{ fontSize: 13, letterSpacing: ".08em", color: beaconsN === BEACONS.length ? "#7fa860" : "#c7b485" }}>
            LIGHT THE BEACONS · {beaconsN}/{BEACONS.length}
          </div>
          <div style={{ fontSize: 14, fontStyle: "italic", color: "#ad9b70", marginTop: 4 }}>
            Three pyres stand on the White Mountains west of Minas Tirith. Swoop close and strike with dragon-fire or the eagle&apos;s cry (<b>F</b>).
          </div>
        </div>
      </div>
      <div style={{ padding: "14px 22px", borderTop: "1px solid #4a3a18", fontSize: 14, color: "#ad9b70", fontStyle: "italic" }}>
        Chart all five lands to earn your final title.
        <button
          onClick={() => {
            if (confirm("Begin the journey anew? All charted lands, pages and beacons will be forgotten.")) {
              s.resetJourney();
              runtime.reset();
            }
          }}
          className="cinzel"
          style={{ display: "block", marginTop: 8, background: "none", border: "1px solid #4a3a18", color: "#ad9b70", fontSize: 11.5, letterSpacing: ".12em", padding: "6px 10px", cursor: "pointer", borderRadius: 2 }}
        >
          ↻ BEGIN A NEW JOURNEY
        </button>
      </div>
    </div>
  );
}
