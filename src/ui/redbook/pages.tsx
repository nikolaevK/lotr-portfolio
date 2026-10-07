"use client";

import { Fragment, useId } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGame } from "@/state/store";
import {
  useContent,
  xpEarned,
  xpMax,
  type EducationRecord,
  type ExperienceRecord,
  type ProjectRecord,
  type RegionContent,
} from "@/state/content";
import { travelTo } from "@/game/actions";
import { leaveForFlight } from "@/ui/a11y";
import {
  bareUrl, fmtMonth, hasRecord, leadIn, leafLabel, roman, techList, withFallbacks, type Leaf,
} from "@/ui/redbook/book";

// small gold capitals and italic meta hold 4.5:1 against the paper
const ACCENT = "#76561c";
const HEAD = "#2c1f0d";
const INK_SOFT = "#3a2c14";
const FADED = "#5e4b28";

const pageTitle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: "clamp(24px, 2.2vw, 30px)",
  lineHeight: 1.15,
  margin: "10px 0 6px",
  textAlign: "center",
  color: HEAD,
  textWrap: "balance",
};
const subLine: React.CSSProperties = {
  fontSize: 17,
  fontStyle: "italic",
  color: FADED,
  textAlign: "center",
  textWrap: "balance",
};
const prose: React.CSSProperties = { fontSize: 17.5, lineHeight: 1.6, margin: 0, textWrap: "pretty" };
const bulletList: React.CSSProperties = {
  margin: "10px 0 0",
  paddingLeft: 20,
  display: "flex",
  flexDirection: "column",
  gap: 7,
  fontSize: 16.5,
  lineHeight: 1.5,
};
const entryHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: "4px 10px",
  flexWrap: "wrap",
};
const entryTitle: React.CSSProperties = { fontSize: 18.5, fontWeight: 700, margin: 0, color: HEAD, lineHeight: 1.25 };
const entryMeta: React.CSSProperties = { fontSize: 15.5, fontStyle: "italic", color: FADED, marginTop: 2 };

/** Tooled leather, as on the cover's BEGIN button. */
const leatherBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 9,
  minHeight: 44,
  padding: "11px 22px",
  fontSize: 13,
  letterSpacing: ".13em",
  background: "linear-gradient(172deg, #4c3412 0%, #35230a 55%, #241705 100%)",
  color: "#ecd9a0",
  border: "1px solid #c9963c",
  borderRadius: 2,
  boxShadow: "inset 0 1px 0 rgba(255,235,180,.22), inset 0 -6px 12px rgba(0,0,0,.35), 0 4px 10px rgba(30,15,2,.4)",
  textShadow: "0 -1px 1px rgba(0,0,0,.6)",
  textDecoration: "none",
  cursor: "pointer",
};
/** The quieter sibling: ink on parchment. */
const inkBtn: React.CSSProperties = {
  ...leatherBtn,
  background: "linear-gradient(170deg, rgba(61,43,16,.07), rgba(61,43,16,.15))",
  color: "#4a3412",
  border: "1px solid #9a7d45",
  boxShadow: "inset 0 1px 2px rgba(70,45,15,.2)",
  textShadow: "none",
};

// ── small ornaments ────────────────────────────────────────────────────────

/** Small gold capitals over a title — or the title itself, on a page without one. */
function Kicker({ children, heading = false }: { children: React.ReactNode; heading?: boolean }) {
  const Tag = heading ? "h3" : "div";
  return (
    <Tag className="cinzel" style={{ margin: 0, fontSize: 12.5, fontWeight: 400, letterSpacing: ".22em", color: ACCENT, textAlign: "center", lineHeight: 1.5, textWrap: "balance" }}>
      {children}
    </Tag>
  );
}

