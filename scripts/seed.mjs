/**
 * Turso seed: applies db/schema.sql (fully idempotent — every statement is
 * IF NOT EXISTS, so a previously interrupted run self-repairs), then wipes and
 * re-inserts all CONTENT tables. admin_users / admin_sessions / login_attempts
 * are never touched.
 *
 * DESTRUCTIVE: reseeding replaces all content, including edits made in /admin.
 * A non-empty database therefore requires --force:
 *
 *   node --env-file=.env.local scripts/seed.mjs           # fresh DB only
 *   node --env-file=.env.local scripts/seed.mjs --force   # overwrite content
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not set (use --env-file=.env.local)");
  process.exit(1);
}
const db = createClient({ url, authToken });

// ── 1. schema (idempotent — safe to re-apply, repairs partial applies) ───────
console.log("Applying db/schema.sql …");
await db.executeMultiple(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));

// ── guard: never silently destroy admin edits ────────────────────────────────
const populated = await db.execute("SELECT count(*) AS n FROM regions");
if (Number(populated.rows[0].n) > 0 && !process.argv.includes("--force")) {
  console.error(
    "Refusing to reseed: the database already has content (edits made in /admin would be lost).\n" +
    "Re-run with --force to wipe and replace all content tables.",
  );
  process.exit(1);
}

// ── 2. seed data ─────────────────────────────────────────────────────────────
const stmts = [];
const run = (sql, args = []) => stmts.push({ sql, args });

// wipe content tables (cascades cover children); auth tables untouched.
// resume_variants is also deliberately absent: rows carry admin-uploaded PDF
// blobs (irrecoverable binary) — manage them from /admin, not the seed.
for (const t of [
  "characters", "voice_lines", "regions", "titles", "lost_pages", "beacons",
  "cursors", "xp_rules", "game_settings",
  "experiences", "educations", "projects", "skill_categories", "profiles",
]) run(`DELETE FROM ${t}`);

// ── profile ──────────────────────────────────────────────────────────────────
run(
  `INSERT INTO profiles (id, full_name, headline, location, phone, email, summary) VALUES (1,?,?,?,?,?,?)`,
  [
    "Konstantin Nikolaev",
    "Full-Stack Software Engineer",
    "Sherman Oaks, CA",
    "(805) 460-8670",
    "konstantin@nikolaev.us",
    "Full-stack software engineer who architects and ships production applications end-to-end, from database and API design to polished React front-ends. Experienced across the modern TypeScript stack — Next.js, React, and Node.js — building secure multi-tenant platforms, real-time features, payment and third-party integrations, and AI-powered tooling. Comfortable owning projects solo: gathering requirements from stakeholders, researching the problem space, and translating business needs into reliable, well-structured systems. Dual academic background in economics and management supports cross-functional work across product, sales, finance, and operations.",
  ],
);
const links = [
  ["Website", "https://knikolaev.com"],
  ["LinkedIn", "https://linkedin.com/in/konn"],
  ["GitHub", "https://github.com/nikolaevK"],
];
links.forEach(([label, u], i) =>
  run(`INSERT INTO profile_links (profile_id, label, url, sort_order) VALUES (1,?,?,?)`, [label, u, i]),
);
run(`INSERT INTO profile_languages (profile_id, name, proficiency) VALUES (1,'Russian','native/bilingual')`);
run(`INSERT INTO profile_languages (profile_id, name, proficiency) VALUES (1,'English','professional working proficiency')`);

// ── skills ───────────────────────────────────────────────────────────────────
const SKILLS = {
  Languages: ["TypeScript", "JavaScript (ES6+)", "SQL", "HTML/CSS"],
  "Frameworks & UI": ["Next.js (App Router)", "React", "Node.js", "Three.js / @react-three/fiber", "Tailwind CSS", "shadcn/ui", "TanStack Query", "Recharts", "Zustand"],
  "Data & Backend": ["SQLite (Turso/libSQL)", "PostgreSQL", "MongoDB", "Prisma", "Firebase", "REST APIs", "GraphQL", "WebSockets", "Webhooks"],
  "AI & Integrations": ["Anthropic Claude", "Google Gemini", "Voyage AI embeddings", "RAG (hybrid vector + FTS5 retrieval)", "Meta (Facebook) Ads API", "Google Calendar API", "GoHighLevel CRM", "DocuSeal e-signature", "Stripe", "Figma embeds", "SMTP/nodemailer"],
  "Analytics & Business": ["Data analysis & trend identification", "Econometrics", "Business & operations statistics", "Forecasting", "KPI dashboards & data visualization", "Stakeholder requirements gathering", "Market & competitor research", "Process improvement"],
  "Engineering Practice": ["Full-app architecture", "Schema design & migrations", "Auth & RBAC", "Caching strategy", "Agile/Scrum", "Git/GitHub", "Technical documentation"],
  "Trades & Hands-On": ["Electrical wiring, conduit & fixtures", "Blueprint & schematic reading", "Circuit tracing & testing", "Kitchen/bath remodels", "Drywall, tiling, carpentry", "Jobsite safety & multi-trade coordination", "Crew leadership & on-site project management"],
};
Object.entries(SKILLS).forEach(([cat, items], ci) => {
  const catId = ci + 1;
  run(`INSERT INTO skill_categories (id, name, sort_order) VALUES (?,?,?)`, [catId, cat, ci]);
  items.forEach((name, si) =>
    run(`INSERT INTO skills (category_id, name, sort_order) VALUES (?,?,?)`, [catId, name, si]),
  );
});

// ── experiences ──────────────────────────────────────────────────────────────
const EXPERIENCES = [
  {
    id: 1, company: "Agency Collective", title: "Full-Stack Software Engineer",
    location: "Remote", type: "full-time", start: "2026-01", end: null,
    summary: "Sole engineer of a three-portal SaaS platform (agency admin dashboard, client portal, sales-team portal) for managing Meta ad accounts, with AI analytics and role-based access control. Next.js 14 + Turso (libSQL), 60+ tables, deployed on Vercel, with a 171-operation REST API, MCP server, and OAuth 2.1 connector flow.",
    tech: "TypeScript · Next.js · React · Node.js · SQLite (Turso) · REST APIs · Anthropic Claude · Google Gemini · Meta / Google / GoHighLevel APIs · TanStack Query · Tailwind · Recharts",
    highlights: [
      "Designed and built the entire platform end-to-end as sole engineer — three tailored web apps in one product, each showing only the data and tools its role should see.",
      "Worked directly with stakeholders to gather and define requirements — translating business goals, client needs, and operational workflows into technical specs, then scoping, prioritizing, and planning delivery.",
      "Researched each problem space, third-party API, and technology before building — comparing approaches and weighing trade-offs so features fit the business and integrations worked reliably.",
      "Modeled real business logistics into the product — billing cycles, commission and payout rules, appointment scheduling, client onboarding — bridging finance, sales, and operations.",
      "Built the Meta Ads analytics dashboards — KPI cards (spend, ROAS, clicks, conversions, cost-per-result) with account → campaign → ad set drill-downs, performance charts, and an automated alert feed (stalled spend, broken pixel).",
      "Shipped AI features on Anthropic Claude and Google Gemini — an “AI Analyst” chat answering plain-English questions over live ad data, plus AI ad-copy writing and image generation.",
      "Built the client portal: per-client ad metrics, AI analyst chat, embedded Figma design board, live support chat, onboarding checklist, customizable welcome kit.",
      "Built sales pipeline / CRM tooling — deal tracking, commission and payout calculation, leaderboards, and a shared calendar with two-way GoHighLevel + Google Calendar sync.",
      "Built PeptidesAgent (PeptideAds Assistant) — a second full-stack product: an invite-only AI assistant for the RUO peptide industry with Claude streaming chat, hybrid vector + full-text RAG over Turso, Gemini ad-mockup generation driven through native tool use, SSRF-hardened website audits, and per-user atomic cost governance.",
      "Managed the GoHighLevel CRM operation as part of the role — lead-gen workflow automations, the AI appointment-setter, A2P and notification tuning, and the CRM's two-way integration with the dashboard.",
      "Built a full billing suite — recurring invoices with due/overdue reminders, one-click PDF generation and email, e-signature contracts, automatic payment-to-client matching.",
      "Built internal team tools — shared document workspace and an SOP builder with drag-and-drop block editor, live preview, PDF export, and PDF/Word/Markdown import.",
      "Owned the full stack and product decisions — data model, APIs, UI, integrations — plus a built-in documentation section for every feature and a 44-note technical vault.",
    ],
  },
  {
    id: 2, company: "Wealful Inc.", title: "General Construction & Electrical Apprentice",
    location: "Van Nuys, CA", type: "apprenticeship", start: "2025-05", end: "2025-12",
    summary: "Full residential remodels and electrical work for a general contractor — proof the builder builds with hands as well as keyboards.",
    tech: null,
    highlights: [
      "Performed full home-improvement projects including kitchen and bath remodels — framing, wiring, plumbing, tiling, drywall repair, and finish work.",
      "Assembled, installed, repaired, and maintained residential and commercial electrical systems: conduit, junction boxes, switches, receptacles, fixtures — to code.",
      "Read and interpreted blueprints, wiring schematics, and diagrams; traced and tested circuits with testing equipment to diagnose issues and ensure safety compliance.",
      "Met with clients and the general contractor to define scope, requirements, and finishes — turning what the customer wanted into a clear plan of work.",
      "Coordinated with other trades on schedule and budget; maintained a clean, organized, safe jobsite.",
      "Built strong customer relationships that resulted in repeat business and referrals.",
    ],
  },
  {
    id: 3, company: "Project-Based", title: "Software Engineering Projects",
    location: "Remote", type: "project-based", start: "2022-01", end: "2024-12",
    summary: "Self-taught modern web development by shipping complete, data-centric applications end-to-end.",
    tech: "TypeScript · React · Next.js · Node.js · SQL · MongoDB · Firebase · Prisma · GraphQL · REST",
    highlights: [
      "Learned the craft in production form: TypeScript, React, Next.js, Node.js, SQL, MongoDB, Firebase, Prisma, GraphQL, REST.",
      "Built e-commerce, real-time messaging, and content platforms — data models, dashboards, auth, and payments across the full lifecycle.",
      "Applied structured problem-solving and documentation discipline to every build.",
    ],
  },
  {
    id: 4, company: "Simple Moving", title: "Mover / Foreman",
    location: null, type: null, start: "2022-01", end: "2024-12",
    summary: "Led moving crews as working foreman while building software on the side — daily client-facing project delivery under hard time constraints (concurrent with the project-based engineering years).",
    tech: null,
    highlights: [
      "Interacted with clients daily — walkthroughs, scoping, setting expectations, and resolving concerns on the spot — consistently closing jobs with satisfied customers.",
      "Managed teams of varying size and composition, assigning roles, pacing the work, and adapting the plan to access, inventory, and time constraints.",
      "Orchestrated flawless completion of daily projects ranging from 3 to 15 hours — logistics, sequencing, load planning, and problem-solving under pressure, owning each job from arrival to final sign-off.",
    ],
  },
];
EXPERIENCES.forEach((e, i) => {
  run(
    `INSERT INTO experiences (id, company, title, location, employment_type, start_date, end_date, summary, tech_stack, sort_order)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [e.id, e.company, e.title, e.location, e.type, e.start, e.end, e.summary, e.tech, i],
  );
  e.highlights.forEach((h, hi) =>
    run(`INSERT INTO experience_highlights (experience_id, body, sort_order) VALUES (?,?,?)`, [e.id, h, hi]),
  );
});

// ── education ────────────────────────────────────────────────────────────────
run(
  `INSERT INTO educations (id, institution, location, start_year, end_year, gpa, notes) VALUES (1,?,?,?,?,?,?)`,
  [
    "California State University, Northridge", "Northridge, CA", 2017, 2021, "3.65",
    "David Nazarian College of Business & Economics · Dean's List honoree (multiple semesters)",
  ],
);
[["B.A.", "Economics", "Cum Laude"], ["B.S.", "Management", "Cum Laude"]].forEach(([d, f, h], i) =>
  run(`INSERT INTO education_degrees (education_id, degree, field, honors, sort_order) VALUES (1,?,?,?,?)`, [d, f, h, i]),
);
[
  "Introductory Econometrics", "Use of Economic Data", "Managerial Economics",
  "Business Statistics", "Operations Management", "Financial Management",
].forEach((c, i) => run(`INSERT INTO education_courses (education_id, name, sort_order) VALUES (1,?,?)`, [c, i]));

// ── projects ─────────────────────────────────────────────────────────────────
const PROJECTS = [
  {
    id: 1, slug: "lotr-portfolio", name: "There and Back Again — Middle-earth Portfolio",
    kind: "personal", y0: 2026, y1: null,
    desc: "Interactive 3D portfolio: a leather-bound book opens onto a parchment map that rises into living 3D terrain, flown by a procedural dragon or Great Eagle. Everything is procedural — no external 3D assets.",
    tech: "Next.js · React · TypeScript · Three.js / @react-three/fiber · Zustand · WebAudio",
    highlights: [
      "Procedural dragon (17-bone undulating spine, hierarchical wing beats, fire breath with light-casting particles) and Great Eagle (~50 individually articulated feathers, alula pop when braking, tail-fan airbrake).",
      "Heightfield terrain authored after the actual map, with procedural landmarks: Hobbiton, Rivendell, Lórien, Erebor's gate, seven-tiered Minas Tirith, Barad-dûr with a sweeping Eye, erupting Mount Doom.",
      "Per-region weather and atmosphere blending, god rays, GPU particle systems, lightning with delayed thunder, procedural WebAudio soundscape, movie-moment voice lines with subtitles.",
      "Game systems: XP economy, 8 collectible Lost Pages, Beacons of Gondor minigame, 6 earned titles, achievement toasts, persistent save, minimap click-to-travel, quality toggle, touch controls.",
    ],
  },
  {
    id: 2, slug: "agency-dashboard", name: "AgencyCollective Dashboard",
    kind: "professional", y0: 2026, y1: null,
    desc: "Multi-tenant SaaS with three role-gated surfaces, 60+ table libSQL schema with idempotent code-driven migrations, 171-operation REST API v1, MCP server for AI-agent access, OAuth 2.1 + PKCE connector flow, and integrations with Meta Graph API, GoHighLevel, Google Calendar, DocuSeal, Claude, and Gemini.",
    tech: "Next.js · TypeScript · Turso libSQL · REST · MCP · OAuth 2.1 · Meta Graph API · GoHighLevel · Google Calendar",
    highlights: [],
  },
  {
    id: 3, slug: "peptides-agent", name: "PeptidesAgent — PeptideAds Assistant",
    kind: "professional", y0: 2026, y1: null,
    desc: "Full-stack, invite-only AI assistant for the research-use-only (RUO) peptide industry — a second complete product built end-to-end and documented to rebuild-from-scratch level in a 16-note technical vault.",
    tech: "Next.js 15 · React 19 · TypeScript · Turso libSQL (vector + FTS5) · Anthropic Claude · Voyage AI embeddings · Google Gemini · Auth.js v5 · Tailwind v4 · shadcn/ui · Zod",
    highlights: [
      "Streaming chat on Anthropic Claude over an NDJSON protocol with prompt caching and a native tool loop, specialized for RUO peptide vendor, quality, science, market, and compliance questions.",
      "RAG knowledge base — admin-curated docs chunked and embedded with Voyage AI, retrieved via hybrid search combining Turso's native vector ANN with FTS5 full-text.",
      "Ad-creative tooling — users attach ad images for critique; Claude drives Gemini through native tools to generate and edit ad mockups in-conversation.",
      "Website ad-readiness audits — SSRF-hardened, DNS-pinned server-side fetch plus a structured Claude report covering Meta/TikTok compliance, copy, CTAs, design, performance, and SEO.",
      "Cost governance to the cent — every model call atomically reserves estimated spend against a per-user rolling-24h cap before calling the provider, then settles to actual cost; DB-backed rate limiting throughout.",
      "Security posture — the API route is the security boundary: account status re-verified per request, untrusted content wrapped in unforgeable fences against prompt injection, strict CSP, audit log on every sensitive action.",
      "Admin portal — invite-based user management, knowledge-base manager, ad-example curation, audit-log viewer, and a built-in admin handbook whose displayed limits import from the same guardrails module that enforces them.",
    ],
  },
  {
    id: 4, slug: "ghl-crm", name: "GoHighLevel CRM — Automations & Dashboard Integration",
    kind: "professional", y0: 2026, y1: null,
    desc: "Operation and automation of a two-sub-account, multi-vertical GHL lead-gen system (Peptide Ads + Agency Collective master), and its integration into the AgencyCollective Dashboard.",
    tech: "GoHighLevel · Meta Pixel + Conversions API · WhatsApp/A2P SMS · Fathom · REST integration",
    highlights: [
      "Owned the workflow families that run the funnel: server-side Meta CAPI Lead events, form drop-off routing, confirmation double-commitment, conditional reminder sequences, no-show revival, and per-user team notifications.",
      "Managed and tuned the AI appointment-setter (Claude Haiku over voice/SMS/WhatsApp): a 4-week form drop-off follow-up recovering ~28% of drop-offs in a sample month, closer-handoff tags, FAQ training, and frustration-escalation wiring.",
      "Maintained the per-vertical scaffolding pattern — each website/offer gets its own form, calendar, pipeline, and CAPI workflow wired into shared generic nurture automations.",
      "Integrated the CRM with the AgencyCollective Dashboard: two-way appointment status sync and mirrored pipeline stages across both GHL locations.",
      "Authored a 23-note operator playbook (Obsidian vault with validated Mermaid diagrams) covering the full system so it is maintainable by others.",
    ],
  },
  {
    id: 5, slug: "ecommerce", name: "Dynamic E-Commerce Platform",
    kind: "personal", y0: 2022, y1: 2024,
    desc: "Full storefront plus integrated admin dashboard for store customization, product/category management, and sales & revenue analytics. Secure auth, Stripe payments, internal REST API with Prisma data access.",
    tech: "Next.js · TypeScript · PlanetScale/SQL · Prisma · Stripe · Tailwind",
    highlights: [],
  },
  {
    id: 6, slug: "messenger", name: "Real-Time Messenger",
    kind: "personal", y0: 2022, y1: 2024,
    desc: "Real-time messaging with WebSockets and GraphQL subscriptions over a Prisma/MongoDB data layer for users, conversations, and messages; secure authentication and authorization throughout.",
    tech: "Next.js · GraphQL · Prisma · MongoDB · WebSockets",
    highlights: [],
  },
  {
    id: 7, slug: "blog-cms", name: "Blogging / CMS Platform",
    kind: "personal", y0: 2022, y1: 2024,
    desc: "Platform for authoring, managing, and publishing blogs with Firebase auth and database services, plus a commenting system driving reader engagement.",
    tech: "React · Next.js · Firebase · Tailwind",
    highlights: [],
  },
];
PROJECTS.forEach((p, i) => {
  run(
    `INSERT INTO projects (id, slug, name, kind, description, year_start, year_end, tech_stack, sort_order)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [p.id, p.slug, p.name, p.kind, p.desc, p.y0, p.y1, p.tech, i],
  );
  p.highlights.forEach((h, hi) =>
    run(`INSERT INTO project_highlights (project_id, body, sort_order) VALUES (?,?,?)`, [p.id, h, hi]),
  );
});

// (résumé variants are not seeded — upload PDFs from /admin → Résumés)

// ── regions + tones + deeds + artifacts + links ──────────────────────────────
const REGIONS = [
  {
    id: 1, slug: "shire", place: "The Shire", glyph: "S", ring: "#5c8a3c", u: 0.352, v: 0.262,
    quote: "“It's a dangerous business, going out your door.” — He went anyway.",
    caption: "The air smells of pipe-weed and cut grass",
    common: ["Education · CSUN 2017–2021", "The Shire — Where It All Began", "California State University, Northridge · B.A. Economics & B.S. Management · 2017–2021"],
    elvish: ["The Shire", "A Most Respectable Beginning", "In which a young hobbit of Northridge takes up book-learning, and is twice honored for it"],
    deeds: [
      "B.A. Economics, Cum Laude · B.S. Management, Cum Laude — GPA 3.65",
      "Dean's List honoree across multiple semesters",
      "Econometrics, business statistics, operations & financial management",
      "The analytical foundation behind every dashboard built since",
    ],
    artifact: ["Scroll of Reckoning", "Grants +10 to reading numbers and telling their story"],
    links: [{ education_id: 1 }],
    character: ["bilbo", "Bilbo Baggins", "The scholar of Bag End — every ledger tells a story", "/models/bilbo.glb"],
  },
  {
    id: 2, slug: "elf", place: "Rivendell & Lothlórien", glyph: "E", ring: "#3c8a7a", u: 0.502, v: 0.252,
    quote: "“All we have to decide is what to do with the code that is given us.”",
    caption: "Sunlight breaks through — the Elves are singing",
    common: ["Learning the Craft · 2022–2024", "The Elf Realms — The Learning Years", "Self-taught software engineering · project-based · 2022–2024"],
    elvish: ["The Elven Refuges", "The Lore of the Eldar-Stack", "In which the modern arts are studied deep into the night, until the student builds his own"],
    deeds: [
      "Learned the craft: TypeScript, React, Next.js, Node.js, SQL",
      "Built e-commerce, messaging & content platforms end-to-end",
      "Data models, dashboards, auth & payments — the full lifecycle",
      "MongoDB, Firebase, Prisma, GraphQL, REST",
    ],
    artifact: ["Tome of the Eldar", "Its pages are TypeScript; its margins, well-typed"],
    links: [{ experience_id: 3 }, { project_id: 5 }, { project_id: 6 }, { project_id: 7 }],
    character: ["elrond", "Elrond of Rivendell", "Keeper of the old lore, and of well-typed pages", "/models/elrond.glb"],
  },
  {
    id: 3, slug: "dwarf", place: "Erebor & the Iron Hills", glyph: "D", ring: "#b8722c", u: 0.665, v: 0.236,
    quote: "“Not all those who wander are lost — some are pulling wire.”",
    caption: "Forge-smoke and stone-dust on the wind",
    common: ["Construction & Electrical · 2025", "The Dwarf Lands — Halls of Stone & Lightning", "General Construction & Electrical Apprentice — Wealful Inc. · May–Dec 2025"],
    elvish: ["Halls of the Dwarves", "Of Stone-craft and Tamed Lightning", "In which halls are raised, circuits traced, and the smith-lords grant their trust"],
    deeds: [
      "Full kitchen & bath remodels — framing, wiring, plumbing, tiling, finish work",
      "Installed conduit, junction boxes, switches & fixtures to code",
      "Read blueprints & wiring schematics; traced and tested circuits",
      "Met clients to define scope — earned repeat business and referrals",
      "Coordinated trades to keep projects on schedule and on budget",
    ],
    artifact: ["Hammer of the Iron Hills", "Proof that the bearer can build with hands as well as keyboards"],
    links: [{ experience_id: 2 }, { experience_id: 4 }],
    character: ["thorin", "Thorin Oakenshield", "The King under the Mountain — stone-craft, tamed lightning, and no patience for shoddy work", "/models/thorin.glb"],
  },
  {
    id: 4, slug: "gondor", place: "Minas Tirith", glyph: "G", ring: "#c9c9c9", u: 0.607, v: 0.607,
    quote: "“The hands of the king are the hands of a healer” — or at least of a maintainer.",
    caption: "Silver trumpets sound from the White City",
    common: ["Agency Collective · 2026–Present", "The White City — Agency Collective", "Full-Stack Software Engineer · sole engineer of the platform · Jan 2026–Present"],
    elvish: ["The White City", "Steward of the White City", "In which one keeper builds the citadel's every working, and the seeing-stones show all"],
    deeds: [
      "Sole engineer of a three-portal platform — admin, client & sales",
      "Meta Ads analytics: KPI dashboards, drill-downs & automated alert feed",
      "AI Analyst on Claude & Gemini — plain-English answers over live ad data",
      "CRM & sales pipeline: deals, commissions, leaderboards, 2-way calendar sync",
      "Full billing suite: recurring invoices, PDF generation, e-sign contracts",
    ],
    artifact: ["Palantír of the Tower", "A seeing-stone that shows spend, ROAS, and every broken pixel"],
    links: [{ experience_id: 1 }, { project_id: 2 }, { project_id: 3 }, { project_id: 4 }],
    character: ["aragorn", "Aragorn, King Elessar", "One keeper builds the citadel's every working", "/models/strider.glb"],
  },
  {
    id: 5, slug: "mordor", place: "Mordor", glyph: "M", ring: "#a83232", u: 0.713, v: 0.588,
    quote: "“I can't carry it for you — but I can carry you.”",
    caption: "The sky darkens. The Eye is watching.",
    common: ["The Hard Road · staying the course", "Mordor — The Hard Road", "Layoffs, hiring freezes, and a market gone dark — and staying on the path regardless"],
    elvish: ["The Black Land", "The Road Through Shadow", "In which the way grows dark, the towers hire no one, and yet the walker does not turn back"],
    deeds: [
      "Kept building through the industry's leanest hiring years",
      "Took honest work in the Dwarf lands — without ever dropping the craft",
      "Shipped projects and sharpened skills while others left the road",
      "Walked out of the shadow into a full-time engineering role",
      "Like Frodo and Sam: the path was the only way through",
    ],
    artifact: ["The Undimmed Light", "A light in dark places, when all other job boards go out"],
    links: [],
    character: ["sauron", "Sauron, the Dark Lord", "The Eye watched the road — and the walker did not turn back", "/models/sauron.glb"],
  },
];
// display order matches the bundled fallback (src/data/content.ts REGIONS) so
// the list doesn't reorder when hydration replaces the fallback
const REGION_ORDER = { shire: 0, dwarf: 1, elf: 2, gondor: 3, mordor: 4 };
REGIONS.forEach((r) => {
  run(
    `INSERT INTO regions (id, slug, place, glyph, ring_color, map_u, map_v, quote, weather_caption, sort_order)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [r.id, r.slug, r.place, r.glyph, r.ring, r.u, r.v, r.quote, r.caption, REGION_ORDER[r.slug] ?? 99],
  );
  run(`INSERT INTO region_tones (region_id, tone, label, title, subtitle) VALUES (?,?,?,?,?)`, [r.id, "common", ...r.common]);
  run(`INSERT INTO region_tones (region_id, tone, label, title, subtitle) VALUES (?,?,?,?,?)`, [r.id, "elvish", ...r.elvish]);
  r.deeds.forEach((d, di) => run(`INSERT INTO region_deeds (region_id, body, sort_order) VALUES (?,?,?)`, [r.id, d, di]));
  run(`INSERT INTO artifacts (region_id, name, description) VALUES (?,?,?)`, [r.id, ...r.artifact]);
  r.links.forEach((l) =>
    run(`INSERT INTO region_links (region_id, experience_id, education_id, project_id) VALUES (?,?,?,?)`, [
      r.id, l.experience_id ?? null, l.education_id ?? null, l.project_id ?? null,
    ]),
  );
  const [slug, name, cap, model] = r.character;
  run(`INSERT INTO characters (region_id, slug, name, caption, model_url, sort_order) VALUES (?,?,?,?,?,0)`, [r.id, slug, name, cap, model]);
});

// ── titles, pages, beacons, xp, settings, voice lines ────────────────────────
const TITLES = [
  ["Halfling of the Shire", "Chart your first land"],
  ["Wanderer of the West", "Chart two lands"],
  ["Apprentice of the Iron Hills", "Chart three lands"],
  ["Loremaster of Two Trades", "Chart four lands"],
  ["Captain of the White City", "Chart five lands"],
  ["Dragon-rider, Charter of All Lands", "All five lands charted"],
];
TITLES.forEach(([name, rule], i) =>
  run(`INSERT INTO titles (name, unlock_rule, sort_order) VALUES (?,?,?)`, [name, rule, i]),
);

const LOST_PAGES = [
  [0, 0.452, 0.261, "on the winds over Weathertop"],
  [1, 0.306, 0.253, "above the towers of the Grey Havens"],
  [2, 0.52, 0.437, "over the eaves of Fangorn"],
  [3, 0.507, 0.352, "at the Gates of Moria"],
  [4, 0.795, 0.168, "in the smoke of the Iron Hills"],
  [5, 0.54, 0.5, "over the plains of Rohan"],
  [6, 0.634, 0.64, "in the gardens of Ithilien"],
  [7, 0.6, 0.3, "beneath the shadows of Mirkwood"],
];
LOST_PAGES.forEach((p) => run(`INSERT INTO lost_pages (id, map_u, map_v, hint) VALUES (?,?,?,?)`, p));

const BEACONS = [
  [0, 0.585, 0.592, "Amon Dîn"],
  [1, 0.558, 0.573, "Eilenach"],
  [2, 0.531, 0.558, "Halifirien"],
];
BEACONS.forEach((b) => run(`INSERT INTO beacons (id, map_u, map_v, name) VALUES (?,?,?,?)`, b));

Object.entries({ region: 20, page: 5, beacon: 10, all_pages_bonus: 15, all_beacons_bonus: 15 }).forEach(
  ([k, v]) => run(`INSERT INTO xp_rules (rule_key, points) VALUES (?,?)`, [k, v]),
);

Object.entries({
  MAP_W: "3072", MAP_H: "1728", SEA_LEVEL: "2.4", save_key: "there-and-back-again-v1",
}).forEach(([k, v]) => run(`INSERT INTO game_settings (key, value) VALUES (?,?)`, [k, v]));

// voice lines: 11 fly-over triggers + 3 journey events (from src/audio/voice.ts)
const VOICE = [
  ["mordor", 5, "mordor.mp3", "The Black Speech of Mordor rolls from Barad-dûr…", 0.727, 0.583, 320],
  ["moria", null, "moria.mp3", "Gandalf's voice thunders from the deeps of Moria…", 0.507, 0.352, 130],
  ["shire", 1, "shire.mp3", "A song of the Shire drifts up from Hobbiton…", 0.352, 0.262, 210],
  ["rivendell", 2, "rivendell.mp3", "Elven voices echo through the Hidden Valley…", 0.502, 0.252, 150],
  ["lorien", 2, "lorien.mp3", "The Lady of the Wood whispers on the golden air…", 0.548, 0.372, 150],
  ["erebor", 3, "erebor.mp3", "Dwarven horns sound from the halls of Erebor…", 0.664, 0.238, 240],
  ["gondor", 4, "gondor.mp3", "Horns of the White City ring over the Pelennor…", 0.607, 0.607, 210],
  ["rohan", null, "rohan.mp3", "A rider's cry carries across the plains of Rohan…", 0.512, 0.542, 170],
  ["weathertop", null, "weathertop.mp3", "A cold cry rides the wind around Amon Sûl…", 0.452, 0.261, 120],
  ["isengard", null, "isengard.mp3", "A voice of iron issues from Orthanc…", 0.489, 0.489, 140],
  ["havens", null, "havens.mp3", "Gulls and farewells at the Grey Havens…", 0.285, 0.272, 150],
];
VOICE.forEach(([key, rid, file, sub, u, v, rad]) =>
  run(
    `INSERT INTO voice_lines (trigger_key, kind, region_id, file_name, subtitle, map_u, map_v, radius)
     VALUES (?,?,?,?,?,?,?,?)`,
    [key, "region", rid, file, sub, u, v, rad],
  ),
);
[
  ["intro", "intro.mp3", "The journey begins…"],
  ["beacons", "beacons.mp3", "The beacons are lit!"],
  ["complete", "complete.mp3", "All five lands are charted."],
].forEach(([key, file, sub]) =>
  run(`INSERT INTO voice_lines (trigger_key, kind, file_name, subtitle) VALUES (?,?,?,?)`, [key, "event", file, sub]),
);

// ── execute ──────────────────────────────────────────────────────────────────
console.log(`Seeding ${stmts.length} statements …`);
await db.batch(stmts, "write");
const counts = await db.batch(
  ["regions", "region_tones", "region_deeds", "artifacts", "region_links", "experiences",
   "experience_highlights", "educations", "projects", "project_highlights", "skills",
   "titles", "lost_pages", "beacons", "voice_lines", "characters", "resume_variants"]
    .map((t) => `SELECT '${t}' AS t, count(*) AS n FROM ${t}`),
  "read",
);
for (const r of counts) console.log(`  ${r.rows[0].t}: ${r.rows[0].n}`);
console.log("Done.");
