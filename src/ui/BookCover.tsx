"use client";

import { useMemo } from "react";
import { useGame } from "@/state/store";
import {
  PARCHMENT_BG,
  parchmentOverlay,
  EDGE_BURN,
  LEATHER_BG,
  LEATHER_NOISE,
  GOLD_EMBOSS,
  svgUri,
} from "@/ui/parchment";

/** Gold corner flourish for the tooled cover frame. */
const CORNER_SVG = svgUri(
  "<svg xmlns='http://www.w3.org/2000/svg' width='54' height='54' viewBox='0 0 54 54'>" +
    "<g fill='none' stroke='#c9963c' stroke-width='2' stroke-linecap='round' opacity='0.85'>" +
    "<path d='M4,30 L4,4 L30,4'/>" +
    "<path d='M9,26 Q9,9 26,9'/>" +
    "<path d='M12,40 Q12,12 40,12' stroke-width='1.1' opacity='0.7'/>" +
    "<circle cx='9' cy='9' r='2.2' fill='#c9963c' stroke='none'/>" +
    "<path d='M26,9 q5,-3 8,1 q-4,0 -5,3' fill='#c9963c' stroke='none' opacity='0.9'/>" +
    "<path d='M9,26 q-3,5 1,8 q0,-4 3,-5' fill='#c9963c' stroke='none' opacity='0.9'/>" +
    "</g></svg>",
);

/** Faint compass rose for the endpaper inside the cover. */
const ENDPAPER_ROSE = svgUri(
  "<svg xmlns='http://www.w3.org/2000/svg' width='340' height='340' viewBox='0 0 340 340'>" +
    "<g fill='none' stroke='#7a6338' stroke-width='1.5' opacity='0.45'>" +
    "<circle cx='170' cy='170' r='120'/><circle cx='170' cy='170' r='102'/><circle cx='170' cy='170' r='34'/>" +
    "<path d='M170,34 L184,156 L306,170 L184,184 L170,306 L156,184 L34,170 L156,156 Z' fill='#7a6338' opacity='0.35' stroke='none'/>" +
    "<path d='M170,74 L179,161 L266,170 L179,179 L170,266 L161,179 L74,170 L161,161 Z' fill='#8a7344' opacity='0.5' stroke='none'/>" +
    "</g></svg>",
);

const goldRule: React.CSSProperties = {
  height: 1,
  background: "linear-gradient(90deg, transparent, #b08a3e 18%, #e2c06d 50%, #b08a3e 82%, transparent)",
};

