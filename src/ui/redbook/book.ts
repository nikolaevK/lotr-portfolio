import type { ProfileInfo, RegionContent } from "@/state/content";

/**
 * One page of the Red Book. A desktop spread shows two side by side, a phone
 * one at a time — the same leaves either way, so page numbers never change.
 */
export type Leaf =
  | { kind: "prologue" }
  | { kind: "contents" }
  | { kind: "opener" | "record"; region: RegionContent; chapter: number }
  | { kind: "epilogue" }
  | { kind: "colophon" };

/**
 * Prologue + contents, then each land as two facing pages (its illuminated
 * opener, then its record), then epilogue + colophon. Openers always fall on
 * an even leaf, so on desktop every chapter opens as its own spread.
 */
export function buildLeaves(regions: RegionContent[]): Leaf[] {
  return [
    { kind: "prologue" },
    { kind: "contents" },
    ...regions.flatMap((region, i): Leaf[] => [
      { kind: "opener", region, chapter: i + 1 },
      { kind: "record", region, chapter: i + 1 },
    ]),
    { kind: "epilogue" },
    { kind: "colophon" },
  ];
}

export function leafLabel(l: Leaf): string {
  switch (l.kind) {
    case "prologue":
      return "Prologue";
    case "contents":
      return "Contents";
    case "opener":
    case "record":
      return `Chapter ${roman(l.chapter)} · ${l.region.place}`;
    case "epilogue":
      return "Epilogue";
    case "colophon":
      return "The Next Chapter";
  }
}

const NUMERALS: [number, string][] = [
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];
export function roman(n: number): string {
  let out = "";
  for (const [v, s] of NUMERALS) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-01" → "Jan 2026"; no date means the post is still held. */
export function fmtMonth(iso: string | null | undefined): string {
  if (!iso) return "Present";
  const [y, m] = iso.split("-");
  const mi = Number(m) - 1;
  return mi >= 0 && mi < 12 ? `${MONTHS[mi]} ${y}` : iso;
}

/** '·'-separated tech string (as the admin stores it) → items. */
export const techList = (s: string | null): string[] =>
  s ? s.split("·").map((t) => t.trim()).filter(Boolean) : [];

/** Link text without the scheme: what a reader would type, or print. */
export const bareUrl = (url: string) => url.replace(/^(https?:\/\/|mailto:)/, "").replace(/\/$/, "");

export const hasRecord = (r: RegionContent) =>
  r.record.experiences.length + r.record.educations.length + r.record.projects.length > 0;

/** The profile with the raven's fallbacks, so the book still reads without the DB. */
export function withFallbacks(p: ProfileInfo | null): ProfileInfo {
  return {
    name: p?.name || "Konstantin Nikolaev",
    headline: p?.headline || "Full-Stack Software Engineer",
    location: p ? p.location : "Sherman Oaks, CA",
    phone: null, // never shown: the book is public, the number lives on the résumé
    email: p?.email || "konstantin@nikolaev.us",
    summary: p?.summary ?? null,
    links: p?.links?.length
      ? p.links
      : [
          { label: "LinkedIn", url: "https://linkedin.com/in/konn" },
          { label: "GitHub", url: "https://github.com/nikolaevK" },
        ],
  };
}
