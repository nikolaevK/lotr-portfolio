/**
 * The postcard: a captured frame developed in the chosen look, set in a
 * burnt-edged parchment card with its place, date and compass rose.
 * Pure 2D-canvas work, run once per capture.
 */
import { SITES, SEA_LEVEL, toWorldX, toWorldZ } from "@/data/content";
import { content } from "@/state/content";
import { heightAt } from "@/three/noise";
import type { FilterFn, Look } from "@/three/PhotoMode";

/* ── naming the shot ─────────────────────────────────────────────────────── */

const WINDS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];

/** "Rivendell", "Mordor", or "The wilds east of Weathertop" — read off the map. */
export function placeName(x: number, z: number): string {
  let site = { title: "", r: 0, x: 0, z: 0, d: Infinity };
  for (const s of Object.values(SITES)) {
    const sx = toWorldX(s.u);
    const sz = toWorldZ(s.v);
    const d = Math.hypot(x - sx, z - sz);
    if (d < site.d) site = { title: s.title, r: s.r, x: sx, z: sz, d };
  }
  if (site.d < site.r * 2.2) return site.title;
  let region = { place: "", d: 260 };
  for (const r of content().regions) {
    const d = Math.hypot(x - toWorldX(r.x), z - toWorldZ(r.y));
    if (d < region.d) region = { place: r.place, d };
  }
  if (region.place) return region.place;
  // +x is east and +z south on the map
  const wind = WINDS[(Math.round(Math.atan2(z - site.z, x - site.x) / (Math.PI / 4)) + 8) % 8];
  const ground = heightAt(x, z) > SEA_LEVEL ? "The wilds" : "The waters";
  return `${ground} ${wind} of ${site.title.replace(/^The /, "the ")}`;
}

function dateLine(d: Date) {
  const n = d.getDate();
  const th = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `the ${n}${th} of ${d.toLocaleString("en-GB", { month: "long" })}, ${d.getFullYear()}`;
}

/* ── developing the postcard ─────────────────────────────────────────────── */

const INK = "#2c1f0d";

/** CSS filter functions as colour matrices (Filter Effects spec), with an
 *  offset in 0..255 — so the postcard matches the live preview. */
function filterMatrix(fn: FilterFn, v: number): [number[], number] {
  const s = 1 - Math.min(v, 1);
  switch (fn) {
    case "brightness":
      return [[v, 0, 0, 0, v, 0, 0, 0, v], 0];
    case "contrast":
      return [[v, 0, 0, 0, v, 0, 0, 0, v], 255 * (0.5 - 0.5 * v)];
    case "saturate":
      return [[0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v, 0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v, 0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v], 0];
    case "grayscale":
      return [[0.2126 + 0.7874 * s, 0.7152 - 0.7152 * s, 0.0722 - 0.0722 * s, 0.2126 - 0.2126 * s, 0.7152 + 0.2848 * s, 0.0722 - 0.0722 * s, 0.2126 - 0.2126 * s, 0.7152 - 0.7152 * s, 0.0722 + 0.9278 * s], 0];
    case "sepia":
      return [[0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s, 0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s, 0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s], 0];
  }
}

const breathe = () => new Promise<void>((r) => setTimeout(r));

/** Burn the look into the shot's pixels. ctx.filter would be one line, but
 *  Safari has none — and iPhones are half of who takes these. Worked in
 *  slices with a breath between, so the page never stalls on a big frame. */
async function develop(ctx: CanvasRenderingContext2D, w: number, h: number, look: Look) {
  if (look.filter.length) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    // every step as 9 coefficients + an offset, flat for the hot loop
    const steps = look.filter.flatMap(([fn, v]) => {
      const [m, o] = filterMatrix(fn, v);
      return [...m, o];
    });
    const SLICE = 1 << 20; // bytes: a quarter-million pixels
    for (let start = 0; start < d.length; start += SLICE) {
      const end = Math.min(d.length, start + SLICE);
      for (let i = start; i < end; i += 4) {
        let r = d[i];
        let g = d[i + 1];
        let b = d[i + 2];
        for (let k = 0; k < steps.length; k += 10) {
          const nr = steps[k] * r + steps[k + 1] * g + steps[k + 2] * b + steps[k + 9];
          const ng = steps[k + 3] * r + steps[k + 4] * g + steps[k + 5] * b + steps[k + 9];
          const nb = steps[k + 6] * r + steps[k + 7] * g + steps[k + 8] * b + steps[k + 9];
          // clamped after every step, just as chained CSS filters are
          r = nr < 0 ? 0 : nr > 255 ? 255 : nr;
          g = ng < 0 ? 0 : ng > 255 ? 255 : ng;
          b = nb < 0 ? 0 : nb > 255 ? 255 : nb;
        }
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
      }
      await breathe();
    }
    ctx.putImageData(img, 0, 0);
  }
  if (look.tint) {
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = look.tint.alpha;
    ctx.fillStyle = look.tint.color;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }
}

