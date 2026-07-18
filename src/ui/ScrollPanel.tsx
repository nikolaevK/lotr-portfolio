"use client";

import { REGIONS, XP } from "@/data/content";
import { useGame } from "@/state/store";
import { PARCHMENT_BG, parchmentOverlay, EDGE_BURN } from "@/ui/parchment";

/** The unrolling parchment scroll — ported from the concept's default panel style. */
export function ScrollPanel() {
  const regionId = useGame((s) => s.region);
  const isNew = useGame((s) => s.regionIsNew);
  const tone = useGame((s) => s.tone);
  const closePanel = useGame((s) => s.closePanel);

  const region = regionId ? REGIONS.find((r) => r.id === regionId) : null;
  if (!region) return null;

  const t = region[tone];
  const accent = "#8a6420";
  // turned wooden rod: grain streaks over a lathe-shaded cylinder
  const rollerBg =
    "repeating-linear-gradient(90deg, rgba(30,16,4,.22) 0 2px, transparent 2px 9px, rgba(60,35,12,.16) 9px 12px, transparent 12px 21px), linear-gradient(#9a6b33 0%, #5c3a18 38%, #331d0a 58%, #6b4520 100%)";

  const knob = (side: "left" | "right") => (
    <div style={{ position: "absolute", [side]: -36, top: 2, width: 26, height: 26 }}>
      {/* turned knob with a gold ferrule and end pin */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: "radial-gradient(circle at 34% 28%, #eec171, #a06c26 48%, #5c3a14 78%, #3b220c)",
          boxShadow: "0 3px 7px rgba(0,0,0,.55), inset 0 -3px 5px rgba(0,0,0,.45), inset 0 2px 3px rgba(255,230,170,.35)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 6,
          borderRadius: "50%",
          border: "1.5px solid rgba(244,220,154,.7)",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,.5)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 6,
          height: 6,
          marginLeft: -3,
          marginTop: -3,
          borderRadius: "50%",
          background: "radial-gradient(circle at 35% 30%, #f6e0a8, #8a5c10)",
        }}
      />
    </div>
  );

  const roller = (
    <div style={{ position: "relative", height: 30, zIndex: 3 }}>
      <div
        style={{
          position: "absolute",
          left: -16,
          right: -16,
          top: 3,
          height: 24,
          background: rollerBg,
          borderRadius: 12,
          boxShadow:
            "0 4px 9px rgba(0,0,0,.45), inset 0 -8px 10px rgba(0,0,0,.55), inset 0 5px 6px rgba(255,225,170,.22), inset 0 1px 1px rgba(255,240,200,.3)",
        }}
      />
      {knob("left")}
      {knob("right")}
    </div>
  );

  return (
    <div
      onClick={closePanel}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(8,5,2,.62)",
        zIndex: 40,
        pointerEvents: "auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeIn .3s",
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "min(680px, 94vw)", filter: "drop-shadow(0 36px 60px rgba(0,0,0,.75))" }}>
        {roller}
        <div style={{ overflow: "hidden", animation: "unrollH .95s cubic-bezier(.25,1,.4,1) both", maxHeight: "72vh", margin: "-6px 4px", position: "relative", zIndex: 1 }}>
          <div style={{ filter: "url(#roughPaper)" }}>
            <div
              style={{
                background: PARCHMENT_BG,
                position: "relative",
                boxShadow: EDGE_BURN,
              }}
            >
              <div style={parchmentOverlay} />
              {/* the curl of the roll: shaded bands where the parchment curves */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(90deg, rgba(70,45,15,.28), rgba(255,244,214,.14) 22px, transparent 44px), linear-gradient(270deg, rgba(70,45,15,.28), rgba(255,244,214,.14) 22px, transparent 44px), linear-gradient(180deg, rgba(60,38,12,.30), transparent 26px), linear-gradient(0deg, rgba(60,38,12,.30), transparent 26px)",
                  pointerEvents: "none",
                }}
              />
              <div style={{ position: "relative", maxHeight: "calc(72vh - 58px)", overflowY: "auto", padding: "36px 50px 30px", color: "#241a0c" }}>
                <div className="cinzel" style={{ fontSize: 13, letterSpacing: ".24em", color: accent, textAlign: "center" }}>
                  FROM THE RED BOOK · {region.place.toUpperCase()}
                </div>
                <h2 className="cinzel" style={{ fontWeight: 700, fontSize: 32, lineHeight: 1.15, margin: "12px 0 6px", textAlign: "center", color: "#2c1f0d", textWrap: "balance" }}>
                  {t.title}
                </h2>
                <div style={{ fontSize: 17, fontStyle: "italic", color: "#6d5a33", marginBottom: 16, textAlign: "center", textWrap: "pretty" }}>{t.sub}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
                  <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${accent})` }} />
                  <div style={{ color: accent, fontSize: 13 }}>✦</div>
                  <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${accent}, transparent)` }} />
                </div>
                {isNew && (
                  <div
                    className="cinzel"
                    style={{
                      display: "flex",
                      gap: 14,
                      justifyContent: "center",
                      marginBottom: 18,
                      padding: "10px 14px",
                      background: "rgba(201,150,60,.08)",
                      border: `1px dashed ${accent}`,
                      borderRadius: 2,
                      fontSize: 13,
                      letterSpacing: ".08em",
                      color: accent,
                      flexWrap: "wrap",
                    }}
                  >
                    <span>QUEST COMPLETE</span>
                    <span>·</span>
                    <span>+{XP.region} XP</span>
                    <span>·</span>
                    <span>LOOT: {region.artifact.name}</span>
                  </div>
                )}
                <ul style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 10, fontSize: 17.5, lineHeight: 1.55 }}>
                  {region.deeds.map((d, i) => (
                    <li key={i} style={{ textWrap: "pretty" }}>
                      {d}
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", background: "rgba(0,0,0,.10)", border: `3px double ${accent}`, borderRadius: 2 }}>
                  <div
                    className="cinzel"
                    style={{
                      width: 50,
                      height: 50,
                      flex: "none",
                      border: `2px solid ${accent}`,
                      outline: `1px solid ${accent}`,
                      outlineOffset: 3,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                      fontSize: 22,
                      color: "#2c1f0d",
                      background: "radial-gradient(circle, rgba(201,150,60,.25), transparent)",
                    }}
                  >
                    {region.glyph}
                  </div>
                  <div>
                    <div className="cinzel" style={{ fontSize: 15, letterSpacing: ".1em", color: "#2c1f0d" }}>{region.artifact.name}</div>
                    <div style={{ fontSize: 15.5, fontStyle: "italic", color: "#6d5a33" }}>{region.artifact.desc}</div>
                  </div>
                </div>
                <div style={{ marginTop: 20, fontSize: 16.5, fontStyle: "italic", textAlign: "center", color: "#6d5a33", textWrap: "pretty" }}>{region.quote}</div>
                <div className="cinzel" style={{ marginTop: 16, textAlign: "center", fontSize: 11, letterSpacing: ".22em", color: accent, opacity: 0.8 }}>
                  — FROM THE RED BOOK OF WESTMARCH —
                </div>
              </div>
            </div>
          </div>
        </div>
        {roller}
        <button
          onClick={closePanel}
          title="Seal the scroll"
          className="cinzel seal-btn"
          style={{
            position: "absolute",
            top: -18,
            right: -24,
            zIndex: 5,
            width: 58,
            height: 58,
            border: "none",
            cursor: "pointer",
            background: "radial-gradient(circle at 35% 30%, #d4553a, #8c2114 55%, #5c1109)",
            borderRadius: "47% 53% 50% 50%",
            boxShadow: "0 6px 16px rgba(0,0,0,.5), inset 0 2px 4px rgba(255,255,255,.25), inset 0 -4px 8px rgba(0,0,0,.4)",
            animation: "sealPop .45s cubic-bezier(.34,1.56,.64,1) both",
            transition: "transform .2s",
          }}
        >
          <span style={{ fontWeight: 900, fontSize: 20, color: "#f6d9b0", textShadow: "0 -1px 2px rgba(0,0,0,.55)" }}>✕</span>
        </button>
      </div>
    </div>
  );
}
