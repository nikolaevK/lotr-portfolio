"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useGame } from "@/state/store";
import { useContent } from "@/state/content";
import { reducedMotion } from "@/game/prefs";
import { EDGE_BURN, GOLD_EMBOSS, LEATHER_BG, LEATHER_NOISE, PARCHMENT_BG, parchmentOverlay } from "@/ui/parchment";
import { useDialog } from "@/ui/a11y";
import { buildLeaves, leafLabel, withFallbacks } from "@/ui/redbook/book";
import { Icon, LeafContent } from "@/ui/redbook/pages";
import { PrintBook } from "@/ui/redbook/PrintBook";

// two facing pages need the room for both; phones, portrait tablets and
// landscape phones read one page at a time
const SPREAD_Q = "(min-width: 900px) and (min-height: 540px)";
const COMPACT_Q = "(max-width: 600px), (max-height: 500px)";
const COARSE_Q = "(pointer: coarse)";
const TURN_MS = 560;

const CSS = `
.rb-root:focus { outline: none; }
.rb-root :focus-visible { outline: 2px solid #e2c06d; outline-offset: 2px; }
.rb-paper :focus-visible { outline-color: #7a3f0c; }
.rb-page:focus-visible { outline: 1.5px solid rgba(138,100,32,.55); outline-offset: -8px; }
.rb-paper a:not(.rb-btn) { color: #7a4a10; text-decoration: underline; text-decoration-color: rgba(122,74,16,.38); text-underline-offset: 3px; }
.rb-paper a:not(.rb-btn):hover { color: #4a2a06; text-decoration-color: currentColor; }
.rb-page { scrollbar-width: thin; scrollbar-color: rgba(138,100,32,.5) transparent; }
.rb-toc:hover { background: rgba(201,150,60,.13) !important; }
.rb-toc:hover .rb-toc-title { color: #7a4a10; }
.rb-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.rb-dropcap { display: flow-root; }
.rb-dropcap::first-letter {
  float: left;
  font-family: var(--font-cinzel), serif;
  font-weight: 900;
  font-size: 3.1em;
  line-height: 1;
  padding: .1em .14em .04em;
  margin: .12em .16em 0 0;
  color: #f6e2a6;
  background: radial-gradient(circle at 32% 28%, color-mix(in srgb, var(--rb-ring, #a8321f) 62%, #2a1606), color-mix(in srgb, var(--rb-ring, #a8321f) 38%, #0e0702) 88%);
  border: 1.5px solid #c9963c;
  box-shadow: inset 0 0 0 2px rgba(22,12,3,.45), 0 0 0 1px rgba(201,150,60,.4), 1px 2px 4px rgba(60,30,8,.35);
  text-shadow: 0 1px 0 #5a3a0c, 0 0 10px rgba(255,214,120,.4);
}
@keyframes rb-open { from { opacity: 0; transform: translateY(16px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes rb-land-l { from { transform: perspective(2400px) rotateY(80deg); } to { transform: perspective(2400px) rotateY(0deg); } }
@keyframes rb-land-r { from { transform: perspective(2400px) rotateY(-80deg); } to { transform: perspective(2400px) rotateY(0deg); } }
@keyframes rb-shade { from { opacity: 1; } to { opacity: 0; } }
@keyframes rb-in-fwd { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: none; } }
@keyframes rb-in-back { from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: none; } }
`;

const barBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minWidth: 44,
  height: 44,
  padding: "0 14px",
  background: "rgba(24,16,7,.88)",
  border: "1px solid #7a5f2a",
  color: "#e2c682",
  fontSize: 12.5,
  letterSpacing: ".1em",
  whiteSpace: "nowrap",
  cursor: "pointer",
  borderRadius: 2,
};

function useMedia(q: string) {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = matchMedia(q);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [q],
  );
  return useSyncExternalStore(subscribe, () => matchMedia(q).matches, () => false);
}

function Chevron({ dir }: { dir: 1 | -1 }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir > 0 ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"} />
    </svg>
  );
}

type Side = "left" | "right" | "single";
/** How a page arrives: `land` swings it down about the spine, `shade` is the
 *  turning leaf's shadow passing over a page that was lying beneath it. */
type Arrival = "land" | "shade" | "fwd" | "back" | null;

const STACK: Record<Side, string> = {
  // the page block's edges, stepping out from under the open pages
  left: "-1px 1px 0 #e3d2a6, -3px 2px 0 #d3bd8c, -5px 3px 0 #c2a877, -6px 4px 0 rgba(30,16,4,.6)",
  right: "1px 1px 0 #e3d2a6, 3px 2px 0 #d3bd8c, 5px 3px 0 #c2a877, 6px 4px 0 rgba(30,16,4,.6)",
  single: "1px 1px 0 #e3d2a6, 3px 2px 0 #d3bd8c, 4px 3px 0 #c2a877, 5px 4px 0 rgba(30,16,4,.6)",
};

