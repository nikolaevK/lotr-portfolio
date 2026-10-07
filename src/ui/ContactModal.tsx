"use client";

import { useId, useState } from "react";
import { useGame } from "@/state/store";
import { useContent } from "@/state/content";
import { PARCHMENT_BG, parchmentOverlay, EDGE_BURN } from "@/ui/parchment";
import { useDialog } from "@/ui/a11y";

export function ContactModal() {
  const open = useGame((s) => s.contactOpen);
  // mounted per opening, so nothing from a closed letter (a send that failed
  // after the scroll was shut) haunts the next one
  return open ? <RavenLetter /> : null;
}

/** Marks a field invalid for screen readers once the browser rejects it. */
const flagInvalid = (e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) =>
  e.currentTarget.setAttribute("aria-invalid", "true");
const clearInvalid = (e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  if (e.currentTarget.validity.valid) e.currentTarget.removeAttribute("aria-invalid");
};

function RavenLetter() {
  const setContact = useGame((s) => s.setContact);
  const sendRaven = useGame((s) => s.sendRaven);
  const profile = useContent((c) => c.profile);
  const resumeVariants = useContent((c) => c.resumeVariants);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useDialog<HTMLDivElement>(true, { modal: true });
  const id = useId();

  const email = profile?.email ?? "konstantin@nikolaev.us";
  const links = profile?.links?.length
    ? profile.links
    : [
        { label: "LinkedIn", url: "https://linkedin.com/in/konn" },
        { label: "GitHub", url: "https://github.com/nikolaevK" },
      ];
  const resume = resumeVariants.find((v) => v.isDefault) ?? resumeVariants[0];

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = e.currentTarget;
    const from = (f.elements.namedItem("from") as HTMLInputElement).value;
    const fromEmail = (f.elements.namedItem("email") as HTMLInputElement).value;
    const message = (f.elements.namedItem("message") as HTMLTextAreaElement).value;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: from, email: fromEmail, message }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error ?? "");
      }
      sendRaven(); // closes the scroll, flies the bird, toasts
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : "";
      setError(msg || "The raven was blown off course — try again, or use the old roads below.");
    } finally {
      setSending(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    fontFamily: "inherit",
    fontSize: 16,
    padding: "10px 12px",
    background: "rgba(255,252,240,.6)",
    border: "1px solid #8a6f38",
    borderRadius: 2,
    color: "#2c1f0d",
  };

  return (
    <div
      onClick={() => setContact(false)}
      // scrollable backdrop + margin:auto child: taller-than-viewport modals
      // (landscape phones, soft keyboard) stay reachable instead of clipping
      style={{ position: "absolute", inset: 0, background: "rgba(8,5,2,.66)", zIndex: 50, display: "flex", overflowY: "auto", padding: "20px 12px", animation: "fadeIn .3s", pointerEvents: "auto" }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        className="on-parchment"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(480px, 92vw)",
          margin: "auto",
          border: "2px solid #6b5327",
          outline: "1px solid rgba(201,150,60,.4)",
          outlineOffset: 3,
          borderRadius: 3,
          boxShadow: "0 30px 80px rgba(0,0,0,.7)",
          padding: "34px 40px",
          color: "#241a0c",
          position: "relative",
          overflow: "hidden",
          isolation: "isolate",
        }}
      >
        {/* the paper frays at its edges; the form and its words stay crisp */}
        <div style={{ position: "absolute", inset: 0, zIndex: -1, background: PARCHMENT_BG, boxShadow: EDGE_BURN, filter: "url(#roughPaper)", pointerEvents: "none" }} />
        <div style={parchmentOverlay} />
        <div className="cinzel" style={{ position: "relative", fontSize: 13, letterSpacing: ".22em", color: "#8a6420" }}>BY WING TO SHERMAN OAKS</div>
        <h2 id={`${id}-title`} className="cinzel" style={{ fontWeight: 700, fontSize: 26, margin: "8px 0 4px", color: "#2c1f0d" }}>Send a Raven</h2>
        <div style={{ fontSize: 16, fontStyle: "italic", color: "#6d5a33", marginBottom: 18 }}>
          The bird knows the way to <a href={`mailto:${email}`}>{email}</a>
        </div>
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* the placeholders stay the look; the hidden labels name the fields */}
          <label htmlFor={`${id}-from`} className="sr-only">Your name</label>
          <input id={`${id}-from`} name="from" required autoComplete="name" placeholder="Your name" onInvalid={flagInvalid} onInput={clearInvalid} style={inputStyle} />
          <label htmlFor={`${id}-email`} className="sr-only">Your email</label>
          <input id={`${id}-email`} name="email" type="email" required autoComplete="email" placeholder="Your email (so the raven may return)" onInvalid={flagInvalid} onInput={clearInvalid} style={inputStyle} />
          <label htmlFor={`${id}-message`} className="sr-only">Your message</label>
          <textarea id={`${id}-message`} name="message" required rows={4} placeholder="Your message…" onInvalid={flagInvalid} onInput={clearInvalid} style={{ ...inputStyle, resize: "vertical" }} />
          {error && <div role="alert" style={{ fontSize: 14, fontStyle: "italic", color: "#8c2114" }}>{error}</div>}
          <button
            type="submit"
            disabled={sending}
            className="cinzel"
            style={{ fontSize: 14, letterSpacing: ".12em", padding: 12, background: "#3d2b10", color: "#ecd9a0", border: "1px solid #c9963c", cursor: sending ? "wait" : "pointer", borderRadius: 2, opacity: sending ? 0.7 : 1 }}
          >
            {sending ? "THE RAVEN TAKES WING…" : "RELEASE THE RAVEN"}
          </button>
        </form>
        <div style={{ marginTop: 14, textAlign: "center", fontSize: 14, color: "#6d5a33" }}>
          or by the old roads:{" "}
          {links.map((l, i) => (
            <span key={l.label}>
              {i > 0 && " · "}
              <a href={l.url} target="_blank" rel="noreferrer">{l.url.replace(/^https?:\/\//, "")}</a>
            </span>
          ))}
          {resume && (
            <>
              <br />
              or take the written scroll: <a href={resume.path} target="_blank" rel="noreferrer">Résumé — {resume.label} (PDF)</a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
