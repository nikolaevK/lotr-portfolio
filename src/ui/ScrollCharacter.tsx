"use client";

import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import * as THREE from "three";
import type { Group } from "three";
import { normalizeToHeight } from "@/three/modelUtils";
import { buildCharacter, characterFor } from "@/three/characters";
import { disposeGroup } from "@/three/kit";
import type { CharacterInfo } from "@/state/content";

/**
 * A character niche inside a scroll: the figure stands in a lit alcove,
 * turned three-quarters toward the reader, breathing and shifting its weight
 * — drag to turn it round. Known names build the procedural kit figure
 * (characters.ts); anything else still loads as a GLB, so admin-uploaded
 * models keep working.
 */

/** pointer-drag yaw shared between the alcove's DOM and its figure */
interface Drag {
  active: boolean;
  /** the pointer that started the turn — a second finger is ignored */
  id: number;
  lastX: number;
  yaw: number;
}

/** Idle presentation: a three-quarter turn, a slow sway, a breath; drag adds yaw. */
function Presenter({ drag, children }: { drag: Drag; children: ReactNode }) {
  const ref = useRef<Group>(null);
  const t = useRef(Math.random() * 10);
  useFrame((_, dt) => {
    t.current += dt;
    const g = ref.current;
    if (!g) return;
    // released: ease the figure back to its pose
    if (!drag.active) drag.yaw *= Math.exp(-1.6 * dt);
    g.rotation.y = 0.32 + Math.sin(t.current * 0.45) * 0.22 + drag.yaw;
    g.scale.y = 1 + Math.sin(t.current * 1.7) * 0.006;
  });
  return <group ref={ref}>{children}</group>;
}

