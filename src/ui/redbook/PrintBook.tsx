"use client";

import { createPortal } from "react-dom";
import { useContent, type RegionContent } from "@/state/content";
import { bareUrl, fmtMonth, hasRecord, roman, techList, withFallbacks } from "@/ui/redbook/book";

/**
 * Paper takes only this. A child of <body>, so the print rule can drop every
 * other body child — the WebGL canvas, HUD, cover and the on-screen book all
 * live inside the app root — and nothing positioned or overflow-clipped sits
 * above it to cut the document to one page.
 */
const PRINT_CSS = `
.rb-print { display: none; }
@media print {
  @page { margin: 14mm 15mm 15mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > :not(.rb-print) { display: none !important; }
  .rb-print { display: block; color: #1e160b; font-family: var(--font-garamond), Georgia, serif; font-size: 10.5pt; line-height: 1.4; overflow-wrap: anywhere; }
  .rb-print h1, .rb-print h2, .rb-print h3, .rb-print .rb-p-kicker { font-family: var(--font-cinzel), serif; }
  .rb-print a { color: inherit; text-decoration: none; }
  .rb-print p { margin: 0; }
  .rb-print > header { text-align: center; padding-bottom: 8pt; border-bottom: 2.2pt double #8a6420; }
  .rb-print .rb-p-kicker { font-size: 7.5pt; letter-spacing: .26em; text-transform: uppercase; color: #8a6420; }
  .rb-print h1 { font-size: 23pt; font-weight: 700; letter-spacing: .03em; margin: 3pt 0 1pt; }
  .rb-print .rb-p-headline { font-size: 12pt; font-style: italic; }
  .rb-print .rb-p-contact { font-size: 9.5pt; margin-top: 3pt; }
  .rb-print section { margin-top: 12pt; }
  .rb-print section > header { border-bottom: .6pt solid #c9a35a; padding-bottom: 2pt; margin-bottom: 4pt; break-after: avoid; break-inside: avoid; }
  .rb-print h2 { font-size: 12.5pt; font-weight: 700; margin: 1pt 0 0; }
  .rb-print .rb-p-sub { font-style: italic; color: #4a3a1c; }
  .rb-print h3 { font-size: 8pt; font-weight: 600; letter-spacing: .2em; text-transform: uppercase; color: #8a6420; margin: 7pt 0 1pt; break-after: avoid; }
  .rb-print article { margin: 4pt 0 7pt; }
  .rb-print article.rb-p-short { break-inside: avoid; }
  .rb-print .rb-p-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12pt; break-after: avoid; }
  .rb-print h4 { font-size: 11pt; font-weight: 700; margin: 0; }
  .rb-print .rb-p-when { flex: none; font-size: 9.5pt; color: #4a3a1c; }
  .rb-print .rb-p-meta { font-style: italic; color: #4a3a1c; break-after: avoid; }
  .rb-print ul { margin: 2pt 0 0; padding-left: 13pt; }
  .rb-print li { margin: 1.5pt 0; break-inside: avoid; }
  .rb-print .rb-p-tech { font-size: 9.5pt; color: #3a2c14; margin-top: 2pt; }
  .rb-print > footer { break-before: avoid; margin-top: 16pt; padding-top: 5pt; border-top: .6pt solid #c9a35a; text-align: center; font-size: 9pt; font-style: italic; color: #6d5a33; }
}
`;

function Tech({ s }: { s: string | null }) {
  const items = techList(s);
  return items.length > 0 ? <p className="rb-p-tech"><b>Tools:</b> {items.join(" · ")}</p> : null;
}

