/** Shared aged-paper & leather looks for the book and every scroll surface. */

// encodeURIComponent leaves ' unescaped, which would terminate the CSS url('…')
export const svgUri = (s: string) =>
  "url('data:image/svg+xml," + encodeURIComponent(s).replace(/'/g, "%27") + "')";

/** Fine paper grain (multiply overlay). */
export const PAPER_NOISE = svgUri(
  "<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/></filter><rect width='260' height='260' filter='url(#n)' opacity='0.6'/></svg>",
);

/** Coarse pebbled leather grain. */
export const LEATHER_NOISE = svgUri(
  "<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='l'><feTurbulence type='fractalNoise' baseFrequency='0.28' numOctaves='4' stitchTiles='stitch'/></filter><rect width='220' height='220' filter='url(#l)' opacity='0.75'/></svg>",
);

/** Base parchment gradient shared by scrolls and pages. */
export const PARCHMENT_BG = "linear-gradient(160deg, #f2e7c4 0%, #ecdcb0 40%, #e0cb97 75%, #d2ba82 100%)";

/** Foxing, water-marks and handling stains (screened over the parchment). */
export const PARCHMENT_STAINS = [
  "radial-gradient(ellipse 240px 160px at 12% 8%, rgba(122,84,34,.14), transparent 70%)",
  "radial-gradient(ellipse 200px 300px at 94% 30%, rgba(110,74,28,.12), transparent 70%)",
  "radial-gradient(ellipse 340px 180px at 50% 102%, rgba(96,62,22,.17), transparent 72%)",
  "radial-gradient(ellipse 90px 70px at 78% 74%, rgba(122,84,34,.10), transparent 75%)",
  "radial-gradient(ellipse 60px 46px at 24% 58%, rgba(110,70,24,.09), transparent 75%)",
].join(",");

/** Overlay div style: grain + stains on any parchment surface. */
export const parchmentOverlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundImage: `${PAPER_NOISE}, ${PARCHMENT_STAINS}`,
  backgroundSize: "260px 260px, cover",
  opacity: 0.5,
  mixBlendMode: "multiply",
  pointerEvents: "none",
};

/** Burnt/darkened edges vignette for parchment. */
export const EDGE_BURN =
  "inset 0 0 46px rgba(90,60,20,.42), inset 0 0 9px rgba(70,40,10,.4), inset 0 0 2px rgba(60,30,8,.5)";

/** Deep-tooled leather for covers and buttons. */
export const LEATHER_BG =
  "radial-gradient(ellipse at 38% 26%, #5a3a18 0%, #46290f 45%, #2e1a08 80%, #241304 100%)";

/** Gold-leaf text emboss. */
export const GOLD_EMBOSS: React.CSSProperties = {
  color: "#e2c06d",
  textShadow:
    "0 1px 1px rgba(255,240,200,.28), 0 -1px 1px rgba(0,0,0,.85), 0 0 22px rgba(201,150,60,.3)",
};
