"use client";

import { useEffect, useRef, type RefObject } from "react";
import { usePathname } from "next/navigation";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// set by leaveForFlight(): the next dialog to close hands focus to the page
let leaving = false;

/**
 * Call from an action that closes a panel to send the visitor flying (fly to
 * a land, watch the ending, …): focus goes to the page, where Space breathes
 * fire, instead of back to the button that opened the panel.
 */
export function leaveForFlight() {
  leaving = true;
  setTimeout(() => (leaving = false));
}

/** a sits at or before b in document order (an ancestor counts as before). */
const atOrBefore = (a: Node, b: Node) => a === b || !!(b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_PRECEDING);
const atOrAfter = (a: Node, b: Node) => a === b || !!(b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);

/**
 * Focus handling for a panel while `open`: focus moves in (to `initial`, else
 * the panel itself, which needs tabIndex -1), Tab cycles inside a modal one,
 * and on close focus returns to whatever opened it — but only for keyboard
 * openers: a mouse visitor's focus goes back to the page, where Space still
 * breathes fire. A non-modal panel takes focus only from the keyboard.
 */
export function useDialog<T extends HTMLElement>(
  open: boolean,
  { modal, initial }: { modal: boolean; initial?: RefObject<HTMLElement | null> },
): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    if (!open || !node) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const keyboard = !!opener && opener !== document.body && opener.matches(":focus-visible");
    if (modal || keyboard) (initial?.current ?? node).focus({ preventScroll: true });

    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
      const active = document.activeElement;
      if (!items.length || !active) return e.preventDefault();
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey ? atOrBefore(active, first) : atOrAfter(active, last)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    if (modal) node.addEventListener("keydown", trap);

    return () => {
      node.removeEventListener("keydown", trap);
      // leave focus alone if the visitor already took it somewhere else
      const active = document.activeElement;
      if (active && active !== document.body && !node.contains(active)) return;
      if (leaving) {
        leaving = false;
        if (active instanceof HTMLElement) active.blur();
        return;
      }
      if (keyboard && opener?.isConnected) opener.focus({ preventScroll: true });
      else if (active instanceof HTMLElement && node.contains(active)) active.blur();
    };
  }, [open, modal, initial]);
  return ref;
}

/** Imported on demand: the layout renders on the server, the store (audio,
 *  voice, persistence) only in the browser. */
const openRedBook = () => import("@/state/store").then(({ game }) => game().setCodex(true));

/** First stop for keyboard and screen-reader visitors: every chapter as text. */
export function SkipToRedBook() {
  // the root layout also wraps /admin, which has no Red Book
  if (usePathname() !== "/") return null;
  return (
    <button type="button" className="skip-link cinzel" onClick={openRedBook}>
      Skip the flight — read every chapter in the Red Book
    </button>
  );
}