/** One land, as a résumé section: plain ink, every deed. */
function PrintChapter({ region, n }: { region: RegionContent; n: number }) {
  const rec = region.record;
  return (
    <section>
      <header>
        <div className="rb-p-kicker">Chapter {roman(n)} · {region.place}</div>
        {/* paper is for the recruiter: always the common tongue */}
        <h2>{region.common.title}</h2>
        {region.common.sub && <p className="rb-p-sub">{region.common.sub}</p>}
      </header>
      {/* the tale's deeds only where no record stands behind them */}
      {!hasRecord(region) && (
        <ul>
          {region.deeds.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
      )}
      {rec.experiences.length > 0 && <h3>Employments</h3>}
      {rec.experiences.map((e) => (
        <article key={e.id} className={e.highlights.length === 0 ? "rb-p-short" : undefined}>
          <div className="rb-p-row">
            <h4>{e.title} — {e.company}</h4>
            <span className="rb-p-when">{fmtMonth(e.start)} – {fmtMonth(e.end)}</span>
          </div>
          {(e.location || e.employmentType) && (
            <p className="rb-p-meta">{[e.location, e.employmentType].filter(Boolean).join(" · ")}</p>
          )}
          {e.summary && <p>{e.summary}</p>}
          {e.highlights.length > 0 && (
            <ul>
              {e.highlights.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          )}
          <Tech s={e.tech} />
        </article>
      ))}
      {rec.educations.length > 0 && <h3>Learning</h3>}
      {rec.educations.map((e) => (
        <article key={e.id} className="rb-p-short">
          <div className="rb-p-row">
            <h4>{e.institution}</h4>
            {(e.startYear || e.endYear) && <span className="rb-p-when">{e.startYear} – {e.endYear ?? "Present"}</span>}
          </div>
          {e.location && <p className="rb-p-meta">{e.location}</p>}
          <ul>
            {e.degrees.map((d, i) => (
              <li key={i}>
                <b>{d.degree} {d.field}</b>
                {d.honors ? `, ${d.honors}` : ""}
              </li>
            ))}
            {(e.gpa || e.notes) && <li>{[e.gpa && `GPA ${e.gpa}`, e.notes].filter(Boolean).join(" · ")}</li>}
            {e.courses.length > 0 && <li>Coursework: {e.courses.join(" · ")}</li>}
          </ul>
        </article>
      ))}
      {rec.projects.length > 0 && <h3>Works &amp; Wonders</h3>}
      {rec.projects.map((p) => (
        <article key={p.id} className={p.highlights.length === 0 ? "rb-p-short" : undefined}>
          <div className="rb-p-row">
            <h4>{p.name}</h4>
            {p.yearStart && <span className="rb-p-when">{p.yearStart} – {p.yearEnd ?? "ongoing"}</span>}
          </div>
          {(p.kind || p.liveUrl || p.repoUrl) && (
            <p className="rb-p-meta">
              {[p.kind, p.liveUrl && bareUrl(p.liveUrl), p.repoUrl && `source: ${bareUrl(p.repoUrl)}`].filter(Boolean).join(" · ")}
            </p>
          )}
          {p.description && <p>{p.description}</p>}
          {p.highlights.length > 0 && (
            <ul>
              {p.highlights.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          )}
          <Tech s={p.tech} />
        </article>
      ))}
    </section>
  );
}

/** The whole book as one clean, single-column document — mounted only to print. */
export function PrintBook() {
  const regions = useContent((c) => c.regions);
  const p = withFallbacks(useContent((c) => c.profile));
  const contact = [p.location, p.email, ...p.links.map((l) => bareUrl(l.url))].filter(Boolean);
  return createPortal(
    <div className="rb-print">
      <style>{PRINT_CSS}</style>
      <header>
        <div className="rb-p-kicker">The Red Book of Westmarch</div>
        <h1>{p.name}</h1>
        <p className="rb-p-headline">{p.headline}</p>
        <p className="rb-p-contact">{contact.join("  ·  ")}</p>
      </header>
      {p.summary && (
        <section>
          <header>
            <div className="rb-p-kicker">Prologue</div>
            <h2>Concerning the Author</h2>
          </header>
          <p>{p.summary}</p>
        </section>
      )}
      {regions.map((r, i) => <PrintChapter key={r.id} region={r} n={i + 1} />)}
      <footer>
        Here ends the Red Book — the whole tale, told as a flight over Middle-earth, waits at {window.location.host}
      </footer>
    </div>,
    document.body,
  );
}
