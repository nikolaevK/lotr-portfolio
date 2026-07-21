import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { db } from "@/server/db";

export const runtime = "nodejs";
// Statically cached (ISR): admin writes purge the "content" tag so edits show
// up immediately; revalidate bounds staleness if a purge is ever missed.
export const dynamic = "force-static";
export const revalidate = 300;

/**
 * The whole editable game payload in one request. Shapes mirror the static
 * fallbacks in src/data/content.ts so the store can swap either in.
 */
async function buildContent() {
  const [
    regions, tones, deeds, artifacts, links, characters,
    experiences, expHighlights, educations, eduDegrees, eduCourses,
    projects, projHighlights, titles, lostPages, beacons, xp,
    profile, profileLinks, resumeVariants,
  ] = await db().batch(
    [
      "SELECT * FROM regions ORDER BY sort_order",
      "SELECT * FROM region_tones",
      "SELECT * FROM region_deeds ORDER BY region_id, sort_order",
      "SELECT * FROM artifacts",
      "SELECT * FROM region_links",
      "SELECT * FROM characters ORDER BY sort_order",
      "SELECT * FROM experiences ORDER BY sort_order",
      "SELECT * FROM experience_highlights ORDER BY experience_id, sort_order",
      "SELECT * FROM educations",
      "SELECT * FROM education_degrees ORDER BY education_id, sort_order",
      "SELECT * FROM education_courses ORDER BY education_id, sort_order",
      "SELECT * FROM projects ORDER BY sort_order",
      "SELECT * FROM project_highlights ORDER BY project_id, sort_order",
      "SELECT * FROM titles ORDER BY sort_order",
      "SELECT * FROM lost_pages ORDER BY id",
      "SELECT * FROM beacons ORDER BY id",
      "SELECT * FROM xp_rules",
      "SELECT * FROM profiles LIMIT 1",
      "SELECT * FROM profile_links ORDER BY sort_order",
      "SELECT * FROM resume_variants ORDER BY sort_order",
    ],
    "read",
  );

  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

  const expById = new Map(
    experiences.rows.map((e) => [
      Number(e.id),
      {
        id: Number(e.id),
        company: str(e.company)!,
        title: str(e.title)!,
        location: str(e.location),
        employmentType: str(e.employment_type),
        start: str(e.start_date)!,
        end: str(e.end_date),
        summary: str(e.summary),
        tech: str(e.tech_stack),
        highlights: expHighlights.rows.filter((h) => Number(h.experience_id) === Number(e.id)).map((h) => String(h.body)),
      },
    ]),
  );
  const eduById = new Map(
    educations.rows.map((e) => [
      Number(e.id),
      {
        id: Number(e.id),
        institution: str(e.institution)!,
        location: str(e.location),
        startYear: num(e.start_year),
        endYear: num(e.end_year),
        gpa: str(e.gpa),
        notes: str(e.notes),
        degrees: eduDegrees.rows
          .filter((d) => Number(d.education_id) === Number(e.id))
          .map((d) => ({ degree: String(d.degree), field: String(d.field), honors: str(d.honors) })),
        courses: eduCourses.rows.filter((c) => Number(c.education_id) === Number(e.id)).map((c) => String(c.name)),
      },
    ]),
  );
  const projById = new Map(
    projects.rows.map((p) => [
      Number(p.id),
      {
        id: Number(p.id),
        slug: str(p.slug)!,
        name: str(p.name)!,
        kind: str(p.kind),
        description: str(p.description),
        repoUrl: str(p.repo_url),
        liveUrl: str(p.live_url),
        yearStart: num(p.year_start),
        yearEnd: num(p.year_end),
        tech: str(p.tech_stack),
        highlights: projHighlights.rows.filter((h) => Number(h.project_id) === Number(p.id)).map((h) => String(h.body)),
      },
    ]),
  );

  const expOrder = new Map(experiences.rows.map((e) => [Number(e.id), Number(e.sort_order ?? 0)]));
  const projOrder = new Map(projects.rows.map((p) => [Number(p.id), Number(p.sort_order ?? 0)]));

  const regionsOut = regions.rows.map((r) => {
    const rid = Number(r.id);
    const tone = (t: string) => {
      const row = tones.rows.find((x) => Number(x.region_id) === rid && x.tone === t);
      return row
        ? { label: String(row.label), title: String(row.title), sub: String(row.subtitle) }
        : { label: String(r.place), title: String(r.place), sub: "" };
    };
    const art = artifacts.rows.find((a) => Number(a.region_id) === rid);
    const myLinks = links.rows.filter((l) => Number(l.region_id) === rid);
    return {
      id: String(r.slug),
      x: Number(r.map_u),
      y: Number(r.map_v),
      place: String(r.place),
      glyph: String(r.glyph),
      ring: String(r.ring_color),
      quote: str(r.quote) ?? "",
      caption: str(r.weather_caption) ?? "",
      common: tone("common"),
      elvish: tone("elvish"),
      deeds: deeds.rows.filter((d) => Number(d.region_id) === rid).map((d) => String(d.body)),
      artifact: art
        ? { name: String(art.name), desc: String(art.description) }
        : { name: "", desc: "" },
      // region_id NULL = global: the character appears in every scroll
      characters: characters.rows
        .filter((c) => c.region_id === null || Number(c.region_id) === rid)
        .map((c) => ({
          slug: String(c.slug),
          name: String(c.name),
          caption: str(c.caption),
          modelUrl: str(c.model_url),
          scale: Number(c.scale ?? 1),
        })),
      // records follow the admin-editable sort_order of the target rows,
      // not region_links insertion order
      record: {
        experiences: myLinks
          .flatMap((l) => expById.get(Number(l.experience_id)) ?? [])
          .sort((a, b) => (expOrder.get(a.id) ?? 0) - (expOrder.get(b.id) ?? 0)),
        educations: myLinks.flatMap((l) => eduById.get(Number(l.education_id)) ?? []),
        projects: myLinks
          .flatMap((l) => projById.get(Number(l.project_id)) ?? [])
          .sort((a, b) => (projOrder.get(a.id) ?? 0) - (projOrder.get(b.id) ?? 0)),
      },
    };
  });

  const xpMap: Record<string, number> = {};
  for (const r of xp.rows) xpMap[String(r.rule_key)] = Number(r.points);

  const p = profile.rows[0];
  const body = {
    regions: regionsOut,
    titles: titles.rows.map((t) => String(t.name)),
    lostPages: lostPages.rows.map((r) => ({ id: Number(r.id), x: Number(r.map_u), y: Number(r.map_v), hint: String(r.hint) })),
    beacons: beacons.rows.map((r) => ({ id: Number(r.id), x: Number(r.map_u), y: Number(r.map_v), name: String(r.name) })),
    xp: {
      region: xpMap.region ?? 20,
      page: xpMap.page ?? 5,
      beacon: xpMap.beacon ?? 10,
      allPagesBonus: xpMap.all_pages_bonus ?? 15,
      allBeaconsBonus: xpMap.all_beacons_bonus ?? 15,
    },
    profile: p
      ? {
          name: String(p.full_name),
          headline: String(p.headline),
          location: str(p.location),
          phone: str(p.phone),
          email: str(p.email),
          summary: str(p.summary),
          links: profileLinks.rows.map((l) => ({ label: String(l.label), url: String(l.url) })),
        }
      : null,
    resumeVariants: resumeVariants.rows.map((v) => ({
      label: String(v.label),
      path: String(v.file_path),
      isDefault: Number(v.is_default) === 1,
    })),
  };

  return body;
}

const getContent = unstable_cache(buildContent, ["content-payload"], { tags: ["content"] });

export async function GET() {
  return NextResponse.json(await getContent());
}