/** A gilded rule with a lozenge and curling ends. */
function Flourish() {
  // two pages of a spread each draw one — their gradient ids must differ
  const id = useId();
  return (
    <svg viewBox="0 0 260 18" aria-hidden style={{ display: "block", width: 240, maxWidth: "80%", height: 17, margin: "10px auto 16px" }}>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="8" y1="0" x2="252" y2="0">
          <stop offset="0" stopColor="#a8781e" stopOpacity="0" />
          <stop offset=".25" stopColor="#a8781e" />
          <stop offset=".5" stopColor="#e2c06d" />
          <stop offset=".75" stopColor="#a8781e" />
          <stop offset="1" stopColor="#a8781e" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M8,9 H112 M148,9 H252" stroke={`url(#${id})`} strokeWidth="1.2" fill="none" />
      <path d="M112,9 q6,-7 12,0 q-6,7 -12,0 M148,9 q-6,-7 -12,0 q6,7 12,0" stroke="#a8781e" strokeWidth="1.1" fill="none" />
      <path d="M130,2 L136,9 L130,16 L124,9 Z" fill="#c9963c" stroke="#8a6420" strokeWidth=".8" />
      <circle cx="130" cy="9" r="1.6" fill="#f4dc9a" />
    </svg>
  );
}

function SectionRule({ children }: { children: React.ReactNode }) {
  return (
    <h4 style={{ display: "flex", alignItems: "center", gap: 12, margin: "26px 0 12px", fontWeight: 400 }}>
      <span aria-hidden style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT})` }} />
      <span className="cinzel" style={{ color: ACCENT, fontSize: 12.5, letterSpacing: ".2em", whiteSpace: "nowrap" }}>{children}</span>
      <span aria-hidden style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${ACCENT}, transparent)` }} />
    </h4>
  );
}

/** The printer's flower that closes a page. */
function Tailpiece({ children = "❦" }: { children?: React.ReactNode }) {
  return (
    <div aria-hidden className="cinzel" style={{ marginTop: 26, textAlign: "center", fontSize: 13, letterSpacing: ".3em", color: ACCENT, opacity: 0.85 }}>
      {children}
    </div>
  );
}

function DateBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="cinzel"
      style={{ fontSize: 12.5, letterSpacing: ".08em", color: ACCENT, border: "1px solid rgba(138,100,32,.5)", borderRadius: 2, padding: "2px 8px", whiteSpace: "nowrap" }}
    >
      {children}
    </span>
  );
}

function Chips({ items, label }: { items: string[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <ul aria-label={label} style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexWrap: "wrap", gap: 6 }}>
      {items.map((t) => (
        // tool names in the body face, as written — not tiny capitals
        <li
          key={t}
          style={{
            fontSize: 14.5,
            lineHeight: 1.3,
            color: INK_SOFT,
            background: "rgba(201,150,60,.13)",
            border: "1px solid rgba(138,100,32,.4)",
            borderRadius: 2,
            padding: "2px 9px",
          }}
        >
          {t}
        </li>
      ))}
    </ul>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul style={bulletList}>
      {items.map((d, i) => {
        // a short "Label:" lead-in is set in bold so a long list scans
        const [lead, rest] = leadIn(d);
        return (
          <li key={i} style={{ textWrap: "pretty" }}>
            {lead && <b style={{ fontWeight: 600, color: HEAD }}>{lead}: </b>}
            {rest}
          </li>
        );
      })}
    </ul>
  );
}

const ICONS = {
  scroll: "M6 3h10a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5M9 8h7M9 12h7M9 16h4",
  wing: "M3 17c5-1 9-4 11-9 1 3 0 6-2 8 3 0 6-2 9-6-1 5-6 9-12 9H3z",
  quill: "M20 4C12 5 7 10 5 19M20 4c-1 5-4 9-9 11M9 13l-2 6",
  print: "M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  replay: "M4 12a8 8 0 1 0 3-6.2M4 4v4h4",
} as const;

export function Icon({ d, size = 16 }: { d: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
      <path d={ICONS[d]} />
    </svg>
  );
}

const external = { target: "_blank", rel: "noreferrer" } as const;

// ── record entries (every deed shown: this is the reader in a hurry's copy) ──

function ExperienceEntry({ e }: { e: ExperienceRecord }) {
  const meta = [e.company, e.location, e.employmentType].filter(Boolean).join(" · ");
  return (
    <article className="rec-entry">
      <div style={entryHead}>
        <h5 className="cinzel" style={entryTitle}>{e.title}</h5>
        <DateBadge>{fmtMonth(e.start)} — {fmtMonth(e.end)}</DateBadge>
      </div>
      <div style={entryMeta}>{meta}</div>
      {e.summary && <p style={{ ...prose, fontSize: 16.5, marginTop: 9 }}>{e.summary}</p>}
      <Bullets items={e.highlights} />
      <Chips items={techList(e.tech)} label="Tools of the trade" />
    </article>
  );
}

