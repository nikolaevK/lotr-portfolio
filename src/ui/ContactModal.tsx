"use client";

import { useGame } from "@/state/store";
import { useContent } from "@/state/content";
import { PARCHMENT_BG, parchmentOverlay, EDGE_BURN } from "@/ui/parchment";

export function ContactModal() {
  const open = useGame((s) => s.contactOpen);
  const setContact = useGame((s) => s.setContact);
  const sendRaven = useGame((s) => s.sendRaven);
  const profile = useContent((c) => c.profile);
  const resumeVariants = useContent((c) => c.resumeVariants);

  if (!open) return null;

  const email = profile?.email ?? "konstantin@nikolaev.us";
  const links = profile?.links?.length
    ? profile.links
    : [
        { label: "LinkedIn", url: "https://linkedin.com/in/konn" },
        { label: "GitHub", url: "https://github.com/nikolaevK" },
      ];
  const resume = resumeVariants.find((v) => v.isDefault) ?? resumeVariants[0];

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = e.currentTarget;
    const from = (f.elements.namedItem("from") as HTMLInputElement).value;
    const fromEmail = (f.elements.namedItem("email") as HTMLInputElement).value;
    const message = (f.elements.namedItem("message") as HTMLTextAreaElement).value;
    const body = `From: ${from} (${fromEmail})\n\n${message}`;
    sendRaven();
    // navigate synchronously in the submit gesture — deferring this to a
    // timeout gets it popup-blocked in Safari/Firefox (raven flies regardless)
    window.location.href =
      `mailto:${email}?subject=` +
      encodeURIComponent("A raven from " + from) +
      "&body=" +
      encodeURIComponent(body);
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
        <div style={{ fontSize: 16, fontStyle: "italic", color: "#6d5a33", marginBottom: 18 }}>The bird knows the way to {email}</div>
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
