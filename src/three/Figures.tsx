"use client";

import { Component, Suspense, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { SITES, toWorldX, toWorldZ } from "@/data/content";
import { heightAt } from "@/three/noise";
import { morph } from "@/three/Terrain";
import { normalizeToHeight } from "@/three/modelUtils";

/**
 * Pre-built GLB figures placed in the world (public/models/). Scroll characters
 * are handled separately by CharacterNiche; these are scene dressing anchored
 * to landmarks, normalized to a stated height so file scale never matters.
 */

interface FigureDef {
  url: string;
  /** anchor site + local offset, mirroring Landmarks' local coordinates */
  u: number;
  v: number;
  dx: number;
  dz: number;
  /** world-units tall after normalization */
  height: number;
  /** yaw; model forward assumed +Z, so -PI/2 faces west (-X, toward the approach) */
  rotY: number;
  /**
   * standing on an existing landmark structure: the structure-top height in the
   * landmark's local coordinates. Grounds the figure at the ANCHOR's terrain
   * height (what the structure's Grounded group uses), not the terrain under
   * the offset — so it sits flush on the deck.
   */
  onStructure?: number;
}

const FIGURES: FigureDef[] = [
  // the Balrog of Morgoth — risen onto the threshold slab before the Doors of Durin
  { url: "/models/balrog.glb", u: SITES.moria.u, v: SITES.moria.v, dx: -4.5, dz: 0, height: 24, rotY: -Math.PI / 2, onStructure: 1.4 },
  // Gandalf on the Mithlond quay deck, turned toward the white ship
  { url: "/models/gandalf.glb", u: SITES.havens.u, v: SITES.havens.v, dx: 1, dz: -1, height: 6.5, rotY: -1.35, onStructure: 2.4 },
  // Sauron in the heart of Mordor, at the Black Land's marker between Orodruin and the Tower
  { url: "/models/sauron.glb", u: 0.713, v: 0.588, dx: 8, dz: 6, height: 15, rotY: -Math.PI / 2 },
];

const CULL_DIST_SQ = 1500 * 1500; // matches Landmarks

function FigureModel({ def }: { def: FigureDef }) {
  const gltf = useLoader(GLTFLoader, def.url);
  const fit = useMemo(() => normalizeToHeight(gltf.scene, def.height), [gltf.scene, def.height]);
  const ref = useRef<THREE.Group>(null);

  const ax = toWorldX(def.u);
  const az = toWorldZ(def.v);
  const x = ax + def.dx;
  const z = az + def.dz;
  const onStructure = def.onStructure !== undefined;
  const baseY = useMemo(
    () => (onStructure ? heightAt(ax, az) : Math.max(heightAt(x, z), 2)),
    [onStructure, ax, az, x, z],
  );
  const standH = def.onStructure ?? 0;

  useFrame(({ camera }) => {
    if (!ref.current) return;
    const cdx = camera.position.x - x;
    const cdz = camera.position.z - z;
    ref.current.visible = morph.value > 0.02 && cdx * cdx + cdz * cdz < CULL_DIST_SQ;
    if (ref.current.visible) ref.current.position.y = baseY * morph.value + standH;
  });

  return (
    <group ref={ref} position={[x, 0, z]}>
      <group rotation={[0, def.rotY, 0]}>
        <group scale={fit.scale} position={fit.offset}>
          <primitive object={gltf.scene} />
        </group>
      </group>
    </group>
  );
}

/** A failed/missing GLB drops that one figure, never the scene. */
class FigureBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function Figures() {
  return (
    <>
      {FIGURES.map((def) => (
        <FigureBoundary key={def.url}>
          <Suspense fallback={null}>
            <FigureModel def={def} />
          </Suspense>
        </FigureBoundary>
      ))}
    </>
  );
}