function EducationEntry({ e }: { e: EducationRecord }) {
  return (
    <article className="rec-entry">
      <div style={entryHead}>
        <h5 className="cinzel" style={entryTitle}>{e.institution}</h5>
        {(e.startYear || e.endYear) && <DateBadge>{e.startYear} — {e.endYear ?? "Present"}</DateBadge>}
      </div>
      {e.location && <div style={entryMeta}>{e.location}</div>}
      <ul style={bulletList}>
        {e.degrees.map((d, i) => (
          <li key={i}>
            <b>{d.degree} {d.field}</b>
            {d.honors ? `, ${d.honors}` : ""}
          </li>
        ))}
        {e.gpa && <li>GPA {e.gpa}{e.notes ? ` · ${e.notes}` : ""}</li>}
        {!e.gpa && e.notes && <li>{e.notes}</li>}
      </ul>
      <Chips items={e.courses} label="Coursework" />
    </article>
  );
}

function ProjectEntry({ p }: { p: ProjectRecord }) {
  const years = p.yearStart ? `${p.yearStart} — ${p.yearEnd ?? "ongoing"}` : null;
  return (
    <article className="rec-entry">
      <div style={entryHead}>
        <h5 className="cinzel" style={{ ...entryTitle, fontSize: 17.5 }}>
          {p.name}
          {p.kind && (
            <span style={{ fontSize: 11, fontWeight: 400, letterSpacing: ".14em", color: ACCENT, marginLeft: 10, verticalAlign: "middle" }}>
              {p.kind.toUpperCase()}
            </span>
          )}
        </h5>
        {years && <DateBadge>{years}</DateBadge>}
      </div>
      {p.description && <p style={{ ...prose, fontSize: 16.5, marginTop: 8 }}>{p.description}</p>}
      <Bullets items={p.highlights} />
      {(p.liveUrl || p.repoUrl) && (
        <div style={{ marginTop: 8, fontSize: 15.5 }}>
          {p.liveUrl && <a href={p.liveUrl} {...external}>visit {bareUrl(p.liveUrl)} ↗</a>}
          {p.liveUrl && p.repoUrl && " · "}
          {p.repoUrl && <a href={p.repoUrl} {...external}>read the source ↗</a>}
        </div>
      )}
      <Chips items={techList(p.tech)} label="Tools of the trade" />
    </article>
  );
}

// ── the pages ──────────────────────────────────────────────────────────────