function GltfFigure({ url, scale }: { url: string; scale: number }) {
  const gltf = useLoader(GLTFLoader, url);
  // clone: the cached scene object could be shared with another niche
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  // fit any source model into the niche; DB `scale` is an artistic multiplier
  const fit = useMemo(() => normalizeToHeight(scene, 1.9), [scene]);
  return (
    <group position={[0, -0.95, 0]} scale={scale}>
      <group scale={fit.scale} position={fit.offset}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

function ProceduralFigure({ name, scale }: { name: string; scale: number }) {
  const scene = useMemo(() => buildCharacter(name)!, [name]);
  useEffect(() => () => disposeGroup(scene), [scene]);
  const fit = useMemo(() => normalizeToHeight(scene, 1.9), [scene]);
  return (
    <group position={[0, -0.95, 0]} scale={scale}>
      <group scale={fit.scale} position={fit.offset}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

/** The stone plinth the figure stands on, and its contact shadow. */
function Plinth() {
  return (
    <group position={[0, -0.95, 0]}>
      <mesh position={[0, -0.055, 0]}>
        <cylinderGeometry args={[0.6, 0.66, 0.11, 40]} />
        <meshStandardMaterial color="#bfa77c" roughness={0.85} />
      </mesh>
      <mesh position={[0, -0.0035, 0]}>
        <cylinderGeometry args={[0.57, 0.6, 0.012, 40]} />
        <meshStandardMaterial color="#d6c39a" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** A soft contact shadow pooled under the figure's feet. */
function GroundShadow() {
  const tex = useMemo(() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const ctx = cv.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, "rgba(40,24,8,0.55)");
    g.addColorStop(0.55, "rgba(40,24,8,0.22)");
    g.addColorStop(1, "rgba(40,24,8,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[0, -0.948, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.25, 0.8, 1]}>
      <circleGeometry args={[0.55, 28]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
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

/** The arched alcove the figure stands in: lit from above, the land's colour rising at its foot. */
function Alcove({ ring, children, onPointerDown }: { ring: string; children: ReactNode; onPointerDown?: (e: React.PointerEvent) => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: "relative",
        height: 268,
        margin: "0 2px",
        borderRadius: "104px 104px 4px 4px / 84px 84px 4px 4px",
        background: `radial-gradient(ellipse 80% 55% at 50% 30%, rgba(255,244,214,.95), rgba(236,214,168,.7) 55%, rgba(190,150,92,.55) 100%),
          radial-gradient(ellipse 70% 30% at 50% 100%, ${ring}55, transparent 70%)`,
        boxShadow:
          "inset 0 0 0 1px rgba(138,100,32,.75), inset 0 0 0 4px rgba(250,236,200,.55), inset 0 0 0 5px rgba(138,100,32,.4), inset 0 16px 34px rgba(80,52,18,.35), inset 0 -10px 24px rgba(80,52,18,.25), 0 1px 0 rgba(255,250,235,.6)",
        overflow: "hidden",
        cursor: "grab",
        touchAction: "pan-y",
      }}
    >
      {children}
      {/* keystone at the crown of the arch */}
      <div
        style={{
          position: "absolute",
          top: 3,
          left: "50%",
          width: 12,
          height: 12,
          marginLeft: -6,
          transform: "rotate(45deg)",
          background: "linear-gradient(135deg, #f4dc9a, #a8781e)",
          boxShadow: "0 1px 2px rgba(60,35,8,.5)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

export function CharacterNiche({ c, glyph, ring = "#c9963c" }: { c: CharacterInfo; glyph: string; ring?: string }) {
  const proc = c.modelUrl ? characterFor(c.modelUrl) : null;
  const drag = useRef<Drag>({ active: false, id: -1, lastX: 0, yaw: 0 }).current;
  const rim = useMemo(() => new THREE.Color(ring).lerp(new THREE.Color("#ffffff"), 0.35), [ring]);

  // drag anywhere once started — the figure turns with the pointer
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag.active || e.pointerId !== drag.id) return;
      // the button came up somewhere we never heard of it (a context menu)
      if (e.pointerType === "mouse" && e.buttons === 0) return up(e);
      drag.yaw += (e.clientX - drag.lastX) * 0.012;
      drag.lastX = e.clientX;
    };
    const up = (e: PointerEvent) => {
      if (!drag.active || e.pointerId !== drag.id) return;
      drag.active = false;
      // a long drag winds up many turns; ease back the short way round
      drag.yaw = Math.atan2(Math.sin(drag.yaw), Math.cos(drag.yaw));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag]);

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
        <Alcove
          ring={ring}
          onPointerDown={(e) => {
            if (e.button !== 0 || drag.active) return;
            // no text selection sweeping across the scroll as the mouse drags
            if (e.pointerType === "mouse") e.preventDefault();
            drag.active = true;
            drag.id = e.pointerId;
            drag.lastX = e.clientX;
          }}
        >
          <ModelBoundary fallback={<div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>{placeholder}</div>}>
            <Canvas
              dpr={[1, 1.75]}
              camera={{ position: [0, 0.32, 3.55], fov: 37 }}
              gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
              style={{ position: "absolute", inset: 0, zIndex: 1 }}
              onCreated={({ gl, scene }) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.05;
                // the figures wear real metals and normal maps; give them a
                // small neutral probe to reflect (the world has SkyEnvironment)
                const pmrem = new THREE.PMREMGenerator(gl);
                const room = new RoomEnvironment();
                scene.environment = pmrem.fromScene(room, 0.05).texture;
                scene.environmentIntensity = 0.45;
                room.traverse((o) => {
                  const m = o as THREE.Mesh;
                  if (m.isMesh) m.geometry.dispose();
                });
                pmrem.dispose();
              }}
            >
              {/* warm key from above the reader's shoulder, the land's colour as a
                  rim from behind, a low fill so the shadow side keeps its form */}
              <ambientLight intensity={0.28} />
              <directionalLight position={[2.2, 3.4, 3]} intensity={2.3} color="#ffe6c2" />
              <directionalLight position={[-2.4, 2.6, -3]} intensity={2.6} color={rim} />
              <directionalLight position={[-3, 0.4, 2]} intensity={0.45} color="#e6d2ae" />
              <Plinth />
              <GroundShadow />
              <Suspense fallback={null}>
                <Presenter drag={drag}>
                  {proc ? <ProceduralFigure name={proc} scale={c.scale} /> : <GltfFigure url={c.modelUrl} scale={c.scale} />}
                </Presenter>
              </Suspense>
            </Canvas>
          </ModelBoundary>
        </Alcove>
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
      <figcaption style={{ marginTop: 8 }}>
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
