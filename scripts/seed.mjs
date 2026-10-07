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
    "Frontend & Full-Stack Software Engineer",
    "Sherman Oaks, CA",
    "(805) 460-8670",
    "konstantin@nikolaev.us",
    "Frontend-focused full-stack engineer who designs, builds and runs complex React and TypeScript web applications end to end. Sole engineer on three products with role-based access, encrypted secrets, OAuth 2.1 and automated accessibility tests. Built my foundations by hand from 2022 (data structures and algorithms, list virtualization, GraphQL) before adopting AI-assisted development, which I now use daily behind type checks, automated tests and my own review.",
  ],
);
const links = [
  ["Website", "https://lotr-portfolio.vercel.app/"],
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
  Languages: ["TypeScript", "JavaScript (ES6+)", "HTML", "CSS", "SQL", "Rust"],
  Frontend: ["React 18/19", "Next.js (App Router)", "TanStack Query", "Zustand", "React Context", "Tailwind CSS", "Radix/shadcn", "Three.js / React Three Fiber"],
  "Backend & Data": ["Node.js", "RESTful APIs", "OpenAPI 3.1", "GraphQL", "SQLite/libSQL (Turso)", "MySQL", "MongoDB", "Drizzle", "Prisma"],
  Security: ["RBAC", "Signed session cookies", "OAuth 2.1 with PKCE", "TOTP two-factor", "Argon2/scrypt", "AES-256-GCM", "CSP", "Rate limiting"],
  "Testing & Delivery": ["Vitest", "Playwright", "axe-core (WCAG 2.2 AA)", "Git", "Vercel"],
  "AI-Assisted Development": ["Claude Code", "Anthropic API (streaming, tool use)", "MCP servers", "RAG"],
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
    location: "Remote", type: "full-time", start: "2025-11", end: null,
    summary: "Sole engineer at a performance marketing agency. I own architecture, delivery, security and documentation, working directly with sales, finance and operations.",
    tech: "TypeScript · React · Next.js · Node.js · TanStack Query · Zustand · SQLite (Turso) · Drizzle · Stripe · Anthropic API · MCP · OAuth 2.1 · Vitest · Playwright",
    highlights: [],
  },
  {
    id: 2, company: "Wealful Inc.", title: "General Construction & Electrical Apprentice",
    location: "Van Nuys, CA", type: "apprenticeship", start: "2025-05", end: "2025-10",
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
    id: 3, company: "Independent work", title: "Engineering Foundations",
    location: "Remote", type: "self-taught", start: "2022-01", end: "2024-12",
    summary: "Built my foundations by hand from 2022, before adopting AI-assisted development: the fundamentals first, then complete applications.",
    tech: "TypeScript · React · Next.js · Node.js · GraphQL · WebSockets · Prisma · MongoDB · MySQL · Firebase",
    highlights: [
      "List virtualization in React: windowing hooks for fixed and dynamic lists and 2D grids, plus debounce and throttle, no libraries.",
      "Data structures and algorithms: heaps, hash tables, trees, weighted graphs (Dijkstra) and a shunting-yard expression parser.",
      "Full applications: e-commerce, real-time messaging and content platforms, each built end to end — data model, auth, dashboards and payments.",
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
// array order is display order (sort_order); ids are stable for region_links
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
    id: 2, slug: "agency-dashboard", name: "Agency Collective Dashboard",
    kind: "professional", y0: 2025, y1: null,
    desc: "Admin, client and sales portals for a performance marketing agency, in one multi-role app.",
    tech: "Next.js · React · TypeScript · TanStack Query · SQLite (Turso) · OpenAPI 3.1 · MCP · OAuth 2.1 · DocuSeal",
    highlights: [
      "Deal creation and review: built the pipeline closers, setters and admins use daily. One form creates the deal with its draft invoice and e-sign contract and feeds commission and payout records. Approval claims the draft and inserts the deal in one atomic libSQL batch (compare-and-set on the reviewed version, 409 on stale edits), over a schema with 70 indexes (partial unique, covering).",
      "E-signature: replaced DocuSign with open-source DocuSeal to remove per-envelope cost: embedded React template builder and in-portal signing, a Zod-validated API client with retries, webhook status sync and signed PDFs filed to the payout ledger.",
      "REST API and MCP server: designed 180+ operations with a hand-written OpenAPI 3.1 spec, scoped tokens hashed at rest and per-token rate limits, plus an MCP server that generates one tool per operation behind OAuth 2.1 with PKCE. The company's AI agents use it daily to query and analyze clients, deals and billing, and their writes land as drafts for human approval.",
      "Client management: multi-role React app (56 pages, 270+ components) with 13-permission RBAC enforced in edge middleware and again in every route, HMAC-signed sessions and row-level workspace scoping for partner teams. A unit-tested re-bill engine reconciles invoices with payments.",
      "Team task manager (Asana-style): per-member Kanban boards with optimistic TanStack Query updates and server-computed ordering. An AI agent reads Slack and files tasks and action items through the MCP server.",
      "Ad analytics and AI analyst: Meta Ads KPI dashboards (spend, ROAS, conversions, cost per result) with account → campaign → ad set drill-downs and an automated alert feed, plus a chat analyst on Claude and Gemini that answers plain-English questions over live ad data.",
    ],
  },
  {
    id: 8, slug: "ruo-commerce", name: "RUO Commerce",
    kind: "professional", y0: 2026, y1: null,
    desc: "Shopify-style storefront and admin for a research-use-only (RUO) store.",
    tech: "Next.js 16 · React 19 · TypeScript · Zustand · Drizzle · Stripe · OAuth 2.1 · MCP · Vitest · Playwright · axe-core",
    highlights: [
      "Commerce back end: 76-table Drizzle schema covering catalog with lot-level lab certificates, a pricing engine (volume tiers, discounts, gift cards, loyalty), Stripe behind a payment-provider abstraction, tax, shipping, 3PL fulfillment and refunds with restock. Pages prerender with tag-based cache invalidation at one database request per render, and server-side Meta and TikTok conversion events deduplicate against browser pixels by event ID.",
      "MCP server with 79 tools: the store is its own OAuth 2.1 authorization server, and agents act under the connecting staff member's role and scopes to manage products, pages, design and orders. High-impact calls return a preview and need a single-use HMAC confirmation token bound to the arguments and current state. Compare-and-set drafts keep agents and the visual editor from overwriting each other.",
      "Visual editor and quality: drag-and-drop sections with a live preview iframe driven by a typed postMessage protocol, undo and draft/publish. Argon2 and TOTP two-factor sign-in, AES-256-GCM for stored secrets, 200+ unit test files, and Playwright suites with axe WCAG 2.2 AA checks on desktop and mobile.",
    ],
  },
  {
    id: 3, slug: "peptides-agent", name: "PeptideAds Assistant",
    kind: "professional", y0: 2026, y1: null,
    desc: "Invite-only AI chat product for the research-use-only (RUO) peptide industry.",
    tech: "Next.js 15 · React 19 · TypeScript · Anthropic API · Turso (vector + FTS5) · Voyage AI · Google Gemini",
    highlights: [
      "Streaming chat and agent loop: a streaming chat interface and agent tool loop with retrieval over a curated knowledge base (hybrid vector and full-text search on SQLite).",
      "Guardrails: per-user spend caps metered to the cent, and prompt-injection fencing of untrusted content.",
      "Ad-creative tooling: users attach ad images for critique, and Claude drives Gemini through native tools to generate and edit ad mockups in the conversation.",
      "Website audits: SSRF-hardened, DNS-pinned server-side fetch plus a structured report on Meta and TikTok compliance, copy, CTAs, design, performance and SEO.",
    ],
  },
  {
    id: 4, slug: "ghl-crm", name: "GoHighLevel CRM — Automations & Dashboard Integration",
    kind: "professional", y0: 2026, y1: null,
    desc: "Operation and automation of a two-sub-account, multi-vertical GHL lead-gen system (Peptide Ads + Agency Collective master), and its integration into the Agency Collective Dashboard.",
    tech: "GoHighLevel · Meta Pixel + Conversions API · WhatsApp/A2P SMS · Fathom · REST integration",
    highlights: [
      "Funnel automations: owned the workflow families that run the funnel — server-side Meta CAPI Lead events, form drop-off routing, confirmation double-commitment, conditional reminder sequences, no-show revival and per-user team notifications.",
      "AI appointment-setter: managed and tuned a Claude Haiku setter over voice, SMS and WhatsApp. Its 4-week form drop-off follow-up recovered ~28% of drop-offs in a sample month; added closer-handoff tags, FAQ training and frustration-escalation wiring.",
      "Per-vertical scaffolding: each website or offer gets its own form, calendar, pipeline and CAPI workflow, wired into shared generic nurture automations.",
      "Dashboard integration: two-way appointment status sync and mirrored pipeline stages across both GHL locations.",
      "Operator playbook: 23 notes (an Obsidian vault with validated Mermaid diagrams) covering the full system, so others can maintain it.",
    ],
  },
  {
    id: 5, slug: "ecommerce", name: "Multi-Store E-Commerce Dashboard & Storefront",
    kind: "personal", y0: 2022, y1: 2024,
    desc: "A storefront plus an admin dashboard for running several stores: store customization, product and category management, sales and revenue analytics, secure auth and Stripe checkout.",
    tech: "Next.js · TypeScript · Prisma · MySQL · Stripe · Tailwind",
    highlights: [],
  },
  {
    id: 6, slug: "messenger", name: "Real-Time Messenger",
    kind: "personal", y0: 2022, y1: 2024,
    desc: "Real-time messaging over Apollo GraphQL subscriptions on WebSockets, with a Node.js server on Prisma and MongoDB for users, conversations and messages, and authentication throughout.",
    tech: "Next.js · Apollo GraphQL · WebSockets · Node.js · Prisma · MongoDB",
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
    common: ["Learning the Craft · 2022–2024", "The Elf Realms — The Learning Years", "Engineering foundations, built by hand before AI-assisted development · 2022–2024"],
    elvish: ["The Elven Refuges", "The Lore of the Eldar-Stack", "In which the modern arts are studied deep into the night, until the student builds his own"],
    deeds: [
      "Built my foundations by hand from 2022, before adopting AI-assisted development",
      "Data structures from scratch — heaps, hash tables, trees, Dijkstra, a shunting-yard parser",
      "List virtualization in React — windowed lists and 2D grids, no libraries",
      "Real-time messenger on GraphQL subscriptions over WebSockets",
      "Multi-store e-commerce dashboard and storefront with Stripe checkout",
    ],
    artifact: ["Tome of the Eldar", "Its pages are TypeScript; its margins, well-typed"],
    links: [{ experience_id: 3 }, { project_id: 5 }, { project_id: 6 }, { project_id: 7 }],
    character: ["elrond", "Elrond of Rivendell", "Keeper of the old lore, and of well-typed pages", "/models/elrond.glb"],
  },
  {
    id: 3, slug: "dwarf", place: "Erebor & the Iron Hills", glyph: "D", ring: "#b8722c", u: 0.665, v: 0.236,
    quote: "“Not all those who wander are lost — some are pulling wire.”",
    caption: "Forge-smoke and stone-dust on the wind",
    common: ["Construction & Electrical · 2025", "The Dwarf Lands — Halls of Stone & Lightning", "General Construction & Electrical Apprentice — Wealful Inc. · May–Oct 2025"],
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
    common: ["Agency Collective · 2025–Present", "The White City — Agency Collective", "Full-Stack Software Engineer · sole engineer on three products · Nov 2025–Present"],
    elvish: ["The White City", "Steward of the White City", "In which one keeper builds the citadel's every working, and the seeing-stones show all"],
    deeds: [
      "Sole engineer on three products — the agency dashboard, a commerce platform and an AI assistant",
      "Deal pipeline — one form creates the deal, its invoice and e-sign contract, approved in one atomic batch",
      "REST API of 180+ operations, and MCP servers the company's AI agents use every day",
      "Role-based access with 13 permissions, enforced in middleware and again in every route",
      "Security and quality — OAuth 2.1, two-factor sign-in, encrypted secrets, WCAG 2.2 AA tests",
    ],
    artifact: ["Palantír of the Tower", "A seeing-stone that shows spend, ROAS, and every broken pixel"],
    links: [{ experience_id: 1 }, { project_id: 2 }, { project_id: 8 }, { project_id: 3 }, { project_id: 4 }],
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
  [3, 0.499, 0.352, "at the Gates of Moria"],
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
  ["moria", null, "moria.mp3", "Gandalf's voice thunders from the deeps of Moria…", 0.499, 0.352, 130],
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