export function BookCover() {
  const phase = useGame((s) => s.phase);
  const coverOpened = useGame((s) => s.coverOpened);
  const coverGone = useGame((s) => s.coverGone);
  const ready = useGame((s) => s.ready);
  const openCover = useGame((s) => s.openCover);
  const beginJourney = useGame((s) => s.beginJourney);
  const visitedCount = useGame((s) => Object.keys(s.visited).length);
  const mount = useGame((s) => s.mount);
  const setMount = useGame((s) => s.setMount);

  const embers = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        left: 6 + ((i * 37) % 90),
        delay: (i * 0.9) % 7,
        dur: 5 + (i % 5),
        size: 3 + (i % 3),
      })),
    [],
  );

  if (coverGone) return null;

  const steedBtn = (id: "dragon" | "eagle", title: string, flavor: string) => {
    const active = mount === id;
    return (
      <button
        onClick={() => setMount(id)}
        className="cinzel hud-btn"
        style={{
          padding: "9px 14px",
          background: active
            ? "linear-gradient(170deg, #4a3312, #2e1d08)"
            : "linear-gradient(170deg, rgba(61,43,16,.10), rgba(61,43,16,.16))",
          color: active ? "#ecd9a0" : "#6d5a33",
          border: `1px solid ${active ? "#c9963c" : "#9a7d45"}`,
          boxShadow: active
            ? "inset 0 1px 0 rgba(255,235,180,.18), 0 3px 8px rgba(40,20,4,.45)"
            : "inset 0 1px 2px rgba(70,45,15,.2)",
          cursor: "pointer",
          borderRadius: 2,
          fontSize: 12,
          letterSpacing: ".1em",
          lineHeight: 1.5,
        }}
      >
        {title}
        <span
          className="fell"
          style={{ display: "block", fontStyle: "italic", fontSize: 12, letterSpacing: 0, textTransform: "none" }}
        >
          {flavor}
        </span>
      </button>
    );
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "radial-gradient(ellipse at 50% 45%, #241708f2, #0c0804fa 75%)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: phase === "map" ? 0 : 1,
        transition: "opacity .8s",
        pointerEvents: phase === "map" ? "none" : "auto",
      }}
    >
      {embers.map((e, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${e.left}%`,
            bottom: "-2vh",
            width: e.size,
            height: e.size,
            borderRadius: "50%",
            background: "#ff8a2e",
            boxShadow: "0 0 9px #ff6a00",
            animation: `coverEmber ${e.dur}s linear ${e.delay}s infinite`,
            pointerEvents: "none",
          }}
        />
      ))}
      <div style={{ position: "relative", width: "min(440px, 88vw)", height: "min(580px, 80vh)", perspective: 2000 }}>
        {/* title page beneath the cover, atop the book block */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: PARCHMENT_BG,
            border: "1px solid #9c7f48",
            borderRadius: "2px 7px 7px 2px",
            // the stacked page block + the table shadow
            boxShadow:
              "2.5px 3px 0 #dcc99c, 5px 6px 0 #cfba8b, 7.5px 9px 0 #bfa878, 9px 11px 0 #2b1a0a, 0 34px 90px rgba(0,0,0,.85)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 40,
            color: "#2c1f0d",
            overflow: "hidden",
          }}
        >
          {/* paper grain + stains, spine shadow, edge burn */}
          <div style={parchmentOverlay} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              boxShadow: EDGE_BURN,
              background:
                "linear-gradient(90deg, rgba(60,35,10,.34), rgba(60,35,10,.12) 7%, transparent 15%), linear-gradient(270deg, rgba(80,52,18,.16), transparent 9%)",
              pointerEvents: "none",
            }}
          />
          {/* thin double frame ruled in faded ink */}
          <div
            style={{
              position: "absolute",
              inset: 16,
              border: "1px solid rgba(138,100,32,.55)",
              outline: "1px solid rgba(138,100,32,.3)",
              outlineOffset: 3,
              borderRadius: 2,
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative" }}>
            <div className="cinzel" style={{ fontSize: 13, letterSpacing: ".3em", color: "#8a6420" }}>
              HEREIN ARE RECORDED
            </div>
            <div className="cinzel" style={{ fontWeight: 900, fontSize: 33, lineHeight: 1.22, margin: "14px 0 10px" }}>
              The Deeds of
              <br />
              Konstantin Nikolaev
            </div>
            <div style={{ ...goldRule, width: 190, margin: "0 auto 12px" }} />
            <div className="fell" style={{ fontSize: 18, fontStyle: "italic", color: "#6d5a33", maxWidth: 310, margin: "0 auto" }}>
              Builder of white cities, tamer of lightning, student of elven-lore — full-stack engineer of Sherman Oaks
            </div>
            <div className="cinzel" style={{ margin: "20px 0 8px", fontSize: 12, letterSpacing: ".26em", color: "#8a6420" }}>
              CHOOSE YOUR STEED
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              {steedBtn("dragon", "THE DRAGON", "fire & fury")}
              {steedBtn("eagle", "THE GREAT EAGLE", "swift as the wind")}
            </div>
            <div style={{ margin: "18px 0 0", fontSize: 16, color: "#5c4a28", lineHeight: 1.6 }}>
              <b>W</b> soars ahead, <b>A</b>/<b>D</b> wheel, <b>S</b> eases up · <b>SHIFT</b> swifter
              <br />
              <b>F</b> for dragon-fire or the eagle&apos;s cry · <b>M</b> for the map view
              <br />
              Seek the five marked lands
            </div>
            <button
              onClick={beginJourney}
              disabled={!ready}
              className="cinzel hud-btn"
              style={{
                marginTop: 24,
                fontSize: 15,
                letterSpacing: ".14em",
                padding: "14px 34px",
                background: ready ? "linear-gradient(172deg, #4c3412 0%, #35230a 55%, #241705 100%)" : "#6a5c44",
                color: "#ecd9a0",
                border: "1px solid #c9963c",
                boxShadow: "inset 0 1px 0 rgba(255,235,180,.22), inset 0 -6px 12px rgba(0,0,0,.35), 0 5px 14px rgba(30,15,2,.5)",
                cursor: ready ? "pointer" : "wait",
                borderRadius: 2,
                textShadow: "0 -1px 1px rgba(0,0,0,.6)",
              }}
            >
              {!ready ? "THE MAP IS BEING DRAWN…" : visitedCount > 0 ? "CONTINUE THE JOURNEY" : "BEGIN THE JOURNEY"}
            </button>
          </div>
        </div>
        {/* front cover */}
        <div
          onClick={openCover}
          style={{
            position: "absolute",
            inset: 0,
            transformOrigin: "left center",
            transform: coverOpened ? "rotateY(-165deg)" : "rotateY(0deg)",
            transition: "transform 1.1s cubic-bezier(.4,0,.2,1)",
            transformStyle: "preserve-3d",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `${LEATHER_NOISE}, ${LEATHER_BG}`,
              backgroundBlendMode: "multiply",
              backgroundSize: "220px 220px, cover",
              borderRadius: "3px 12px 12px 3px",
              boxShadow:
                "0 34px 90px rgba(0,0,0,.85), inset 0 0 80px rgba(0,0,0,.55), inset 0 2px 2px rgba(210,160,80,.14), inset 0 -2px 3px rgba(0,0,0,.7), inset -3px 0 6px rgba(0,0,0,.5)",
              backfaceVisibility: "hidden",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: 40,
              overflow: "hidden",
            }}
          >
            {/* raised spine bands along the bound edge */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 22,
                background:
                  "linear-gradient(90deg, rgba(0,0,0,.65), rgba(90,58,24,.4) 45%, rgba(0,0,0,.35)), repeating-linear-gradient(180deg, transparent 0 64px, rgba(226,192,109,.35) 64px 66px, rgba(0,0,0,.5) 66px 70px, transparent 70px 96px)",
                borderRight: "1px solid rgba(0,0,0,.55)",
              }}
            />
            {/* tooled gold frame with corner flourishes */}
            <div
              style={{
                position: "absolute",
                inset: 16,
                left: 30,
                border: "2px solid rgba(201,150,60,.75)",
                outline: "1px solid rgba(201,150,60,.35)",
                outlineOffset: 4,
                borderRadius: "2px 8px 8px 2px",
                boxShadow: "0 1px 1px rgba(255,235,180,.15), inset 0 1px 2px rgba(0,0,0,.7)",
                pointerEvents: "none",
              }}
            />
            {[
              { top: 20, left: 34, transform: "none" },
              { top: 20, right: 20, transform: "scaleX(-1)" },
              { bottom: 20, left: 34, transform: "scaleY(-1)" },
              { bottom: 20, right: 20, transform: "scale(-1)" },
            ].map((pos, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  width: 54,
                  height: 54,
                  backgroundImage: CORNER_SVG,
                  pointerEvents: "none",
                  ...pos,
                }}
              />
            ))}
            <div className="cinzel" style={{ fontSize: 13, letterSpacing: ".34em", color: "#b08a3e" }}>
              A PORTFOLIO
            </div>
            <div
              className="cinzel"
              style={{ fontWeight: 900, fontSize: 40, lineHeight: 1.2, margin: "18px 0 14px", ...GOLD_EMBOSS }}
            >
              THERE AND
              <br />
              BACK AGAIN
            </div>
            {/* the Ring, tooled in gold */}
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: "50%",
                border: "5px solid transparent",
                background:
                  "linear-gradient(#31200c,#31200c) padding-box, conic-gradient(from 40deg, #8a5c10, #e8c476, #a8781e, #f4dc9a, #8a5c10) border-box",
                boxShadow: "0 0 22px rgba(226,180,90,.35), inset 0 0 10px rgba(0,0,0,.6)",
                marginBottom: 16,
              }}
            />
            <div className="fell" style={{ fontSize: 19, fontStyle: "italic", color: "#c7a961" }}>
              being the journeys &amp; employments of
              <br />
              one Konstantin Nikolaev
            </div>
            <div
              className="cinzel"
              style={{ position: "absolute", bottom: 34, fontSize: 12, letterSpacing: ".24em", color: "#a8874a", animation: "pulse 2.6s infinite" }}
            >
              · CLICK TO OPEN ·
            </div>
          </div>
          {/* inside of the cover — aged endpaper with a faint compass rose */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `${LEATHER_NOISE}, linear-gradient(150deg, #3b2610, #241708)`,
              backgroundBlendMode: "multiply",
              backgroundSize: "220px 220px, cover",
              borderRadius: "3px 12px 12px 3px",
              transform: "rotateY(180deg)",
              backfaceVisibility: "hidden",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 14,
                background: "linear-gradient(160deg, #d8c49a, #c2ab7c)",
                borderRadius: 2,
                boxShadow: "inset 0 0 40px rgba(70,45,15,.55), inset 0 0 6px rgba(50,30,8,.5)",
              }}
            >
              <div style={{ ...parchmentOverlay, opacity: 0.55 }} />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: ENDPAPER_ROSE,
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                  opacity: 0.5,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