/** A deckled outline: correlated jitter (torn fibres, not saw teeth) with
 *  the odd deeper nick. */
function deckle(w: number, h: number, u: number) {
  const path = new Path2D();
  const step = u * 0.7;
  let off = 0;
  let first = true;
  const side = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 0; i < n; i++) {
      off = off * 0.6 + (Math.random() - 0.5) * u * 0.5;
      const nick = Math.random() < 0.015 ? Math.random() * u * 1.4 : 0;
      const d = u * 0.5 + Math.abs(off) + nick;
      const x = x0 + ((x1 - x0) * i) / n + nx * d;
      const y = y0 + ((y1 - y0) * i) / n + ny * d;
      if (first) path.moveTo(x, y);
      else path.lineTo(x, y);
      first = false;
    }
  };
  side(0, 0, w, 0, 0, 1);
  side(w, 0, w, h, -1, 0);
  side(w, h, 0, h, 0, -1);
  side(0, h, 0, 0, 1, 0);
  path.closePath();
  return path;
}

/** An elliptical stain that fades to nothing (the CSS parchment's foxing). */
function blot(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rgb: string, a: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

function paper(ctx: CanvasRenderingContext2D, w: number, h: number, u: number) {
  // PARCHMENT_BG: 160deg, the same four stops
  const half = (w * 0.342 + h * 0.94) / 2;
  const g = ctx.createLinearGradient(w / 2 - 0.342 * half, h / 2 - 0.94 * half, w / 2 + 0.342 * half, h / 2 + 0.94 * half);
  g.addColorStop(0, "#f2e7c4");
  g.addColorStop(0.4, "#ecdcb0");
  g.addColorStop(0.75, "#e0cb97");
  g.addColorStop(1, "#d2ba82");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // PARCHMENT_STAINS, scaled to the card
  blot(ctx, w * 0.12, h * 0.08, 24 * u, 16 * u, "122,84,34", 0.14);
  blot(ctx, w * 0.94, h * 0.3, 20 * u, 30 * u, "110,74,28", 0.12);
  blot(ctx, w * 0.5, h * 1.02, 34 * u, 18 * u, "96,62,22", 0.17);
  blot(ctx, w * 0.78, h * 0.74, 9 * u, 7 * u, "122,84,34", 0.1);
  blot(ctx, w * 0.24, h * 0.58, 6 * u, 4.6 * u, "110,70,24", 0.09);
  // fibre grain
  const n = document.createElement("canvas");
  n.width = n.height = 192;
  const nc = n.getContext("2d");
  if (!nc) return;
  const img = nc.createImageData(192, 192);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 205 + Math.random() * 50;
    img.data[i] = v;
    img.data[i + 1] = v * 0.97;
    img.data[i + 2] = v * 0.92;
    img.data[i + 3] = 255;
  }
  nc.putImageData(img, 0, 0);
  const pattern = ctx.createPattern(n, "repeat");
  if (pattern) {
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }
  n.width = n.height = 0;
}

/** EDGE_BURN's three inset layers, plus a charred lip and a few scorches. */
function burn(ctx: CanvasRenderingContext2D, edge: Path2D, w: number, h: number, u: number) {
  for (const [x, y, r] of [[0.03, 0.9, 9], [0.97, 0.12, 7], [0.62, 0.0, 6], [0.0, 0.35, 5]] as const) {
    blot(ctx, x * w, y * h, r * u, r * u * 0.8, "70,36,8", 0.32);
  }
  ctx.save();
  ctx.lineJoin = "round";
  // the stroke sits on the clip edge, so only its inward half and its glow show
  const layers: [number, string, number][] = [
    [5, "rgba(90,60,20,.42)", 2],
    [1, "rgba(70,40,10,.4)", 0.8],
    [0.25, "rgba(60,30,8,.5)", 0.4],
    [0.1, "rgba(34,16,3,.85)", 0.22],
  ];
  for (const [blur, color, width] of layers) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * u;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke(edge);
  }
  ctx.restore();
}

