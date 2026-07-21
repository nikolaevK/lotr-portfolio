/**
 * Whitelisted content entities editable from /admin. Shared by the admin UI
 * (form generation) and the CRUD API (column whitelist) — nothing outside this
 * config is ever readable or writable through /api/admin/data.
 * Auth tables (admin_users, admin_sessions, login_attempts) are deliberately absent.
 */

export type FieldType = "text" | "textarea" | "number" | "bool";

export type Row = Record<string, unknown>;

/** Foreign key rendered as a dropdown of the referenced entity's rows. */
export interface RefDef {
  /** key into ENTITIES */
  entity: string;
  /** how a referenced row is shown in dropdowns and list cells */
  format: (row: Row) => string;
  /** label for the empty choice when the FK is optional */
  emptyLabel?: string;
}

export interface FieldDef {
  name: string;
  type: FieldType;
  required?: boolean;
  /** short hint shown under the input */
  hint?: string;
  /** FK → dropdown (and id → label resolution in list tables) */
  ref?: RefDef;
  /** fixed value set → dropdown instead of free text */
  options?: string[];
}

export interface EntityDef {
  table: string;
  label: string;
  group: "Career" | "Game" | "World" | "Inbox";
  /** primary key column (INTEGER rowid alias unless noted) */
  pk: string;
  /** pk supplied by the user instead of auto-assigned (settings-style tables) */
  manualPk?: boolean;
  fields: FieldDef[];
  orderBy: string;
  /** columns shown in the list table (subset of fields + pk) */
  listCols: string[];
  /** exactly ONE of these fields must be set (region_links-style bridge rows) */
  exclusiveGroup?: { fields: string[]; label: string };
}

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

// shared FK targets
const REF = {
  profile: { entity: "profiles", format: (r: Row) => s(r.full_name) },
  skillCategory: { entity: "skill_categories", format: (r: Row) => s(r.name) },
  experience: { entity: "experiences", format: (r: Row) => `${s(r.title)} @ ${s(r.company)}` },
  education: { entity: "educations", format: (r: Row) => s(r.institution) },
  project: { entity: "projects", format: (r: Row) => s(r.name) },
  region: { entity: "regions", format: (r: Row) => `${s(r.place)} (${s(r.slug)})` },
} satisfies Record<string, RefDef>;