function Prologue() {
  const profile = useContent((c) => c.profile);
  const resumes = useContent((c) => c.resumeVariants);
  const skills = useContent((c) => c.skills);
  const p = withFallbacks(profile);
  const main = resumes.find((v) => v.isDefault) ?? resumes[0];
  const others = resumes.filter((v) => v !== main);
  const roads = [...p.links, ...(p.email ? [{ label: "Email", url: `mailto:${p.email}` }] : [])];
  return (
    <>
      <Kicker>PROLOGUE · CONCERNING THE AUTHOR</Kicker>
      <h3 className="cinzel" style={{ ...pageTitle, fontSize: "clamp(27px, 2.6vw, 36px)", fontWeight: 900 }}>{p.name}</h3>
      <div style={subLine}>
        {/* break between the parts, never inside one, and never before a "·" */}
        {[p.headline, p.location].filter(Boolean).map((t, i) => (
          <Fragment key={i}>
            {i > 0 && "\u00a0· "}
            <span style={{ display: "inline-block" }}>{t}</span>
          </Fragment>
        ))}
      </div>
      <Flourish />
      {p.summary && <p className="rb-dropcap" style={prose}>{p.summary}</p>}

      {skills.length > 0 && (
        <>
          <SectionRule>THE CRAFT</SectionRule>
          <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {skills.map((g) => (
              <div key={g.category}>
                <dt className="cinzel" style={{ fontSize: 12, letterSpacing: ".16em", color: ACCENT }}>{g.category.toUpperCase()}</dt>
                <dd style={{ margin: "1px 0 0", fontSize: 16.5, lineHeight: 1.45, textWrap: "pretty" }}>{g.items.join(" · ")}</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      <SectionRule>THE OLD ROADS</SectionRule>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", alignItems: "baseline", gap: "7px 16px", margin: 0, fontSize: 16.5 }}>
        {roads.map((r) => (
          <Fragment key={r.label + r.url}>
            <dt className="cinzel" style={{ fontSize: 12, letterSpacing: ".16em", color: ACCENT }}>{r.label.toUpperCase()}</dt>
            <dd style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>
              <a href={r.url} {...(r.url.startsWith("mailto:") ? {} : external)}>{bareUrl(r.url)}</a>
            </dd>
          </Fragment>
        ))}
      </dl>

      {main && (
        <>
          <SectionRule>THE WRITTEN SCROLL</SectionRule>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            <a href={main.path} {...external} className="cinzel hud-btn rb-btn" style={leatherBtn}>
              <Icon d="scroll" /> {others.length > 0 ? `RÉSUMÉ · ${main.label.toUpperCase()}` : "THE RÉSUMÉ (PDF)"}
            </a>
            {others.map((v) => (
              <a key={v.path} href={v.path} {...external} className="cinzel hud-btn rb-btn" style={inkBtn}>
                {v.label.toUpperCase()}
              </a>
            ))}
          </div>
          {others.length > 0 && (
            <div style={{ marginTop: 8, textAlign: "center", fontSize: 14.5, fontStyle: "italic", color: FADED }}>
              a scroll for every kind of quest — each opens as a PDF
            </div>
          )}
        </>
      )}
      <Tailpiece />
    </>
  );
}

function Contents({ leaves, onGoto }: { leaves: Leaf[]; onGoto: (i: number) => void }) {
  const tone = useGame((s) => s.tone);
  const visited = useGame((s) => s.visited);
  // the chapter openers, plus the unnumbered matter around them
  const items = leaves.flatMap((l, i) => (l.kind === "contents" || l.kind === "record" ? [] : [{ l, i }]));
  return (
    <>
      <Kicker>THE RED BOOK OF WESTMARCH</Kicker>
      <h3 className="cinzel" style={pageTitle}>Contents</h3>
      <div style={subLine}>being the chapters of this tale, in the order they were walked</div>
      <Flourish />
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map(({ l, i }) => {
          const ch = l.kind === "opener" ? l : null;
          const title = ch ? ch.region[tone].title : leafLabel(l);
          const charted = ch ? !!visited[ch.region.id] : false;
          return (
            <li key={i}>
              <button
                onClick={() => onGoto(i)}
                className="rb-toc"
                aria-label={`${ch ? `Chapter ${roman(ch.chapter)}: ` : ""}${title}${charted ? " (charted)" : ""}, page ${i + 1}`}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 12,
                  padding: "9px 6px",
                  background: "none",
                  border: "none",
                  borderRadius: 2,
                  textAlign: "left",
                  color: HEAD,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span className="cinzel" style={{ flex: "0 0 34px", alignSelf: "flex-start", fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: ACCENT, textAlign: "right" }}>
                  {ch ? roman(ch.chapter) : "❦"}
                </span>
                <span style={{ flex: "0 1 auto", minWidth: 0 }}>
                  <span className="cinzel rb-toc-title" style={{ display: "block", fontSize: 15.5, fontWeight: 600, lineHeight: 1.3 }}>{title}</span>
                  {ch && (
                    <span style={{ display: "block", fontSize: 15, fontStyle: "italic", color: FADED, lineHeight: 1.35 }}>
                      {ch.region.common.label}
                      {charted && <span className="cinzel" style={{ fontStyle: "normal", fontSize: 10, letterSpacing: ".16em", color: "#4f7a32", marginLeft: 8 }}>✦ CHARTED</span>}
                    </span>
                  )}
                </span>
                {/* dotted leader to the folio, as in a printed contents */}
                <span aria-hidden style={{ flex: "1 1 18px", minWidth: 18, borderBottom: "1.5px dotted rgba(138,100,32,.55)", marginBottom: 6 }} />
                <span className="cinzel" style={{ flex: "none", fontSize: 14, color: INK_SOFT, minWidth: 18, textAlign: "right" }}>{i + 1}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <Tailpiece />
    </>
  );
}

function FlyButton({ region }: { region: RegionContent }) {
  const { phase, ready, setCodex, beginJourney } = useGame(
    useShallow((s) => ({ phase: s.phase, ready: s.ready, setCodex: s.setCodex, beginJourney: s.beginJourney })),
  );
  const inMap = phase === "map";
  const go = () => {
    leaveForFlight();
    setCodex(false);
    // from the cover, the journey begins and the autopilot waits for the map to rise
    if (!inMap) beginJourney();
    travelTo(region.id);
  };
  return (
    <div style={{ marginTop: 20, textAlign: "center" }}>
      <button onClick={go} disabled={!inMap && !ready} className="cinzel hud-btn" style={{ ...leatherBtn, cursor: !inMap && !ready ? "wait" : "pointer" }}>
        <Icon d="wing" size={18} />
        {inMap ? "FLY TO THIS LAND" : ready ? "BEGIN THE JOURNEY" : "THE MAP IS BEING DRAWN…"}
      </button>
      <div className="fell" style={{ marginTop: 7, fontSize: 15, fontStyle: "italic", color: FADED }}>
        {inMap ? `your steed takes wing for ${region.place}` : `and take wing for ${region.place}`}
      </div>
    </div>
  );
}

function ChapterOpener({ region, chapter }: { region: RegionContent; chapter: number }) {
  const tone = useGame((s) => s.tone);
  const t = region[tone];
  return (
    // the illuminated capital takes its ground colour from the land's ring
    <div style={{ "--rb-ring": region.ring } as React.CSSProperties}>
      <Kicker>CHAPTER {roman(chapter)} · {region.place.toUpperCase()}</Kicker>
      <h3 className="cinzel" style={pageTitle}>{t.title}</h3>
      {region.common.label && (
        <div className="cinzel" style={{ fontSize: 12.5, letterSpacing: ".14em", color: FADED, textAlign: "center" }}>
          {region.common.label.toUpperCase()}
        </div>
      )}
      <Flourish />
      {t.sub && <p className="rb-dropcap" style={{ ...prose, fontSize: 19 }}>{t.sub}</p>}

      {region.artifact.name && (
        <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", background: "rgba(0,0,0,.08)", border: `3px double ${ACCENT}`, borderRadius: 2 }}>
          <div
            aria-hidden
            className="cinzel"
            style={{
              width: 48,
              height: 48,
              flex: "none",
              border: `2px solid ${region.ring}`,
              outline: `1px solid ${ACCENT}`,
              outlineOffset: 3,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              fontSize: 21,
              color: HEAD,
              background: "radial-gradient(circle, rgba(201,150,60,.25), transparent)",
            }}
          >
            {region.glyph}
          </div>
          <div>
            <div className="cinzel" style={{ fontSize: 10.5, letterSpacing: ".2em", color: ACCENT }}>THE LAND&apos;S TREASURE</div>
            <div className="cinzel" style={{ fontSize: 14.5, letterSpacing: ".08em", color: HEAD }}>{region.artifact.name}</div>
            <div style={{ fontSize: 15.5, fontStyle: "italic", color: FADED }}>{region.artifact.desc}</div>
          </div>
        </div>
      )}
      {region.quote && (
        <blockquote style={{ margin: "18px 10px 0", fontSize: 17, fontStyle: "italic", textAlign: "center", color: FADED, textWrap: "pretty" }}>
          {region.quote}
        </blockquote>
      )}
      <FlyButton region={region} />
    </div>
  );
}

function ChapterRecord({ region }: { region: RegionContent }) {
  const rec = region.record;
  return (
    <>
      <Kicker heading>THE RECORD · {region.place.toUpperCase()}</Kicker>
      {/* the tale only summarises the record — as on paper, it stands in only
          where no record stands behind it, or every deed is told twice */}
      {!hasRecord(region) && region.deeds.length > 0 && (
        <>
          <SectionRule>THE TALE</SectionRule>
          <Bullets items={region.deeds} />
        </>
      )}
      {region.deeds.length + rec.experiences.length + rec.educations.length + rec.projects.length === 0 && (
        <p className="fell" style={{ marginTop: 24, textAlign: "center", fontStyle: "italic", color: "#6d5a33" }}>
          This chapter is yet unwritten.
        </p>
      )}
      {rec.experiences.length > 0 && (
        <>
          <SectionRule>EMPLOYMENTS</SectionRule>
          {rec.experiences.map((e) => <ExperienceEntry key={e.id} e={e} />)}
        </>
      )}
      {rec.educations.length > 0 && (
        <>
          <SectionRule>LEARNING</SectionRule>
          {rec.educations.map((e) => <EducationEntry key={e.id} e={e} />)}
        </>
      )}
      {rec.projects.length > 0 && (
        <>
          <SectionRule>WORKS &amp; WONDERS</SectionRule>
          {rec.projects.map((p) => <ProjectEntry key={p.id} p={p} />)}
        </>
      )}
      <Tailpiece />
    </>
  );
}

function Tally({ label, n, of }: { label: string; n: number; of: number }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span className="cinzel" style={{ fontSize: 12, letterSpacing: ".14em", color: INK_SOFT }}>{label}</span>
        <span style={{ fontSize: 16.5 }}>
          <b>{n}</b> of {of}
        </span>
      </div>
      <div aria-hidden style={{ height: 6, marginTop: 4, background: "rgba(138,100,32,.14)", border: "1px solid rgba(138,100,32,.35)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${of > 0 ? (100 * n) / of : 0}%`, height: "100%", background: "linear-gradient(90deg, #a8781e, #e2c06d)" }} />
      </div>
    </div>
  );
}

function Epilogue() {
  const s = useGame(
    useShallow((st) => ({
      visited: st.visited, pages: st.pages, beacons: st.beacons,
      phase: st.phase, finaleSeen: st.finaleSeen,
      setCodex: st.setCodex, setCinematic: st.setCinematic,
    })),
  );
  const c = useContent(
    useShallow((ct) => ({ regions: ct.regions, lostPages: ct.lostPages, beacons: ct.beacons, titles: ct.titles, xp: ct.xp })),
  );
  // count only what still exists under the current content (admin may delete)
  const lands = c.regions.filter((r) => s.visited[r.id]).length;
  const pagesN = c.lostPages.filter((p) => s.pages[p.id]).length;
  const beaconsN = c.beacons.filter((b) => s.beacons[b.id]).length;
  const held = c.titles.length > 0 ? Math.min(lands, c.titles.length - 1) : -1;
  const begun = s.phase === "map" || lands > 0;
  return (
    <>
      <Kicker>EPILOGUE</Kicker>
      <h3 className="cinzel" style={pageTitle}>The Road Goes Ever On</h3>
      <Flourish />
      <p className="rb-dropcap" style={prose}>
        Here the written tale pauses — yet the road goes ever on, and so does the work. What follows is the
        record of your own journey through these lands{begun ? "" : ", which has not yet begun"}.
      </p>

      <SectionRule>YOUR JOURNEY</SectionRule>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <Tally label="LANDS CHARTED" n={lands} of={c.regions.length} />
        <ul aria-label="The lands" style={{ listStyle: "none", margin: "-4px 0 0", padding: 0, display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 15 }}>
          {c.regions.map((r) => {
            const done = !!s.visited[r.id];
            return (
              <li key={r.id} style={{ color: done ? HEAD : "rgba(109,90,51,.6)", fontStyle: done ? "normal" : "italic" }}>
                <span aria-hidden style={{ color: done ? "#a8781e" : "rgba(138,100,32,.45)", marginRight: 5 }}>{done ? "✦" : "◇"}</span>
                {r.place}
                {!done && <span className="rb-sr"> (not yet charted)</span>}
              </li>
            );
          })}
        </ul>
        {c.lostPages.length > 0 && <Tally label="LOST PAGES FOUND" n={pagesN} of={c.lostPages.length} />}
        {c.beacons.length > 0 && <Tally label="BEACONS LIT" n={beaconsN} of={c.beacons.length} />}
        <Tally label="RENOWN (XP)" n={xpEarned(s, c)} of={xpMax(c)} />
      </div>
      {s.phase === "map" && s.finaleSeen && (
        <div style={{ marginTop: 22, textAlign: "center" }}>
          <button
            onClick={() => {
              leaveForFlight();
              s.setCodex(false);
              s.setCinematic("finale");
            }}
            className="cinzel hud-btn"
            style={leatherBtn}
          >
            <Icon d="replay" /> WATCH THE ENDING AGAIN
          </button>
        </div>
      )}

      {c.titles.length > 0 && (
        <>
          <SectionRule>TITLES EARNED</SectionRule>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {c.titles.map((t, i) => {
              const earned = i <= held;
              return (
                <li key={i} style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", color: earned ? HEAD : "rgba(109,90,51,.6)" }}>
                  <span aria-hidden style={{ color: earned ? "#a8781e" : "rgba(138,100,32,.45)" }}>{earned ? "✦" : "◇"}</span>
                  <span className={earned ? "cinzel" : undefined} style={earned ? { fontSize: 14.5, letterSpacing: ".04em" } : { fontSize: 16, fontStyle: "italic" }}>
                    {t}
                  </span>
                  {i === held && <span className="cinzel" style={{ fontSize: 10, letterSpacing: ".16em", color: ACCENT }}>· BORNE NOW</span>}
                  {!earned && <span className="rb-sr"> (not yet earned)</span>}
                </li>
              );
            })}
          </ol>
        </>
      )}

      <Tailpiece />
    </>
  );
}

function Colophon({ onPrint }: { onPrint: () => void }) {
  const { phase, setCodex, setContact } = useGame(
    useShallow((s) => ({ phase: s.phase, setCodex: s.setCodex, setContact: s.setContact })),
  );
  const profile = useContent((c) => c.profile);
  const resumes = useContent((c) => c.resumeVariants);
  const p = withFallbacks(profile);
  const resume = resumes.find((v) => v.isDefault) ?? resumes[0];
  return (
    <>
      <Kicker>HERE ENDS THE RED BOOK</Kicker>
      <h3 className="cinzel" style={pageTitle}>The Next Chapter</h3>
      <Flourish />
      <p className="rb-dropcap" style={prose}>
        This tale is not yet finished, and its next chapter is still unwritten. Should you wish a hand in it — a
        role, a venture, or only a question — send word, and it will be answered.
      </p>
      <div style={{ marginTop: 26, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        {/* the raven's form lives in the world; from the cover it would open behind the book */}
        {phase === "map" && (
          <button
            onClick={() => {
              leaveForFlight();
              setCodex(false);
              setContact(true);
            }}
            className="cinzel hud-btn"
            style={leatherBtn}
          >
            <Icon d="quill" /> SEND A RAVEN
          </button>
        )}
        {p.email && (
          <a href={`mailto:${p.email}`} className="cinzel hud-btn rb-btn" style={phase === "map" ? inkBtn : leatherBtn}>
            WRITE TO {p.email.toUpperCase()}
          </a>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
          {resume && (
            <a href={resume.path} {...external} className="cinzel hud-btn rb-btn" style={inkBtn}>
              <Icon d="scroll" /> RÉSUMÉ (PDF)
            </a>
          )}
          <button onClick={onPrint} className="cinzel hud-btn" style={inkBtn}>
            <Icon d="print" /> PRINT THE BOOK
          </button>
        </div>
      </div>
      <div style={{ marginTop: 18, textAlign: "center", fontSize: 15.5, color: FADED }}>
        {p.links.map((l, i) => (
          <Fragment key={l.label + l.url}>
            {i > 0 && " · "}
            <a href={l.url} {...external}>{l.label}</a>
          </Fragment>
        ))}
      </div>
      <Tailpiece>❦ FINIS ❦</Tailpiece>
    </>
  );
}

/** Whatever a leaf holds. */
export function LeafContent({
  leaf,
  leaves,
  onGoto,
  onPrint,
}: {
  leaf: Leaf;
  leaves: Leaf[];
  onGoto: (i: number) => void;
  onPrint: () => void;
}) {
  switch (leaf.kind) {
    case "prologue":
      return <Prologue />;
    case "contents":
      return <Contents leaves={leaves} onGoto={onGoto} />;
    case "opener":
      return <ChapterOpener region={leaf.region} chapter={leaf.chapter} />;
    case "record":
      return <ChapterRecord region={leaf.region} />;
    case "epilogue":
      return <Epilogue />;
    case "colophon":
      return <Colophon onPrint={onPrint} />;
  }
}
