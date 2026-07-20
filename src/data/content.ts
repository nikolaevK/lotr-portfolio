// ── World geometry ───────────────────────────────────────────────────────────
// The parchment map is 3072×1728 px. World units = map px × 1.0 → a vast
// 3072 × 1728 realm for the dragon to cross.
export const MAP_W = 3072;
export const MAP_H = 1728;
export const SEA_LEVEL = 2.4;

export type Tone = "common" | "elvish";

export interface RegionTone {
  label: string;
  title: string;
  sub: string;
}

export interface Region {
  id: string;
  /** map-space fractions (u,v) — identical to the 2D concept */
  x: number;
  y: number;
  place: string;
  glyph: string;
  ring: string;
  common: RegionTone;
  elvish: RegionTone;
  deeds: string[];
  artifact: { name: string; desc: string };
  quote: string;
}

// Region content ported 1:1 from the 2D concept (“Middle Earth Portfolio.dc.html”)
export const REGIONS: Region[] = [
  {
    id: "shire",
    x: 0.352,
    y: 0.262,
    place: "The Shire",
    glyph: "S",
    ring: "#5c8a3c",
    common: {
      label: "Education · CSUN 2017–2021",
      title: "The Shire — Where It All Began",
      sub: "California State University, Northridge · B.A. Economics & B.S. Management · 2017–2021",
    },
    elvish: {
      label: "The Shire",
      title: "A Most Respectable Beginning",
      sub: "In which a young hobbit of Northridge takes up book-learning, and is twice honored for it",
    },
    deeds: [
      "B.A. Economics, Cum Laude · B.S. Management, Cum Laude — GPA 3.65",
      "Dean's List honoree across multiple semesters",
      "Econometrics, business statistics, operations & financial management",
      "The analytical foundation behind every dashboard built since",
    ],
    artifact: {
      name: "Scroll of Reckoning",
      desc: "Grants +10 to reading numbers and telling their story",
    },
    quote: "“It’s a dangerous business, going out your door.” — He went anyway.",
  },
  {
    id: "dwarf",
    x: 0.665,
    y: 0.236,
    place: "Erebor & the Iron Hills",
    glyph: "D",
    ring: "#b8722c",
    common: {
      label: "Construction & Electrical · 2025",
      title: "The Dwarf Lands — Halls of Stone & Lightning",
      sub: "General Construction & Electrical Apprentice — Wealful Inc. · May–Dec 2025",
    },
    elvish: {
      label: "Halls of the Dwarves",
      title: "Of Stone-craft and Tamed Lightning",
      sub: "In which halls are raised, circuits traced, and the smith-lords grant their trust",
    },
    deeds: [
      "Full kitchen & bath remodels — framing, wiring, plumbing, tiling, finish work",
      "Installed conduit, junction boxes, switches & fixtures to code",
      "Read blueprints & wiring schematics; traced and tested circuits",
      "Met clients to define scope — earned repeat business and referrals",
      "Coordinated trades to keep projects on schedule and on budget",
    ],
    artifact: {
      name: "Hammer of the Iron Hills",
      desc: "Proof that the bearer can build with hands as well as keyboards",
    },
    quote: "“Not all those who wander are lost — some are pulling wire.”",
  },
  {
    id: "elf",
    x: 0.502,
    y: 0.252,
    place: "Rivendell & Lothlórien",
    glyph: "E",
    ring: "#3c8a7a",
    common: {
      label: "Learning the Craft · 2022–2024",
      title: "The Elf Realms — The Learning Years",
      sub: "Self-taught software engineering · project-based · 2022–2024",
    },
    elvish: {
      label: "The Elven Refuges",
      title: "The Lore of the Eldar-Stack",
      sub: "In which the modern arts are studied deep into the night, until the student builds his own",
    },
    deeds: [
      "Learned the craft: TypeScript, React, Next.js, Node.js, SQL",
      "Built e-commerce, messaging & content platforms end-to-end",
      "Data models, dashboards, auth & payments — the full lifecycle",
      "MongoDB, Firebase, Prisma, GraphQL, REST",
    ],
    artifact: {
      name: "Tome of the Eldar",
      desc: "Its pages are TypeScript; its margins, well-typed",
    },
    quote: "“All we have to decide is what to do with the code that is given us.”",
  },
  {
    id: "gondor",
    x: 0.607,
    y: 0.607,
    place: "Minas Tirith",
    glyph: "G",
    ring: "#c9c9c9",
    common: {
      label: "Agency Collective · 2026–Present",
      title: "The White City — Agency Collective",
      sub: "Full-Stack Software Engineer · sole engineer of the platform · Jan 2026–Present",
    },
    elvish: {
      label: "The White City",
      title: "Steward of the White City",
      sub: "In which one keeper builds the citadel’s every working, and the seeing-stones show all",
    },
    deeds: [
      "Sole engineer of a three-portal platform — admin, client & sales",
      "Meta Ads analytics: KPI dashboards, drill-downs & automated alert feed",
      "AI Analyst on Claude & Gemini — plain-English answers over live ad data",
      "CRM & sales pipeline: deals, commissions, leaderboards, 2-way calendar sync",
      "Full billing suite: recurring invoices, PDF generation, e-sign contracts",
    ],
    artifact: {
      name: "Palantír of the Tower",
      desc: "A seeing-stone that shows spend, ROAS, and every broken pixel",
    },
    quote: "“The hands of the king are the hands of a healer” — or at least of a maintainer.",
  },
  {
    id: "mordor",
    x: 0.713,
    y: 0.588,
    place: "Mordor",
    glyph: "M",
    ring: "#a83232",
    common: {
      label: "The Hard Road · staying the course",
      title: "Mordor — The Hard Road",
      sub: "Layoffs, hiring freezes, and a market gone dark — and staying on the path regardless",
    },
    elvish: {
      label: "The Black Land",
      title: "The Road Through Shadow",
      sub: "In which the way grows dark, the towers hire no one, and yet the walker does not turn back",
    },
    deeds: [
      "Kept building through the industry’s leanest hiring years",
      "Took honest work in the Dwarf lands — without ever dropping the craft",
      "Shipped projects and sharpened skills while others left the road",
      "Walked out of the shadow into a full-time engineering role",
      "Like Frodo and Sam: the path was the only way through",
    ],
    artifact: {
      name: "The Undimmed Light",
      desc: "A light in dark places, when all other job boards go out",
    },
    quote: "“I can’t carry it for you — but I can carry you.”",
  },
];