export const ENTITIES: Record<string, EntityDef> = {
  profiles: {
    table: "profiles", label: "Profile", group: "Career", pk: "id", orderBy: "id",
    listCols: ["id", "full_name", "headline", "email"],
    fields: [
      { name: "full_name", type: "text", required: true },
      { name: "headline", type: "text", required: true },
      { name: "location", type: "text" },
      { name: "phone", type: "text" },
      { name: "email", type: "text" },
      { name: "summary", type: "textarea" },
    ],
  },
  profile_links: {
    table: "profile_links", label: "Profile links", group: "Career", pk: "id", orderBy: "sort_order",
    listCols: ["id", "label", "url", "sort_order"],
    fields: [
      { name: "profile_id", type: "number", required: true, ref: REF.profile },
      { name: "label", type: "text", required: true },
      { name: "url", type: "text", required: true },
      { name: "sort_order", type: "number" },
    ],
  },
  profile_languages: {
    table: "profile_languages", label: "Languages", group: "Career", pk: "id", orderBy: "id",
    listCols: ["id", "name", "proficiency"],
    fields: [
      { name: "profile_id", type: "number", required: true, ref: REF.profile },
      { name: "name", type: "text", required: true },
      { name: "proficiency", type: "text" },
    ],
  },
  skill_categories: {
    table: "skill_categories", label: "Skill categories", group: "Career", pk: "id", orderBy: "sort_order",
    listCols: ["id", "name", "sort_order"],
    fields: [
      { name: "name", type: "text", required: true },
      { name: "sort_order", type: "number" },
    ],
  },
  skills: {
    table: "skills", label: "Skills", group: "Career", pk: "id", orderBy: "category_id, sort_order",
    listCols: ["id", "category_id", "name", "level"],
    fields: [
      { name: "category_id", type: "number", required: true, ref: REF.skillCategory },
      { name: "name", type: "text", required: true },
      { name: "level", type: "text", options: ["core", "working", "familiar"] },
      { name: "sort_order", type: "number" },
    ],
  },
  experiences: {
    table: "experiences", label: "Experiences", group: "Career", pk: "id", orderBy: "sort_order",
    listCols: ["id", "company", "title", "start_date", "end_date"],
    fields: [
      { name: "company", type: "text", required: true },
      { name: "title", type: "text", required: true },
      { name: "location", type: "text" },
      { name: "employment_type", type: "text", options: ["full-time", "apprenticeship", "project-based", "contract"] },
      { name: "start_date", type: "text", required: true, hint: "YYYY-MM" },
      { name: "end_date", type: "text", hint: "YYYY-MM, empty = Present" },
      { name: "summary", type: "textarea" },
      { name: "tech_stack", type: "textarea", hint: "display string: TypeScript · Next.js · …" },
      { name: "sort_order", type: "number" },
    ],
  },
  experience_highlights: {
    table: "experience_highlights", label: "Experience bullets", group: "Career", pk: "id", orderBy: "experience_id, sort_order",
    listCols: ["id", "experience_id", "body"],
    fields: [
      { name: "experience_id", type: "number", required: true, ref: REF.experience },
      { name: "body", type: "textarea", required: true },
      { name: "sort_order", type: "number" },
    ],
  },
  educations: {
    table: "educations", label: "Education", group: "Career", pk: "id", orderBy: "id",
    listCols: ["id", "institution", "start_year", "end_year"],
    fields: [
      { name: "institution", type: "text", required: true },
      { name: "location", type: "text" },
      { name: "start_year", type: "number" },
      { name: "end_year", type: "number" },
      { name: "gpa", type: "text" },
      { name: "notes", type: "textarea" },
    ],
  },
  education_degrees: {
    table: "education_degrees", label: "Degrees", group: "Career", pk: "id", orderBy: "education_id, sort_order",
    listCols: ["id", "education_id", "degree", "field", "honors"],
    fields: [
      { name: "education_id", type: "number", required: true, ref: REF.education },
      { name: "degree", type: "text", required: true, hint: "B.A." },
      { name: "field", type: "text", required: true, hint: "Economics" },
      { name: "honors", type: "text", hint: "Cum Laude" },
      { name: "sort_order", type: "number" },
    ],
  },
  education_courses: {
    table: "education_courses", label: "Courses", group: "Career", pk: "id", orderBy: "education_id, sort_order",
    listCols: ["id", "education_id", "name"],
    fields: [
      { name: "education_id", type: "number", required: true, ref: REF.education },
      { name: "name", type: "text", required: true },
      { name: "sort_order", type: "number" },
    ],
  },
  projects: {
    table: "projects", label: "Projects", group: "Career", pk: "id", orderBy: "sort_order",
    listCols: ["id", "slug", "name", "kind", "year_start"],
    fields: [
      { name: "slug", type: "text", required: true },
      { name: "name", type: "text", required: true },
      { name: "kind", type: "text", options: ["professional", "personal"] },
      { name: "description", type: "textarea" },
      { name: "repo_url", type: "text" },
      { name: "live_url", type: "text" },
      { name: "year_start", type: "number" },
      { name: "year_end", type: "number", hint: "empty = ongoing" },
      { name: "tech_stack", type: "textarea" },
      { name: "sort_order", type: "number" },
    ],
  },
  project_highlights: {
    table: "project_highlights", label: "Project bullets", group: "Career", pk: "id", orderBy: "project_id, sort_order",
    listCols: ["id", "project_id", "body"],
    fields: [
      { name: "project_id", type: "number", required: true, ref: REF.project },
      { name: "body", type: "textarea", required: true },
      { name: "sort_order", type: "number" },
    ],
  },
  // resume_variants is deliberately NOT here: its rows carry the PDF blob, so
  // the generic SELECT * CRUD must never touch it — see the Résumés panel and
  // /api/admin/resume instead.
  regions: {
    table: "regions", label: "Regions", group: "Game", pk: "id", orderBy: "sort_order",
    listCols: ["id", "slug", "place", "glyph"],
    fields: [
      { name: "slug", type: "text", required: true, hint: "terrain/landmarks are keyed by this — change with care" },
      { name: "place", type: "text", required: true },
      { name: "glyph", type: "text", required: true },
      { name: "ring_color", type: "text", required: true, hint: "#5c8a3c" },
      { name: "map_u", type: "number", required: true, hint: "0–1 across the map" },
      { name: "map_v", type: "number", required: true, hint: "0–1 down the map" },
      { name: "quote", type: "textarea" },
      { name: "weather_caption", type: "text" },
      { name: "sort_order", type: "number" },
    ],
  },
  region_tones: {
    table: "region_tones", label: "Region copy (tones)", group: "Game", pk: "id", orderBy: "region_id, tone",
    listCols: ["id", "region_id", "tone", "title"],
    fields: [
      { name: "region_id", type: "number", required: true, ref: REF.region },
      { name: "tone", type: "text", required: true, options: ["common", "elvish"] },
      { name: "label", type: "text", required: true },
      { name: "title", type: "text", required: true },
      { name: "subtitle", type: "textarea", required: true },
    ],
  },
  region_deeds: {
    table: "region_deeds", label: "Region deeds", group: "Game", pk: "id", orderBy: "region_id, sort_order",
    listCols: ["id", "region_id", "body"],
    fields: [
      { name: "region_id", type: "number", required: true, ref: REF.region },
      { name: "body", type: "textarea", required: true },
      { name: "sort_order", type: "number" },
    ],
  },
  artifacts: {
    table: "artifacts", label: "Artifacts", group: "Game", pk: "id", orderBy: "region_id",
    listCols: ["id", "region_id", "name"],
    fields: [
      { name: "region_id", type: "number", required: true, ref: REF.region, hint: "one artifact per region" },
      { name: "name", type: "text", required: true },
      { name: "description", type: "textarea", required: true },
    ],
  },
  region_links: {
    table: "region_links", label: "Region ↔ career links", group: "Game", pk: "id", orderBy: "region_id",
    listCols: ["id", "region_id", "experience_id", "education_id", "project_id"],
    exclusiveGroup: {
      fields: ["experience_id", "education_id", "project_id"],
      label: "What this land dramatizes — pick exactly one target",
    },
    fields: [
      { name: "region_id", type: "number", required: true, ref: REF.region },
      { name: "experience_id", type: "number", ref: REF.experience },
      { name: "education_id", type: "number", ref: REF.education },
      { name: "project_id", type: "number", ref: REF.project },
    ],
  },
  characters: {
    table: "characters", label: "Scroll characters (3D)", group: "Game", pk: "id", orderBy: "region_id, sort_order",
    listCols: ["id", "region_id", "slug", "name", "model_url"],
    fields: [
      { name: "region_id", type: "number", ref: { ...REF.region, emptyLabel: "Global — shown in every scroll" } },
      { name: "slug", type: "text", required: true },
      { name: "name", type: "text", required: true },
      { name: "caption", type: "textarea" },
      { name: "model_url", type: "text", hint: "/models/gandalf.glb — empty shows the framed placeholder" },
      { name: "scale", type: "number", hint: "default 1" },
      { name: "sort_order", type: "number" },
    ],
  },
  titles: {
    table: "titles", label: "Titles", group: "Game", pk: "id", orderBy: "sort_order",
    listCols: ["id", "name", "unlock_rule"],
    fields: [
      { name: "name", type: "text", required: true },
      { name: "unlock_rule", type: "text" },
      { name: "sort_order", type: "number" },
    ],
  },
  lost_pages: {
    table: "lost_pages", label: "Lost pages", group: "World", pk: "id", manualPk: true, orderBy: "id",
    listCols: ["id", "hint", "map_u", "map_v"],
    fields: [
      { name: "map_u", type: "number", required: true },
      { name: "map_v", type: "number", required: true },
      { name: "hint", type: "text", required: true },
    ],
  },
  beacons: {
    table: "beacons", label: "Beacons", group: "World", pk: "id", manualPk: true, orderBy: "id",
    listCols: ["id", "name", "map_u", "map_v"],
    fields: [
      { name: "map_u", type: "number", required: true },
      { name: "map_v", type: "number", required: true },
      { name: "name", type: "text", required: true },
    ],
  },
  voice_lines: {
    table: "voice_lines", label: "Voice lines", group: "World", pk: "id", orderBy: "kind, trigger_key",
    listCols: ["id", "trigger_key", "kind", "file_name"],
    fields: [
      { name: "trigger_key", type: "text", required: true },
      { name: "kind", type: "text", required: true, options: ["region", "event"] },
      { name: "region_id", type: "number", ref: { ...REF.region, emptyLabel: "Not tied to a region" } },
      { name: "file_name", type: "text", required: true, hint: "under public/audio/" },
      { name: "subtitle", type: "textarea" },
      { name: "credit", type: "text" },
      { name: "map_u", type: "number" },
      { name: "map_v", type: "number" },
      { name: "radius", type: "number", hint: "world units" },
    ],
  },
  xp_rules: {
    table: "xp_rules", label: "XP rules", group: "World", pk: "rule_key", manualPk: true, orderBy: "rule_key",
    listCols: ["rule_key", "points"],
    fields: [{ name: "points", type: "number", required: true }],
  },
  game_settings: {
    table: "game_settings", label: "Game settings", group: "World", pk: "key", manualPk: true, orderBy: "key",
    listCols: ["key", "value"],
    fields: [{ name: "value", type: "text", required: true }],
  },
  contact_messages: {
    // visitor-submitted via public /api/contact; listed newest first (ip and
    // created_at come along via SELECT * — deliberately not editable fields)
    table: "contact_messages", label: "Ravens received", group: "Inbox", pk: "id", orderBy: "id DESC",
    listCols: ["id", "created_at", "from_name", "from_email", "message", "ip"],
    fields: [
      { name: "from_name", type: "text", required: true },
      { name: "from_email", type: "text", required: true },
      { name: "message", type: "textarea", required: true },
    ],
  },
};
