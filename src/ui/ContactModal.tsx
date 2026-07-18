"use client";

import { useGame } from "@/state/store";
import { PARCHMENT_BG, parchmentOverlay, EDGE_BURN } from "@/ui/parchment";

export function ContactModal() {
  const open = useGame((s) => s.contactOpen);
  const setContact = useGame((s) => s.setContact);
  const sendRaven = useGame((s) => s.sendRaven);

  if (!open) return null;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = e.currentTarget;
    const from = (f.elements.namedItem("from") as HTMLInputElement).value;
    const email = (f.elements.namedItem("email") as HTMLInputElement).value;
    const message = (f.elements.namedItem("message") as HTMLTextAreaElement).value;
    const body = `From: ${from} (${email})\n\n${message}`;
    sendRaven();
    setTimeout(() => {
      window.open(
        "mailto:konstantin@nikolaev.us?subject=" +
          encodeURIComponent("A raven from " + from) +
          "&body=" +
          encodeURIComponent(body),
      );
    }, 2200);
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
      style={{ position: "absolute", inset: 0, background: "rgba(8,5,2,.66)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn .3s", pointerEvents: "auto" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(480px, 92vw)",
          background: PARCHMENT_BG,
          border: "2px solid #6b5327",
          outline: "1px solid rgba(201,150,60,.4)",
          outlineOffset: 3,
          borderRadius: 3,
          boxShadow: `0 30px 80px rgba(0,0,0,.7), ${EDGE_BURN}`,
          padding: "34px 40px",
          color: "#241a0c",
          position: "relative",
          overflow: "hidden",
          filter: "url(#roughPaper)",
        }}
      >
        <div style={parchmentOverlay} />
        <div className="cinzel" style={{ position: "relative", fontSize: 13, letterSpacing: ".22em", color: "#8a6420" }}>BY WING TO SHERMAN OAKS</div>
        <h2 className="cinzel" style={{ fontWeight: 700, fontSize: 26, margin: "8px 0 4px", color: "#2c1f0d" }}>Send a Raven</h2>
        <div style={{ fontSize: 16, fontStyle: "italic", color: "#6d5a33", marginBottom: 18 }}>The bird knows the way to konstantin@nikolaev.us</div>
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input name="from" required placeholder="Your name" style={inputStyle} />
          <input name="email" type="email" required placeholder="Your email (so the raven may return)" style={inputStyle} />
          <textarea name="message" required rows={4} placeholder="Your message…" style={{ ...inputStyle, resize: "vertical" }} />
          <button
            type="submit"
            className="cinzel"
            style={{ fontSize: 14, letterSpacing: ".12em", padding: 12, background: "#3d2b10", color: "#ecd9a0", border: "1px solid #c9963c", cursor: "pointer", borderRadius: 2 }}
          >
            RELEASE THE RAVEN
          </button>
        </form>
        <div style={{ marginTop: 14, textAlign: "center", fontSize: 14, color: "#6d5a33" }}>
          or by the old roads: <a href="https://linkedin.com/in/konn" target="_blank" rel="noreferrer">linkedin.com/in/konn</a> ·{" "}
          <a href="https://github.com/nikolaevK" target="_blank" rel="noreferrer">github.com/nikolaevK</a>
          <br />
          or take the written scroll: <a href="/assets/resume.pdf" target="_blank" rel="noreferrer">Résumé (PDF)</a>
        </div>
      </div>
    </div>
  );
}