export const TITLES = [
  "Halfling of the Shire",
  "Wanderer of the West",
  "Apprentice of the Iron Hills",
  "Loremaster of Two Trades",
  "Captain of the White City",
  "Dragon-rider, Charter of All Lands",
];

export const CAPTIONS: Record<string, string> = {
  shire: "The air smells of pipe-weed and cut grass",
  elf: "Sunlight breaks through — the Elves are singing",
  dwarf: "Forge-smoke and stone-dust on the wind",
  gondor: "Silver trumpets sound from the White City",
  mordor: "The sky darkens. The Eye is watching.",
};

// ── Cursors (ported SVGs) ────────────────────────────────────────────────────
const svg = (inner: string) =>
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' + inner + "</svg>",
  );

export const CURSORS = [
  {
    id: "staff",
    name: "Gandalf's staff",
    icon: svg(
      '<defs><radialGradient id="glow"><stop offset="0%" stop-color="#ffffff"/><stop offset="35%" stop-color="#eef4ff" stop-opacity=".9"/><stop offset="100%" stop-color="#9db8e8" stop-opacity="0"/></radialGradient></defs>' +
        '<circle cx="7" cy="6" r="6.5" fill="url(#glow)"/>' +
        '<path d="M9.5,10 C13,13 17,17 21,21 C24,24 26,27 27,29.5" fill="none" stroke="#5c3f1c" stroke-width="3" stroke-linecap="round"/>' +
        '<path d="M10,10.5 C14,14 18,18 22,22" fill="none" stroke="#8a6534" stroke-width="1" stroke-linecap="round" opacity=".8"/>' +
        '<path d="M9,10.5 q-3,-1.5 -3.5,-4 M9.6,10 q-1,-3.5 1.4,-5.5 M8.6,10.6 q-3.6,1 -5.6,-0.6" fill="none" stroke="#4a3010" stroke-width="1.7" stroke-linecap="round"/>' +
        '<polygon points="6.5,1.5 8.8,4.4 7.2,8.2 4.6,7 4.2,3.6" fill="#f2f8ff" stroke="#b8cce0" stroke-width=".7"/>' +
        '<polygon points="6.9,3 7.8,4.8 6.8,7.4 5.4,6.4" fill="#ffffff" opacity=".85"/>',
    ),
  },
  {
    id: "blade",
    name: "Strider's blade",
    icon: svg(
      '<defs><linearGradient id="steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f4f8fa"/><stop offset="45%" stop-color="#c2ccd2"/><stop offset="55%" stop-color="#8e9aa2"/><stop offset="100%" stop-color="#b4bec4"/></linearGradient><linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f4dc9a"/><stop offset="55%" stop-color="#c9963c"/><stop offset="100%" stop-color="#8a5c10"/></linearGradient></defs>' +
        '<polygon points="5,4 17.6,14.2 19.4,18.4 15.2,16.6" fill="url(#steel)" stroke="#7d8a92" stroke-width=".6"/>' +
        '<line x1="6.2" y1="5.4" x2="17" y2="16" stroke="#ffffff" stroke-width=".8" opacity=".8"/>' +
        '<path d="M14.2,19.8 q3.4,-4 5.6,-5.6 q2,1.6 1.2,2.4 q-2.4,1 -4.4,4.6 q-1.6,0.6 -2.4,-1.4 Z" fill="url(#gold)" stroke="#6e4a10" stroke-width=".5"/>' +
        '<circle cx="21.4" cy="12.8" r="1.3" fill="url(#gold)"/><circle cx="13.2" cy="21" r="1.3" fill="url(#gold)"/>' +
        '<path d="M19.2,19.2 L24.6,24.6" stroke="#3b2812" stroke-width="3.2" stroke-linecap="round"/>' +
        '<path d="M19.8,19.8 L24,24 M21.2,19.6 L20,21" stroke="#6b4d24" stroke-width=".9"/>' +
        '<circle cx="26.4" cy="26.4" r="2.2" fill="url(#gold)" stroke="#6e4a10" stroke-width=".6"/>' +
        '<circle cx="25.8" cy="25.8" r=".7" fill="#fff3c4"/>',
    ),
  },
  {
    id: "ring",
    name: "The One Ring",
    icon: svg(
      '<defs><linearGradient id="band" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f8e6ae"/><stop offset="45%" stop-color="#e0ab35"/><stop offset="100%" stop-color="#8a5c10"/></linearGradient></defs>' +
        '<circle cx="16" cy="16" r="11.4" fill="none" stroke="#ff9a3e" stroke-width="1.6" opacity=".28"/>' +
        '<circle cx="16" cy="16" r="10.4" fill="none" stroke="#ffb45e" stroke-width=".9" opacity=".45"/>' +
        '<circle cx="16" cy="16" r="9" fill="none" stroke="url(#band)" stroke-width="4.6"/>' +
        '<path d="M7.4,13.4 A9,9 0 0 1 24.6,13.2" fill="none" stroke="#fff3c4" stroke-width="1.1" opacity=".9"/>' +
        '<path d="M24.4,19.4 A9,9 0 0 1 7.8,19.6" fill="none" stroke="#7a4a08" stroke-width="1.2" opacity=".8"/>' +
        '<circle cx="16" cy="16" r="9" fill="none" stroke="#b45309" stroke-width=".9" stroke-dasharray="1.8 1.4" opacity=".75"/>',
    ),
  },
  {
    id: "axe",
    name: "Dwarven axe",
    icon: svg(
      '<defs><linearGradient id="steel2" x1="0" y1="0" x2="1" y2=".6"><stop offset="0%" stop-color="#eef2f4"/><stop offset="50%" stop-color="#aeb6bc"/><stop offset="100%" stop-color="#7d858c"/></linearGradient></defs>' +
        '<path d="M11,8 L26,27.5" stroke="#5c3f1c" stroke-width="3" stroke-linecap="round"/>' +
        '<path d="M11.6,8.8 L25,26" stroke="#8a6534" stroke-width=".9" opacity=".8"/>' +
        '<path d="M20,20.4 l2.6,2 M21.8,22.8 l2.2,1.7 M23.4,25 l1.9,1.5" stroke="#3b2812" stroke-width="1.2"/>' +
        '<path d="M12.2,9.6 C7,3.4 2.6,5.6 2.8,10.6 C3,15.4 7.2,17.6 12,15.4 C13.4,13.6 13.4,11.4 12.2,9.6 Z" fill="url(#steel2)" stroke="#68727a" stroke-width=".7"/>' +
        '<path d="M3.4,6.8 C2,9 2.2,12.6 4,14.8" fill="none" stroke="#f4f8fa" stroke-width="1.3" opacity=".9"/>' +
        '<path d="M6.5,8.4 q2,2.4 0.4,5" fill="none" stroke="#68727a" stroke-width=".7" opacity=".8"/>' +
        '<rect x="12.2" y="10.2" width="4" height="4.2" rx="1" transform="rotate(38 14.2 12.3)" fill="#8e9aa2" stroke="#68727a" stroke-width=".6"/>' +
        '<circle cx="13.6" cy="11.4" r=".65" fill="#f4dc9a"/><circle cx="14.8" cy="13.2" r=".65" fill="#f4dc9a"/>',
    ),
  },
  {
    id: "bow",
    name: "Elven bow",
    icon: svg(
      '<defs><linearGradient id="wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#a8834a"/><stop offset="50%" stop-color="#6b4d1e"/><stop offset="100%" stop-color="#4a3010"/></linearGradient></defs>' +
        '<path d="M9,3 Q10.6,2 11.4,3.4 Q24,10 24,16 Q24,22 11.4,28.6 Q10.6,30 9,29" fill="none" stroke="url(#wood)" stroke-width="2.4" stroke-linecap="round"/>' +
        '<path d="M12,4.4 Q22,10.4 22,16 Q22,21.6 12,27.6" fill="none" stroke="#c9a55e" stroke-width=".8" opacity=".8"/>' +
        '<path d="M20.4,13.4 q1.8,2.6 0,5.2" fill="none" stroke="#e8d8a8" stroke-width="1.6" stroke-linecap="round"/>' +
        '<line x1="9.6" y1="3.6" x2="9.6" y2="28.4" stroke="#e8e0cc" stroke-width=".9"/>' +
        '<line x1="6.5" y1="16" x2="25" y2="16" stroke="#7a5c2e" stroke-width="1.4"/>' +
        '<polygon points="3.2,16 8.4,13.8 7,16 8.4,18.2" fill="#cfd6da" stroke="#8e9aa2" stroke-width=".5"/>' +
        '<path d="M22,16 l2.6,-2 l1.6,.6 l-2.4,1.4 l2.4,1.4 l-1.6,.6 Z" fill="#8c2e1e"/>',
    ),
  },
];

