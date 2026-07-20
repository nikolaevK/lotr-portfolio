"use client";

import { Component, Suspense, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Group } from "three";
import { normalizeToHeight } from "@/three/modelUtils";
import type { CharacterInfo } from "@/state/content";

/**
 * A character niche inside a scroll: renders the GLB on a slow turntable when
 * `modelUrl` is set, otherwise an inked placeholder portrait — so scrolls are
 * already laid out for the 3D characters as models get added via the admin.
 */

function Turntable({ url, scale }: { url: string; scale: number }) {
  const gltf = useLoader(GLTFLoader, url);
  const ref = useRef<Group>(null);
  // clone: the cached scene object may simultaneously stand in the 3D world
  // (Figures.tsx), and an Object3D can only live in one scene graph
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  // fit any source model into the niche; DB `scale` is an artistic multiplier
  const fit = useMemo(() => normalizeToHeight(scene, 1.9), [scene]);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.55;
  });
  return (
    <group ref={ref} position={[0, -0.95, 0]} scale={scale}>
      <group scale={fit.scale} position={fit.offset}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Ink-sketch placeholder: hooded figure over the parchment, awaiting its model. */
function InkedFigure() {
  return (
    <svg viewBox="0 0 100 130" style={{ width: "78%", height: "auto", opacity: 0.5 }}>
      <g fill="none" stroke="#3b2c12" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="50" cy="30" r="13" />
        <path d="M50,17 q-17,4 -15,20 q-1,-24 15,-26 q16,2 15,26 q2,-16 -15,-20" fill="#3b2c12" opacity=".55" />
        <path d="M35,46 Q28,80 24,122 M65,46 Q72,80 76,122" />
        <path d="M35,46 Q50,54 65,46" />
        <path d="M30,74 Q50,84 70,74" opacity=".6" />
        <path d="M24,122 Q50,116 76,122" />
      </g>
    </svg>
  );
}

export function CharacterNiche({ c, glyph }: { c: CharacterInfo; glyph: string }) {
  const placeholder = (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <InkedFigure />
      <div
        className="cinzel"
        style={{
          position: "absolute",
          right: 6,
          bottom: 4,
          fontSize: 15,
          fontWeight: 700,
          color: "#8a6420",
          opacity: 0.55,
        }}
      >
        {glyph}
      </div>
    </div>
  );

  return (
    <figure style={{ margin: 0, textAlign: "center" }}>
      {c.modelUrl ? (
        // the figure stands free on the parchment — no frame, no backdrop
        <div style={{ height: 264, margin: "-10px -14px -6px" }}>
          <ModelBoundary fallback={<div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>{placeholder}</div>}>
            <Canvas
              dpr={[1, 1.5]}
              camera={{ position: [0, 0.05, 2.85], fov: 38 }}
              gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
              style={{ width: "100%", height: "100%" }}
            >
              <ambientLight intensity={0.95} />
              <directionalLight position={[2.5, 4, 3]} intensity={1.5} color="#fff2d8" />
              <directionalLight position={[-3, 2, -2]} intensity={0.5} color="#c9b586" />
              <Suspense fallback={null}>
                <Turntable url={c.modelUrl} scale={c.scale} />
              </Suspense>
            </Canvas>
          </ModelBoundary>
        </div>
      ) : (
        <div
          style={{
            height: 172,
            border: "3px double #8a6420",
            borderRadius: 3,
            background:
              "radial-gradient(ellipse at 50% 30%, rgba(255,246,220,.55), rgba(201,150,60,.10) 70%), rgba(0,0,0,.05)",
            boxShadow: "inset 0 0 26px rgba(90,60,20,.28)",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {placeholder}
        </div>
      )}
      <figcaption style={{ marginTop: 7 }}>
        <div className="cinzel" style={{ fontSize: 12.5, letterSpacing: ".08em", color: "#2c1f0d" }}>{c.name}</div>
        {c.caption && (
          <div style={{ fontSize: 13.5, fontStyle: "italic", color: "#6d5a33", lineHeight: 1.35, marginTop: 2 }}>
            {c.caption}
          </div>
        )}
        {!c.modelUrl && (
          <div className="cinzel" style={{ fontSize: 9.5, letterSpacing: ".14em", color: "#8a6420", opacity: 0.7, marginTop: 4 }}>
            AWAITING ITS LIKENESS
          </div>
        )}
      </figcaption>
    </figure>
  );
}
