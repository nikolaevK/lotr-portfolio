"use client";

import { create } from "zustand";
import {
  BEACONS, CAPTIONS, LOST_PAGES, REGIONS, TITLES, XP,
  type Beacon, type LostPage, type Region,
} from "@/data/content";

/**
 * Editable content, hydrated from /api/content (Turso) at boot. The bundled
 * content.ts stands in as fallback so the game works offline / without a DB.
 *
 * Single source rule: EVERYTHING that renders or scores regions, beacons and
 * lost pages — 3D markers, spawns, weather zones, flight triggers, minimap,
 * HUD counts — reads this store, so admin edits stay consistent everywhere.
 * Only true code-assets remain compiled-in: terrain/landmark meshes, SITES
 * tooltips, world constants (MAP_W…), cursors, and voice trigger geometry.
 */

export interface CharacterInfo {
  slug: string;
  name: string;
  caption: string | null;
  modelUrl: string | null;
  scale: number;
}

export interface ExperienceRecord {
  id: number;
  company: string;
  title: string;
  location: string | null;
  employmentType: string | null;
  start: string;
  end: string | null;
  summary: string | null;
  tech: string | null;
  highlights: string[];
}

export interface EducationRecord {
  id: number;
  institution: string;
  location: string | null;
  startYear: number | null;
  endYear: number | null;
  gpa: string | null;
  notes: string | null;
  degrees: { degree: string; field: string; honors: string | null }[];
  courses: string[];
}

export interface ProjectRecord {
  id: number;
  slug: string;
  name: string;
  kind: string | null;
  description: string | null;
  repoUrl: string | null;
  liveUrl: string | null;
  yearStart: number | null;
  yearEnd: number | null;
  tech: string | null;
  highlights: string[];
}

export interface RegionRecord {
  experiences: ExperienceRecord[];
  educations: EducationRecord[];
  projects: ProjectRecord[];
}

export interface RegionContent extends Region {
  caption: string;
  characters: CharacterInfo[];
  record: RegionRecord;
}

export interface ProfileInfo {
  name: string;
  headline: string;
  location: string | null;
  phone: string | null;
  email: string | null;
  summary: string | null;
  links: { label: string; url: string }[];
}

export interface ResumeVariant {
  label: string;
  path: string;
  isDefault: boolean;
}

interface ContentState {
  loaded: boolean;
  regions: RegionContent[];
  titles: string[];
  lostPages: LostPage[];
  beacons: Beacon[];
  xp: typeof XP;
  profile: ProfileInfo | null;
  resumeVariants: ResumeVariant[];
  hydrate: () => Promise<void>;
}

const emptyRecord = (): RegionRecord => ({ experiences: [], educations: [], projects: [] });

const staticRegions: RegionContent[] = REGIONS.map((r) => ({
  ...r,
  caption: CAPTIONS[r.id] ?? "",
  characters: [],
  record: emptyRecord(),
}));

export const useContent = create<ContentState>()((set) => ({
  loaded: false,
  regions: staticRegions,
  titles: TITLES,
  lostPages: LOST_PAGES,
  beacons: BEACONS,
  xp: XP,
  profile: null,
  resumeVariants: [{ label: "Software Engineer", path: "/assets/resume.pdf", isDefault: true }],

  hydrate: async () => {
    try {
      const res = await fetch("/api/content");
      if (!res.ok) {
        console.warn(`[content] /api/content returned ${res.status} — showing bundled fallback content`);
        return;
      }
      const data = await res.json();
      if (!Array.isArray(data?.regions) || data.regions.length === 0) return;
      // trust well-formed arrays even when empty — an emptied table is an admin
      // decision ("none"), not missing data; fall back only on absent/malformed keys
      set({
        loaded: true,
        regions: data.regions,
        titles: Array.isArray(data.titles) ? data.titles : TITLES,
        lostPages: Array.isArray(data.lostPages) ? data.lostPages : LOST_PAGES,
        beacons: Array.isArray(data.beacons) ? data.beacons : BEACONS,
        xp: data.xp ?? XP,
        profile: data.profile ?? null,
        resumeVariants: Array.isArray(data.resumeVariants)
          ? data.resumeVariants
          : [{ label: "Software Engineer", path: "/assets/resume.pdf", isDefault: true }],
      });
    } catch (err) {
      // offline or DB unreachable — the bundled content stands
      console.warn("[content] hydration failed — showing bundled fallback content", err);
    }
  },
}));

/** Read content outside React (store actions, three.js loops). */
export const content = useContent.getState;

/** Max earnable XP under the current content. */
export const xpMax = (c: Pick<ContentState, "regions" | "lostPages" | "beacons" | "xp">) =>
  c.regions.length * c.xp.region +
  c.lostPages.length * c.xp.page +
  c.beacons.length * c.xp.beacon +
  (c.lostPages.length > 0 ? c.xp.allPagesBonus : 0) +
  (c.beacons.length > 0 ? c.xp.allBeaconsBonus : 0);

/**
 * XP is derived from what was earned under the CURRENT rules, never stored —
 * so rule changes in the admin rescale every save consistently instead of
 * leaving totals frozen at old values (numerator and xpMax always agree).
 */
export const xpEarned = (
  progress: {
    visited: Record<string, boolean>;
    pages: Record<number, boolean>;
    beacons: Record<number, boolean>;
  },
  c: Pick<ContentState, "regions" | "lostPages" | "beacons" | "xp">,
) => {
  // clamp so progress on since-deleted content can't exceed xpMax
  const v = Math.min(Object.keys(progress.visited).length, c.regions.length);
  const p = Math.min(Object.keys(progress.pages).length, c.lostPages.length);
  const b = Math.min(Object.keys(progress.beacons).length, c.beacons.length);
  return (
    v * c.xp.region +
    p * c.xp.page +
    b * c.xp.beacon +
    (c.lostPages.length > 0 && p === c.lostPages.length ? c.xp.allPagesBonus : 0) +
    (c.beacons.length > 0 && b === c.beacons.length ? c.xp.allBeaconsBonus : 0)
  );
};