/** Mounting corners holding the print to the card. */
function corners(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, u: number) {
  const leg = 3.6 * u;
  const over = 0.6 * u;
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x + w, y + h, -1, -1], [x, y + h, 1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(cx - sx * over, cy - sy * over);
    ctx.lineTo(cx + sx * leg, cy - sy * over);
    ctx.lineTo(cx - sx * over, cy + sy * leg);
    ctx.closePath();
    ctx.fillStyle = "#3a2611";
    ctx.fill();
    ctx.strokeStyle = "rgba(201,150,60,.75)";
    ctx.lineWidth = 0.12 * u;
    ctx.stroke();
  }
}

/** An eight-wind rose, turned so its N points to true north in the shot. */
function compassRose(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, bearing: number, font: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = r * 0.04;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.74, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = r * 0.015;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.rotate(-bearing);
  ctx.lineJoin = "round";
  ctx.lineWidth = r * 0.025;
  for (const cardinal of [false, true]) {
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 2 + (cardinal ? 0 : Math.PI / 4));
      const len = cardinal ? r : r * 0.58;
      const wd = cardinal ? r * 0.17 : r * 0.12;
      // each point: an inked half and a paper half, the old engravers' way
      for (const [sx, fill] of [[-1, INK], [1, "#f3e6c2"]] as const) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -len);
        ctx.lineTo(sx * wd, -wd);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = "#b08a3e";
  ctx.fill();
  ctx.stroke();
  // the letter stays upright, out past the north point
  ctx.font = `700 ${r * 0.36}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = INK;
  ctx.fillText("N", -Math.sin(bearing) * r * 1.2, -Math.cos(bearing) * r * 1.2);
  ctx.restore();
}

/** Draw text at `size`, shrunk until it fits `maxW`; returns its width. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, font: (px: number) => string, size: number) {
  ctx.font = font(size);
  const w = ctx.measureText(text).width;
  if (w > maxW) ctx.font = font((size * maxW) / w);
  ctx.fillText(text, x, y);
  return Math.min(w, maxW);
}

const fontVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "serif";

/** The shot in a burnt-edged parchment card with its caption, encoded as
 *  `type` (PNG to keep, JPEG for the share sheet). */
export async function composePostcard(
  frame: HTMLCanvasElement,
  look: Look,
  place: string,
  bearing: number,
  when: Date,
  type: "image/png" | "image/jpeg",
) {
  const cinzel = fontVar("--font-cinzel");
  const garamond = fontVar("--font-garamond");
  // next/font only fetches the faces a page has used — ask for these outright
  await Promise.all([
    document.fonts.load(`600 40px ${cinzel}`),
    document.fonts.load(`700 40px ${cinzel}`),
    document.fonts.load(`400 16px ${cinzel}`),
    document.fonts.load(`italic 400 24px ${garamond}`),
  ]).catch(() => undefined);
  await document.fonts.ready;

  const long = Math.max(frame.width, frame.height);
  const scale = Math.min(Math.max(long, 1600), 2400) / long;
  const sw = Math.round(frame.width * scale);
  const sh = Math.round(frame.height * scale);
  const u = Math.max(sw, sh) / 100;
  const m = Math.round(3.4 * u);
  const band = Math.round(9.5 * u);
  const w = sw + 2 * m;
  const h = sh + m + band;
  // the card lies on a dark blotter, so its torn edge reads in any viewer
  // (a transparent surround turns black in some galleries, white in others)
  const pad = Math.round(2.4 * u);

  // develop at the smaller of the buffer and the print — no more pixels than will show
  const work = document.createElement("canvas");
  work.width = Math.round(frame.width * Math.min(1, scale));
  work.height = Math.round(frame.height * Math.min(1, scale));
  const out = document.createElement("canvas");
  out.width = w + 2 * pad;
  out.height = h + 2 * pad;
  try {
    const wctx = work.getContext("2d", { willReadFrequently: true });
    const ctx = out.getContext("2d");
    if (!wctx || !ctx) throw new Error("no 2D canvas");
    wctx.imageSmoothingQuality = "high";
    wctx.drawImage(frame, 0, 0, work.width, work.height);
    await develop(wctx, work.width, work.height, look);
    drawCard(ctx, work, { sw, sh, u, m, band, w, h, pad }, { place, bearing, when, cinzel, garamond });
    return await new Promise<Blob>((resolve, reject) =>
      out.toBlob((b) => (b ? resolve(b) : reject(new Error("the postcard could not be encoded"))), type, 0.92),
    );
  } finally {
    // WebKit gives canvas memory back only on GC — hand it back now
    work.width = work.height = out.width = out.height = 0;
  }
}

interface CardLayout {
  sw: number; // print size
  sh: number;
  u: number; // 1% of the print's long side
  m: number; // paper margin
  band: number; // caption strip
  w: number; // card size
  h: number;
  pad: number; // blotter around the card
}

interface Caption {
  place: string;
  bearing: number; // the view's compass bearing, radians from north
  when: Date;
  cinzel: string; // resolved font families
  garamond: string;
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  shot: HTMLCanvasElement,
  { sw, sh, u, m, band, w, h, pad }: CardLayout,
  { place, bearing, when, cinzel, garamond }: Caption,
) {
  const cw = w + 2 * pad;
  const ch = h + 2 * pad;
  const desk = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, Math.hypot(cw, ch) / 2);
  desk.addColorStop(0, "#3b2814");
  desk.addColorStop(1, "#140c05");
  ctx.fillStyle = desk;
  ctx.fillRect(0, 0, cw, ch);
  ctx.translate(pad, pad);
  const edge = deckle(w, h, u);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.7)";
  ctx.shadowBlur = 1.8 * u;
  ctx.shadowOffsetY = 0.5 * u;
  ctx.fillStyle = "#d2ba82";
  ctx.fill(edge);
  ctx.restore();
  ctx.save();
  ctx.clip(edge);
  paper(ctx, w, h, u);
  burn(ctx, edge, w, h, u);

  // the print, a shade proud of the card
  ctx.save();
  ctx.shadowColor = "rgba(40,22,6,.5)";
  ctx.shadowBlur = 1.2 * u;
  ctx.shadowOffsetY = 0.35 * u;
  ctx.fillStyle = "#1a1208";
  ctx.fillRect(m, m, sw, sh);
  ctx.restore();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(shot, m, m, sw, sh);
  ctx.strokeStyle = "rgba(44,31,13,.6)";
  ctx.lineWidth = Math.max(1, 0.12 * u);
  ctx.strokeRect(m, m, sw, sh);
  corners(ctx, m, m, sw, sh, u);

  // caption strip: rose, place, date, and a quiet maker's line
  const y0 = m + sh;
  const roseR = band * 0.3;
  compassRose(ctx, m + roseR + 0.4 * u, y0 + band * 0.53, roseR, bearing, cinzel);
  const tx = m + roseR * 2 + 2.6 * u;
  const maxW = w - m - tx;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  fitText(ctx, place, tx, y0 + band * 0.47, maxW, (px) => `600 ${px}px ${cinzel}`, band * 0.29);
  ctx.fillStyle = "#6d5a33";
  const dateW = fitText(ctx, dateLine(when), tx, y0 + band * 0.71, maxW, (px) => `italic 400 ${px}px ${garamond}`, band * 0.17);
  // the maker's line shares the date's baseline, in whatever room is left
  ctx.textAlign = "right";
  ctx.fillStyle = "#8a6420";
  ctx.letterSpacing = `${(band * 0.012).toFixed(1)}px`;
  fitText(ctx, "There and Back Again · Konstantin Nikolaev", w - m, y0 + band * 0.71, maxW - dateW - 3 * u, (px) => `400 ${px}px ${cinzel}`, band * 0.1);
  ctx.restore();
}

const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** e.g. postcard-rivendell-2026-10-06.png */
export const postcardFile = (blob: Blob, place: string, when: Date) =>
  new File([blob], `postcard-${slug(place)}-${isoDate(when)}.${blob.type === "image/jpeg" ? "jpg" : "png"}`, { type: blob.type });
