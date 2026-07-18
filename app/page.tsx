"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const App = dynamic(() => import("@/App"), { ssr: false });

export default function Page() {
  const [webgl, setWebgl] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      setWebgl(!!gl);
    } catch {
      setWebgl(false);
    }
  }, []);

  if (webgl === false) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(ellipse at 50% 45%, #241708, #0c0804 75%)",
        }}
      >
        <div
          style={{
            width: "min(460px, 90vw)",
            background: "linear-gradient(160deg, #f4e9c8, #e6d4a4)",
            border: "2px solid #6b5327",
            padding: "34px 40px",
            color: "#2c1f0d",
            textAlign: "center",
          }}
        >
          <div className="cinzel" style={{ fontSize: 13, letterSpacing: ".22em", color: "#8a6420" }}>
            ALAS
          </div>
          <h1 className="cinzel" style={{ fontSize: 26, margin: "10px 0" }}>
            The Palantír is Dark
          </h1>
          <p style={{ fontSize: 17, fontStyle: "italic", color: "#6d5a33" }}>
            This tale is told in WebGL, and your browser speaks it not. Seek a modern browser, and the
            map of Middle-earth shall be revealed.
          </p>
          <p style={{ fontSize: 15 }}>
            Meanwhile, the old roads remain: <a href="https://linkedin.com/in/konn">linkedin.com/in/konn</a>{" "}
            · <a href="https://github.com/nikolaevK">github.com/nikolaevK</a>
          </p>
        </div>
      </div>
    );
  }

  return webgl ? <App /> : null;
}