function Page({
  index,
  label,
  side,
  arrival,
  compact,
  center,
  children,
}: {
  index: number;
  label: string;
  side: Side;
  arrival: Arrival;
  compact: boolean;
  /** set a short page in the middle of the leaf, as a chapter opening is */
  center: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [more, setMore] = useState(false);
  // only a boolean flip re-renders; reading scroll metrics here writes nothing
  const measure = useCallback(() => {
    const el = ref.current;
    if (el) setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 16);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // web fonts and resizes reflow the page after mount
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [measure]);

  const spine = side === "left" ? "right" : "left";
  const toSpine = side === "left" ? "90deg" : "270deg";
  const fade = more ? "linear-gradient(#000 calc(100% - 56px), transparent)" : undefined;
  const sheetAnim =
    arrival === "land" ? `${side === "left" ? "rb-land-l" : "rb-land-r"} ${TURN_MS}ms cubic-bezier(.3,.75,.3,1) both`
    : arrival === "fwd" ? `rb-in-fwd ${TURN_MS * 0.6}ms ease-out both`
    : arrival === "back" ? `rb-in-back ${TURN_MS * 0.6}ms ease-out both`
    : undefined;

  return (
    // the blank leaf beneath: what shows while the new sheet swings down
    <div
      style={{
        position: "relative",
        flex: 1,
        minWidth: 0,
        background: PARCHMENT_BG,
        borderRadius: side === "left" ? "4px 0 0 4px" : side === "right" ? "0 4px 4px 0" : 4,
        boxShadow: `${EDGE_BURN}, ${STACK[side]}`,
        zIndex: arrival === "land" ? 2 : 1,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: PARCHMENT_BG,
          borderRadius: "inherit",
          boxShadow: EDGE_BURN,
          transformOrigin: `${spine} center`,
          animation: sheetAnim,
        }}
      >
        <div style={{ ...parchmentOverlay, borderRadius: "inherit" }} />
        {/* the gutter: the paper curving down into the binding */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              side === "single"
                ? "linear-gradient(90deg, rgba(60,35,10,.26), rgba(60,35,10,.08) 3%, transparent 8%)"
                : `linear-gradient(${toSpine}, transparent 88%, rgba(60,35,10,.12) 95%, rgba(60,35,10,.42))`,
          }}
        />
        <section
          ref={ref}
          tabIndex={0}
          aria-label={`Page ${index + 1}: ${label}`}
          className="rb-page rb-paper"
          onScroll={measure}
          style={{
            position: "absolute",
            inset: "0 0 30px",
            overflowY: "auto",
            overscrollBehavior: "contain",
            padding: compact ? "24px 20px 16px" : "36px 50px 18px",
            fontFamily: "var(--font-garamond), serif",
            color: "#241a0c",
            // an unbroken URL from the admin must wrap, not slide the page sideways
            overflowWrap: "anywhere",
            maskImage: fade,
            WebkitMaskImage: fade,
          }}
        >
          <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
            {/* auto margins centre only while it fits; a long page still starts at the top */}
            <div style={{ marginBlock: center ? "auto" : undefined }}>{children}</div>
          </div>
        </section>
        <div
          aria-hidden
          className="cinzel"
          style={{ position: "absolute", left: 0, right: 0, bottom: 8, textAlign: "center", fontSize: 12, letterSpacing: ".18em", color: "#8a6420" }}
        >
          — {index + 1} —
        </div>
        {/* the catchword: there is more of this page below */}
        <div
          aria-hidden
          className="fell"
          style={{
            position: "absolute",
            right: compact ? 16 : 24,
            bottom: 7,
            fontSize: 14,
            fontStyle: "italic",
            color: "#7a5a24",
            opacity: more ? 1 : 0,
            transition: "opacity .25s",
            pointerEvents: "none",
          }}
        >
          read on ▾
        </div>
      </div>
      {arrival === "shade" && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            borderRadius: "inherit",
            background: `linear-gradient(${toSpine}, transparent, rgba(40,22,6,.25) 55%, rgba(40,22,6,.6))`,
            animation: `rb-shade ${TURN_MS}ms ease-in both`,
          }}
        />
      )}
    </div>
  );
}

/** The Red Book codex: every chapter as a readable, printable book. */
export function RedBook() {
  const open = useGame((s) => s.codexOpen);
  // the ribbon: reopened this visit, the book falls open where it was left
  const [leaf, setLeaf] = useState(0);
  return open ? <Codex leaf={leaf} setLeaf={setLeaf} /> : null;
}

