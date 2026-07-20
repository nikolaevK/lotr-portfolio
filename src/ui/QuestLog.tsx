"use client";

import { useShallow } from "zustand/react/shallow";
import { useContent } from "@/state/content";
import { useGame } from "@/state/store";
import { travelTo } from "@/game/actions";
import { runtime } from "@/game/runtime";

export function QuestLog() {
  const s = useGame(
    useShallow((st) => ({
      visited: st.visited, pages: st.pages, beacons: st.beacons,
      tone: st.tone, questOpen: st.questOpen,
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

  return (
    <div
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
          <div className="cinzel" style={{ fontSize: 18, letterSpacing: ".12em", color: "#e2c682" }}>QUEST LOG</div>
          {TITLES.length > 0 && (
            <div style={{ fontSize: 14, fontStyle: "italic", color: "#9c8a5e", marginTop: 2 }}>{TITLES[Math.min(count, TITLES.length - 1)]}</div>
          )}
        </div>
        <button onClick={s.toggleQuest} style={{ background: "none", border: "1px solid #6b5327", color: "#c7b485", width: 30, height: 30, cursor: "pointer", fontSize: 15, borderRadius: 2 }}>
          ✕
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        {REGIONS.map((r) => {
          const visited = !!s.visited[r.id];
          return (
            <div
              key={r.id}
              onClick={() => travelTo(r.id)}
              style={{
                border: `1px solid ${visited ? "#7a5f2a" : "#3a2d14"}`,
                background: visited ? "rgba(201,150,60,.07)" : "rgba(0,0,0,.2)",
                padding: "12px 14px",
                cursor: "pointer",
                borderRadius: 2,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div className="cinzel" style={{ fontSize: 14, letterSpacing: ".05em", color: visited ? "#e2c682" : "#8a794f" }}>{r.place}</div>
                <div className="cinzel" style={{ fontSize: 12, color: visited ? "#7fa860" : "#6b5a38", letterSpacing: ".08em" }}>
                  {visited ? "CHARTED" : "UNKNOWN"}
                </div>
              </div>
              <div style={{ fontSize: 14, color: "#a89670", marginTop: 3 }}>{r[s.tone].label}</div>
              {visited && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px dashed #4a3a18" }}>
                  <div
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
                  </div>
                  <div style={{ fontSize: 13, fontStyle: "italic", color: "#c9963c" }}>{r.artifact.name}</div>
                </div>
              )}
            </div>
          );
        })}

        {/* side quests */}
        <div style={{ border: "1px solid #3a2d14", background: "rgba(0,0,0,.2)", padding: "12px 14px", borderRadius: 2 }}>
          <div className="cinzel" style={{ fontSize: 13, letterSpacing: ".08em", color: pagesN === LOST_PAGES.length ? "#7fa860" : "#c7b485" }}>
            THE LOST PAGES · {pagesN}/{LOST_PAGES.length}
          </div>
          <div style={{ fontSize: 13, fontStyle: "italic", color: "#8a794f", marginTop: 4 }}>
            Pages of the Red Book drift on the winds — fly through them to recover the tale.
          </div>
        </div>
        <div style={{ border: "1px solid #3a2d14", background: "rgba(0,0,0,.2)", padding: "12px 14px", borderRadius: 2 }}>
          <div className="cinzel" style={{ fontSize: 13, letterSpacing: ".08em", color: beaconsN === BEACONS.length ? "#7fa860" : "#c7b485" }}>
            LIGHT THE BEACONS · {beaconsN}/{BEACONS.length}
          </div>
          <div style={{ fontSize: 13, fontStyle: "italic", color: "#8a794f", marginTop: 4 }}>
            Three pyres stand on the White Mountains west of Minas Tirith. Swoop close and strike with dragon-fire or the eagle&apos;s cry (<b>F</b>).
          </div>
        </div>
      </div>
      <div style={{ padding: "14px 22px", borderTop: "1px solid #4a3a18", fontSize: 13, color: "#8a794f", fontStyle: "italic" }}>
        Chart all five lands to earn your final title.
        <button
          onClick={() => {
            if (confirm("Begin the journey anew? All charted lands, pages and beacons will be forgotten.")) {
              s.resetJourney();
              runtime.reset();
            }
          }}
          className="cinzel"
          style={{ display: "block", marginTop: 8, background: "none", border: "1px solid #4a3a18", color: "#8a794f", fontSize: 11, letterSpacing: ".12em", padding: "6px 10px", cursor: "pointer", borderRadius: 2 }}
        >
          ↻ BEGIN A NEW JOURNEY
        </button>
      </div>
    </div>
  );
}
