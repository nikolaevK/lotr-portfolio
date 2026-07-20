"use client";

import { useState } from "react";
import { useGame } from "@/state/store";
import {
  useContent,
  type EducationRecord,
  type ExperienceRecord,
  type ProjectRecord,
  type RegionContent,
} from "@/state/content";
import { PARCHMENT_BG, parchmentOverlay, EDGE_BURN } from "@/ui/parchment";
import { CharacterNiche } from "@/ui/ScrollCharacter";

const ACCENT = "#8a6420";
const INK = "#241a0c";
const INK_SOFT = "#3a2c14";
const FADED = "#6d5a33";
const BODY_FONT = "var(--font-garamond), serif";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtMonth(iso: string | null | undefined): string {
  if (!iso) return "Present";
  const [y, m] = iso.split("-");
  const mi = Number(m) - 1;
  return mi >= 0 && mi < 12 ? `${MONTHS[mi]} ${y}` : iso;
}

/** '·'-separated display string → chips */
function Chips({ tech }: { tech: string | null }) {
  if (!tech) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
      {tech.split("·").map((t) => t.trim()).filter(Boolean).map((t) => (
        <span
          key={t}
          className="cinzel"
          style={{
            fontSize: 10.5,
            letterSpacing: ".07em",
            color: INK_SOFT,
            background: "rgba(201,150,60,.13)",
            border: "1px solid rgba(138,100,32,.45)",
            borderRadius: 2,
            padding: "3px 8px",
          }}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

/** Bullet list that folds long lists behind an "unfold" control. */
function Bullets({ items, fold = 4 }: { items: string[]; fold?: number }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const shown = open ? items : items.slice(0, fold);
  return (
    <>
      <ul style={{ margin: "10px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 7, fontSize: 16.5, lineHeight: 1.5 }}>
        {shown.map((d, i) => (
          <li key={i} style={{ textWrap: "pretty" }}>{d}</li>
        ))}
      </ul>
      {items.length > fold && (
        <button
          onClick={() => setOpen(!open)}
          className="cinzel"
          style={{
            marginTop: 8,
            background: "none",
            border: "none",
            borderBottom: `1px dashed ${ACCENT}`,
            color: ACCENT,
            fontSize: 11,
            letterSpacing: ".14em",
            padding: "2px 0",
            cursor: "pointer",
          }}
        >
          {open ? "▲ FOLD THE SCROLL" : `▼ UNFOLD ${items.length - fold} MORE DEEDS`}
        </button>
      )}
    </>
  );
}

function SectionRule({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0 12px" }}>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT})` }} />
      <div className="cinzel" style={{ color: ACCENT, fontSize: 11.5, letterSpacing: ".22em", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${ACCENT}, transparent)` }} />
    </div>
  );
}

function DateBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="cinzel"
      style={{ fontSize: 11, letterSpacing: ".1em", color: ACCENT, border: `1px solid rgba(138,100,32,.5)`, borderRadius: 2, padding: "2px 8px", whiteSpace: "nowrap" }}
    >
      {children}
    </span>
  );
}

function ExperienceEntry({ e }: { e: ExperienceRecord }) {
  const meta = [e.company, e.location, e.employmentType].filter(Boolean).join(" · ");
  return (
    <article style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h3 className="cinzel" style={{ fontSize: 19, fontWeight: 700, margin: 0, color: "#2c1f0d" }}>{e.title}</h3>
        <DateBadge>{fmtMonth(e.start)} — {fmtMonth(e.end)}</DateBadge>
      </div>
      <div style={{ fontSize: 15.5, fontStyle: "italic", color: FADED, marginTop: 2 }}>{meta}</div>
      {e.summary && <p style={{ margin: "10px 0 0", fontSize: 16.5, lineHeight: 1.55, textWrap: "pretty" }}>{e.summary}</p>}
      <Bullets items={e.highlights} />
      <Chips tech={e.tech} />
    </article>
  );
}

function EducationEntry({ e }: { e: EducationRecord }) {
  return (
    <article style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h3 className="cinzel" style={{ fontSize: 19, fontWeight: 700, margin: 0, color: "#2c1f0d" }}>{e.institution}</h3>
        {(e.startYear || e.endYear) && <DateBadge>{e.startYear} — {e.endYear ?? "Present"}</DateBadge>}
      </div>
      {e.location && <div style={{ fontSize: 15.5, fontStyle: "italic", color: FADED, marginTop: 2 }}>{e.location}</div>}
      <ul style={{ margin: "10px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 7, fontSize: 16.5, lineHeight: 1.5 }}>
        {e.degrees.map((d, i) => (
          <li key={i}>
            <b>{d.degree} {d.field}</b>
            {d.honors ? `, ${d.honors}` : ""}
          </li>
        ))}
        {e.gpa && <li>GPA {e.gpa}{e.notes ? ` · ${e.notes}` : ""}</li>}
        {!e.gpa && e.notes && <li>{e.notes}</li>}
      </ul>
      {e.courses.length > 0 && <Chips tech={e.courses.join(" · ")} />}
    </article>
  );
}

function ProjectEntry({ p }: { p: ProjectRecord }) {
  const year = p.yearStart ? `${p.yearStart} — ${p.yearEnd ?? "ongoing"}` : null;
  return (
    <article style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h3 className="cinzel" style={{ fontSize: 17.5, fontWeight: 700, margin: 0, color: "#2c1f0d" }}>
          {p.name}
          {p.kind && (
            <span className="cinzel" style={{ fontSize: 10, letterSpacing: ".14em", color: ACCENT, marginLeft: 10, verticalAlign: "middle" }}>
              {p.kind.toUpperCase()}
            </span>
          )}
        </h3>
        {year && <DateBadge>{year}</DateBadge>}
      </div>
      {p.description && <p style={{ margin: "8px 0 0", fontSize: 16.5, lineHeight: 1.55, textWrap: "pretty" }}>{p.description}</p>}
      <Bullets items={p.highlights} fold={3} />
      {(p.liveUrl || p.repoUrl) && (
        <div style={{ marginTop: 8, fontSize: 15 }}>
          {p.liveUrl && <a href={p.liveUrl} target="_blank" rel="noreferrer">visit ↗</a>}
          {p.liveUrl && p.repoUrl && " · "}
          {p.repoUrl && <a href={p.repoUrl} target="_blank" rel="noreferrer">source ↗</a>}
        </div>
      )}
      <Chips tech={p.tech} />
    </article>
  );
}

type Tab = "tale" | "record";

/** Keyed by region so tab/fold state resets between scrolls. */
function ScrollBody({ region, isNew }: { region: RegionContent; isNew: boolean }) {
  const tone = useGame((s) => s.tone);
  const xp = useContent((c) => c.xp);
  const t = region[tone];
  const rec = region.record;
  const hasRecord = rec.experiences.length + rec.educations.length + rec.projects.length > 0;
  const [tab, setTab] = useState<Tab>("tale");
  const active = hasRecord ? tab : "tale";

  const tabBtn = (id: Tab, label: string) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className="cinzel"
      style={{
        flex: 1,
        background: active === id ? "rgba(201,150,60,.16)" : "transparent",
        border: "none",
        borderBottom: active === id ? `2px solid ${ACCENT}` : "2px solid rgba(138,100,32,.25)",
        color: active === id ? "#2c1f0d" : FADED,
        fontSize: 12.5,
        fontWeight: active === id ? 700 : 400,
        letterSpacing: ".18em",
        padding: "9px 6px",
        cursor: "pointer",
        transition: "background .2s, color .2s",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ fontFamily: BODY_FONT, color: INK }}>
      {/* header */}
      <div className="cinzel" style={{ fontSize: 12.5, letterSpacing: ".24em", color: ACCENT, textAlign: "center" }}>
        FROM THE RED BOOK · {region.place.toUpperCase()}
      </div>
      <h2 className="cinzel" style={{ fontWeight: 700, fontSize: 30, lineHeight: 1.15, margin: "10px 0 6px", textAlign: "center", color: "#2c1f0d", textWrap: "balance" }}>
        {t.title}
      </h2>
      <div style={{ fontSize: 17, fontStyle: "italic", color: FADED, marginBottom: 14, textAlign: "center", textWrap: "pretty" }}>{t.sub}</div>

      {isNew && (
        <div
          className="cinzel"
          style={{
            display: "flex",
            gap: 14,
            justifyContent: "center",
            marginBottom: 14,
            padding: "9px 14px",
            background: "rgba(201,150,60,.08)",
            border: `1px dashed ${ACCENT}`,
            borderRadius: 2,
            fontSize: 12.5,
            letterSpacing: ".08em",
            color: ACCENT,
            flexWrap: "wrap",
          }}
        >
          <span>QUEST COMPLETE</span>
          <span>·</span>
          <span>+{xp.region} XP</span>
          <span>·</span>
          <span>LOOT: {region.artifact.name}</span>
        </div>
      )}

      {/* tabs — only when the land has a professional record behind the tale */}
      {hasRecord && (
        <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
          {tabBtn("tale", "THE TALE")}
          {tabBtn("record", "THE RECORD")}
        </div>
      )}

      {/* body: character niche floats beside the words */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {region.characters.length > 0 && (
          <aside className="scroll-char-rail" style={{ flex: "0 0 216px", display: "flex", flexDirection: "column", gap: 16, paddingTop: 4 }}>
            {region.characters.map((c) => (
              <CharacterNiche key={c.slug} c={c} glyph={region.glyph} />
            ))}
          </aside>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {active === "tale" ? (
            <>
              <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 9, fontSize: 17, lineHeight: 1.55 }}>
                {region.deeds.map((d, i) => (
                  <li key={i} style={{ textWrap: "pretty" }}>{d}</li>
                ))}
              </ul>
              <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 16, padding: "13px 16px", background: "rgba(0,0,0,.10)", border: `3px double ${ACCENT}`, borderRadius: 2 }}>
                <div
                  className="cinzel"
                  style={{
                    width: 48,
                    height: 48,
                    flex: "none",
                    border: `2px solid ${ACCENT}`,
                    outline: `1px solid ${ACCENT}`,
                    outlineOffset: 3,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    fontSize: 21,
                    color: "#2c1f0d",
                    background: "radial-gradient(circle, rgba(201,150,60,.25), transparent)",
                  }}
                >
                  {region.glyph}
                </div>
                <div>
                  <div className="cinzel" style={{ fontSize: 14.5, letterSpacing: ".1em", color: "#2c1f0d" }}>{region.artifact.name}</div>
                  <div style={{ fontSize: 15.5, fontStyle: "italic", color: FADED }}>{region.artifact.desc}</div>
                </div>
              </div>
              <div style={{ marginTop: 18, fontSize: 16.5, fontStyle: "italic", textAlign: "center", color: FADED, textWrap: "pretty" }}>{region.quote}</div>
            </>
          ) : (
            <>
              {rec.experiences.length > 0 && (
                <>
                  <SectionRule label="EMPLOYMENTS" />
                  {rec.experiences.map((e) => <ExperienceEntry key={e.id} e={e} />)}
                </>
              )}
              {rec.educations.length > 0 && (
                <>
                  <SectionRule label="LEARNING" />
                  {rec.educations.map((e) => <EducationEntry key={e.id} e={e} />)}
                </>
              )}
              {rec.projects.length > 0 && (
                <>
                  <SectionRule label="WORKS & WONDERS" />
                  {rec.projects.map((p) => <ProjectEntry key={p.id} p={p} />)}
                </>
              )}
            </>
          )}

          <div className="cinzel" style={{ marginTop: 18, textAlign: "center", fontSize: 10.5, letterSpacing: ".22em", color: ACCENT, opacity: 0.8 }}>
            — FROM THE RED BOOK OF WESTMARCH —
          </div>
        </div>
      </div>
    </div>
  );
}

/** The unrolling parchment scroll. */
export function ScrollPanel() {
  const regionId = useGame((s) => s.region);
  const isNew = useGame((s) => s.regionIsNew);
  const closePanel = useGame((s) => s.closePanel);
  const region = useContent((c) => (regionId ? c.regions.find((r) => r.id === regionId) : undefined));
  if (!region) return null;

  // turned wooden rod: grain streaks over a lathe-shaded cylinder
  const rollerBg =
    "repeating-linear-gradient(90deg, rgba(30,16,4,.22) 0 2px, transparent 2px 9px, rgba(60,35,12,.16) 9px 12px, transparent 12px 21px), linear-gradient(#9a6b33 0%, #5c3a18 38%, #331d0a 58%, #6b4520 100%)";

  const knob = (side: "left" | "right") => (
    <div style={{ position: "absolute", [side]: -36, top: 2, width: 26, height: 26 }}>
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
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "min(860px, 94vw)", filter: "drop-shadow(0 36px 60px rgba(0,0,0,.75))" }}>
        {roller}
        <div style={{ overflow: "hidden", animation: "unrollH .95s cubic-bezier(.25,1,.4,1) both", maxHeight: "76vh", margin: "-6px 4px", position: "relative", zIndex: 1 }}>
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
              <div style={{ position: "relative", maxHeight: "calc(76vh - 58px)", overflowY: "auto", padding: "32px 46px 28px" }}>
                <ScrollBody key={region.id} region={region} isNew={isNew} />
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