function Codex({ leaf, setLeaf }: { leaf: number; setLeaf: (i: number) => void }) {
  const setCodex = useGame((s) => s.setCodex);
  const regions = useContent((c) => c.regions);
  const author = withFallbacks(useContent((c) => c.profile)).name;
  const leaves = useMemo(() => buildLeaves(regions), [regions]);
  const spread = useMedia(SPREAD_Q);
  const compact = useMedia(COMPACT_Q);
  const coarse = useMedia(COARSE_Q);
  const [motion] = useState(() => !reducedMotion());
  const [dir, setDir] = useState<1 | -1 | 0>(0);
  // the paper copy mounts on the first print and stays while the book is open
  const [printing, setPrinting] = useState(false);
  // focus in, Tab kept inside, and back to a keyboard opener on close
  const rootRef = useDialog<HTMLDivElement>(true, { modal: true });
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  const titleId = useId();

  const total = leaves.length;
  const cur = Math.min(leaf, total - 1); // an admin edit can shrink the book under the reader
  const first = spread ? cur - (cur % 2) : cur;
  const step = spread ? 2 : 1;
  const shown = spread ? [first, first + 1].filter((i) => i < total) : [first];
  const canPrev = first > 0;
  const canNext = first + step < total;

  const goto = (i: number) => {
    const target = spread ? i - (i % 2) : i;
    if (i < 0 || i >= total || target === first) return;
    setDir(target > first ? 1 : -1);
    setLeaf(i);
  };
  const turn = (d: 1 | -1) => goto(first + d * step);
  const close = () => setCodex(false);
  const print = () => {
    flushSync(() => setPrinting(true));
    window.print();
  };

  // a turned page takes its focused link with it — keep focus inside the book
  useEffect(() => {
    const root = rootRef.current;
    if (root && !root.contains(document.activeElement)) {
      root.querySelector<HTMLElement>(".rb-page")?.focus({ preventScroll: true });
    }
  }, [first, rootRef]);

  // Ctrl/⌘+P while reading prints the book too
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    window.addEventListener("beforeprint", before);
    return () => window.removeEventListener("beforeprint", before);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "b" || e.key === "B") return; // the global B toggle closes the book
    // every other key stays in the book: no map view, photo mode or trials beneath it.
    // Esc closes only the book — a tale left open under it stays open.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (!e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      turn(e.key === "ArrowRight" ? 1 : -1);
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipe.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: performance.now() } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // a deliberate sideways stroke, not a scroll that drifted
    if (Math.abs(dx) > 56 && Math.abs(dx) > 1.6 * Math.abs(dy) && performance.now() - s.t < 800) turn(dx < 0 ? 1 : -1);
  };

  const arrival = (side: Side): Arrival => {
    if (!motion || dir === 0) return null;
    if (side === "single") return dir > 0 ? "fwd" : "back";
    // forward, the turned leaf lands on the left over the page now revealed on the right
    return (side === "left") === dir > 0 ? "land" : "shade";
  };

  const sectionNames = [...new Set(shown.map((i) => leafLabel(leaves[i])))].join(" · ");
  const pagesText =
    shown.length === 2 ? `pages ${first + 1}–${first + 2} of ${total}` : `page ${first + 1} of ${total}`;
  const width = spread ? "min(1240px, 100%)" : "min(700px, 100%)";

  const arrow = (d: 1 | -1, tall: boolean) => {
    const can = d > 0 ? canNext : canPrev;
    return (
      // aria-disabled, not disabled: a disabled button would drop keyboard focus
      // to <body> at the first or last page
      <button
        onClick={() => turn(d)}
        aria-disabled={!can}
        aria-label={d > 0 ? "Turn to the next page" : "Turn to the previous page"}
        className="hud-btn"
        style={{ ...barBtn, padding: 0, width: tall ? 46 : 48, height: tall ? 78 : 44, opacity: can ? 1 : 0.32, cursor: can ? "pointer" : "default", flex: "none" }}
      >
        <Chevron dir={d} />
      </button>
    );
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="rb-root"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 110, // above the cover (100): the book opens from the title page too
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding:
          "calc(env(safe-area-inset-top) + 8px) calc(env(safe-area-inset-right) + 12px) calc(env(safe-area-inset-bottom) + 8px) calc(env(safe-area-inset-left) + 12px)",
        background: "radial-gradient(ellipse at 50% 42%, rgba(38,24,9,.95), rgba(10,6,3,.97) 72%)",
        animation: motion ? "fadeIn .3s" : undefined,
      }}
    >
      <style>{CSS}</style>

      <header style={{ flex: "none", width, display: "flex", alignItems: "center", gap: 10, minHeight: 50, marginBottom: compact ? 6 : 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            id={titleId}
            className="cinzel"
            style={{ ...GOLD_EMBOSS, margin: 0, fontSize: compact ? 14.5 : 16, fontWeight: 700, letterSpacing: ".2em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {compact ? "THE RED BOOK" : "THE RED BOOK OF WESTMARCH"}
          </h2>
          {!compact && (
            <div className="fell" style={{ fontSize: 15, fontStyle: "italic", color: "#a8874a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              the whole tale of {author}, no flight required
            </div>
          )}
        </div>
        <button onClick={print} className="cinzel hud-btn" style={barBtn} aria-label={compact ? "Print or save as PDF" : undefined}>
          <Icon d="print" />
          {!compact && "PRINT · SAVE AS PDF"}
        </button>
        <button onClick={close} className="cinzel hud-btn" style={barBtn} aria-label="Close the Red Book">
          <span aria-hidden style={{ fontSize: 15 }}>✕</span>
          {!compact && "CLOSE"}
        </button>
      </header>

      <div style={{ flex: 1, minHeight: 0, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
        {spread && arrow(-1, true)}
        <div
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          style={{
            position: "relative",
            display: "flex",
            width,
            height: "100%",
            maxHeight: spread ? 880 : undefined,
            padding: spread ? "14px 18px" : compact ? "7px 9px 7px 7px" : 12,
            background: `${LEATHER_NOISE}, ${LEATHER_BG}`,
            backgroundBlendMode: "multiply",
            backgroundSize: "220px 220px, cover",
            borderRadius: spread ? 12 : 9,
            boxShadow:
              "0 40px 100px rgba(0,0,0,.8), inset 0 0 60px rgba(0,0,0,.5), inset 0 2px 2px rgba(210,160,80,.14), inset 0 -2px 3px rgba(0,0,0,.7)",
            animation: motion ? "rb-open .5s cubic-bezier(.2,.8,.3,1) both" : undefined,
          }}
        >
          {/* tooled gold line around the boards */}
          <div aria-hidden style={{ position: "absolute", inset: 5, border: "1px solid rgba(201,150,60,.42)", borderRadius: spread ? 9 : 6, pointerEvents: "none" }} />
          {shown.map((i, k) => {
            const side: Side = spread ? (k === 0 ? "left" : "right") : "single";
            return (
              <Page
                key={i}
                index={i}
                label={leafLabel(leaves[i])}
                side={side}
                arrival={arrival(side)}
                compact={compact}
                center={leaves[i].kind === "opener" || leaves[i].kind === "colophon"}
              >
                <LeafContent leaf={leaves[i]} leaves={leaves} onGoto={goto} onPrint={print} />
              </Page>
            );
          })}
          {spread && (
            <>
              {/* the binding between the pages */}
              <div aria-hidden style={{ position: "absolute", top: 14, bottom: 14, left: "50%", width: 2, marginLeft: -1, background: "rgba(30,16,4,.5)", zIndex: 3, pointerEvents: "none" }} />
              {/* the ribbon marker, hanging out of the foot of the book */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  left: "14%",
                  bottom: -16,
                  width: 15,
                  height: 40,
                  zIndex: 3,
                  pointerEvents: "none",
                  background: "linear-gradient(90deg, #5e150d, #a8321f 45%, #7a1c12)",
                  clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)",
                  filter: "drop-shadow(0 2px 2px rgba(0,0,0,.5))",
                }}
              />
            </>
          )}
        </div>
        {spread && arrow(1, true)}
      </div>

      <nav aria-label="Turn the pages" style={{ flex: "none", width: spread ? width : "min(700px, 100%)", display: "flex", alignItems: "center", gap: 10, minHeight: 44, marginTop: spread ? 18 : compact ? 6 : 10 }}>
        {!spread && arrow(-1, false)}
        <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
          <div aria-live="polite" aria-atomic="true">
            <div className="cinzel" style={{ fontSize: compact ? 11.5 : 12.5, letterSpacing: ".16em", color: "#e2c682", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {sectionNames.toUpperCase()}
            </div>
            <div style={{ fontSize: 14, fontStyle: "italic", color: "#a8874a" }}>{pagesText}</div>
          </div>
          {!compact && (
            <div className="fell" style={{ fontSize: 13, fontStyle: "italic", color: "#7d6638", marginTop: 1 }}>
              {coarse ? "swipe to turn the pages" : "← → turn the pages · Esc closes the book"}
            </div>
          )}
        </div>
        {!spread && arrow(1, false)}
      </nav>

      {printing && <PrintBook />}
    </div>
  );
}