// ── “And more”: collectible lost pages of the Red Book ──────────────────────
export interface LostPage {
  id: number;
  x: number; // map u
  y: number; // map v
  hint: string;
}

export const LOST_PAGES: LostPage[] = [
  { id: 0, x: 0.452, y: 0.261, hint: "on the winds over Weathertop" },
  { id: 1, x: 0.306, y: 0.253, hint: "above the towers of the Grey Havens" },
  { id: 2, x: 0.520, y: 0.437, hint: "over the eaves of Fangorn" },
  { id: 3, x: 0.507, y: 0.352, hint: "at the Gates of Moria" },
  { id: 4, x: 0.795, y: 0.168, hint: "in the smoke of the Iron Hills" },
  { id: 5, x: 0.540, y: 0.500, hint: "over the plains of Rohan" },
  { id: 6, x: 0.634, y: 0.640, hint: "in the gardens of Ithilien" },
  { id: 7, x: 0.60, y: 0.30, hint: "beneath the shadows of Mirkwood" },
];

// ── “And more”: the Beacons of Gondor (lit with dragon-fire) ─────────────────
export interface Beacon {
  id: number;
  x: number;
  y: number;
  name: string;
}

export const BEACONS: Beacon[] = [
  { id: 0, x: 0.585, y: 0.592, name: "Amon Dîn" },
  { id: 1, x: 0.558, y: 0.573, name: "Eilenach" },
  { id: 2, x: 0.531, y: 0.558, name: "Halifirien" },
];

// XP economy
export const XP = {
  region: 20,
  page: 5,
  beacon: 10,
  allPagesBonus: 15,
  allBeaconsBonus: 15,
};
export const XP_MAX =
  REGIONS.length * XP.region +
  LOST_PAGES.length * XP.page +
  BEACONS.length * XP.beacon +
  XP.allPagesBonus +
  XP.allBeaconsBonus;

// Convenience: map-fraction → world coords
export const toWorldX = (u: number) => u * MAP_W;
export const toWorldZ = (v: number) => v * MAP_H;

// World-edge margin the steed (flight.ts) and the map-view pan share
export const EDGE = { x: 60, z: 55 };

// Map-view camera geometry — CameraRig places the eye with it, MapExplore
// derives drag calibration from it; they must agree
export const OVERVIEW_CAM = { height: 560, back: 290 };

/**
 * Notable places — the single source for landmark anchors (Landmarks.tsx),
 * map-view hover volumes and tooltips (MapExplore.tsx).
 * r = hover radius in world units; radii are chosen so no two sites overlap
 * (overlapping hover volumes fight over the one tooltip).
 */
export interface MapSite { u: number; v: number; r: number; title: string; text: string }

export const SITES = {
  hobbiton: { u: 0.352, v: 0.258, r: 70, title: "Hobbiton", text: "A well-ordered land of pipe-smoke, second breakfasts and round green doors. The beacon here marks a chapter — click it to travel." },
  rivendell: { u: 0.502, v: 0.252, r: 60, title: "Rivendell", text: "The Last Homely House east of the Sea — counsel and song in the Hidden Valley. The beacon here marks a chapter — click it to travel." },
  lorien: { u: 0.548, v: 0.372, r: 55, title: "Lothlórien", text: "The Golden Wood, where mallorn leaves fall like coins of light." },
  moria: { u: 0.507, v: 0.352, r: 55, title: "The West-gate of Moria", text: "Doors of Durin, Lord of Moria. Speak, friend, and enter." },
  erebor: { u: 0.664, v: 0.240, r: 70, title: "Erebor", text: "The Lonely Mountain — dwarven halls beneath the peak, and a hoard long remembered. The beacon here marks a chapter — click it to travel." },
  minastirith: { u: 0.607, v: 0.607, r: 65, title: "Minas Tirith", text: "The White City, seven-walled, ever watching the East. The beacon here marks a chapter — click it to travel." },
  baraddur: { u: 0.727, v: 0.583, r: 40, title: "Barad-dûr", text: "The Dark Tower. The Eye turns hither — do not linger." },
  mountdoom: { u: 0.700, v: 0.585, r: 40, title: "Mount Doom", text: "Orodruin, the Mountain of Fire, where the Ring was forged and unmade." },
  edoras: { u: 0.512, v: 0.542, r: 55, title: "Edoras", text: "Meduseld, the Golden Hall — seat of the Lords of the Mark." },
  orthanc: { u: 0.489, v: 0.489, r: 55, title: "Isengard", text: "The tower of Orthanc, ringed by the wall and pits of Saruman." },
  weathertop: { u: 0.452, v: 0.261, r: 50, title: "Weathertop", text: "Amon Sûl — a broken watchtower, older than the kingdoms of Men." },
  havens: { u: 0.288, v: 0.278, r: 60, title: "The Grey Havens", text: "Mithlond, whence the white ships sail into the West." },
} satisfies Record<string, MapSite>;
