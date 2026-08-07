"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SITES, toWorldX, toWorldZ } from "@/data/content";
import { heightAt } from "@/three/noise";
import { morph } from "@/three/Terrain";
import { normalizeToHeight } from "@/three/modelUtils";
import { buildCharacter } from "@/three/characters";
import { disposeGroup } from "@/three/kit";
import { Plume } from "@/three/Particles";

/**
 * Procedural figures placed in the world — built from the same kit and PBR
 * surfaces as the landmarks (see characters.ts), normalized to a stated height
 * so authoring scale never matters. Scroll characters are handled separately
 * by CharacterNiche.
 */

interface FigureDef {
  name: string;
  /** anchor site + local offset, mirroring Landmarks' local coordinates */
  u: number;
  v: number;
  dx: number;
  dz: number;
  /** world-units tall after normalization */
  height: number;
  /** yaw; figures are built facing +Z, so -PI/2 faces west (-X, toward the approach) */
  rotY: number;
  /**
   * standing on an existing landmark structure: the structure-top height in the
   * landmark's local coordinates. Grounds the figure at the ANCHOR's terrain
   * height (what the structure's Grounded group uses), not the terrain under
   * the offset — so it sits flush on the deck.
   */
  onStructure?: number;
  /** wreathed in shadow and flame */
  fire?: boolean;
}

const FIGURES: FigureDef[] = [
  // the Balrog of Morgoth — risen onto the threshold slab before the Doors of Durin
  { name: "balrog", u: SITES.moria.u, v: SITES.moria.v, dx: -4.5, dz: 0, height: 24, rotY: -Math.PI / 2, onStructure: 1.4, fire: true },
  // Gandalf on the Mithlond quay deck, turned toward the white ship
  { name: "gandalf", u: SITES.havens.u, v: SITES.havens.v, dx: 1, dz: -1, height: 6.5, rotY: -1.35, onStructure: 2.4 },
  // Sauron in the heart of Mordor, at the Black Land's marker between Orodruin and the Tower
  { name: "sauron", u: 0.713, v: 0.588, dx: 8, dz: 6, height: 15, rotY: -Math.PI / 2 },
];

const CULL_DIST_SQ = 1500 * 1500; // matches Landmarks

function FigureModel({ def }: { def: FigureDef }) {
  const built = useMemo(() => buildCharacter(def.name), [def.name]);
  const fit = useMemo(() => (built ? normalizeToHeight(built, def.height) : null), [built, def.height]);
  const ref = useRef<THREE.Group>(null);
  useEffect(() => () => { if (built) disposeGroup(built); }, [built]);

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

  // manual matrix, like Landmarks' Grounded: once the morph settles the whole
  // figure subtree stops paying per-frame matrix updates
  useEffect(() => {
    ref.current?.updateMatrix();
  }, []);
  useFrame(({ camera }) => {
    const g = ref.current;
    if (!g) return;
    const cdx = camera.position.x - x;
    const cdz = camera.position.z - z;
    g.visible = morph.value > 0.02 && cdx * cdx + cdz * cdz < CULL_DIST_SQ;
    if (g.visible) {
      const y = baseY * morph.value + standH;
      if (y !== g.position.y) {
        g.position.y = y;
        g.updateMatrix();
      }
    }
  });

  if (!built || !fit) return null;
  return (
    <group ref={ref} position={[x, 0, z]} matrixAutoUpdate={false}>
      <group rotation={[0, def.rotY, 0]}>
        <group scale={fit.scale} position={fit.offset}>
          <primitive object={built} />
        </group>
        {def.fire && (
          <>
            <Plume position={[0, def.height * 0.62, 0]} color="#ff6a1a" count={40} spread={def.height * 0.16} height={def.height * 0.7} size={3.2} rise={7} opacity={0.55} />
            <Plume position={[0, def.height * 0.5, 0]} color="#2a211c" count={26} spread={def.height * 0.2} height={def.height * 1.1} size={4.6} rise={5} additive={false} opacity={0.3} />
          </>
        )}
      </group>
    </group>
  );
}

export function Figures() {
  return (
    <>
      {FIGURES.map((def) => (
        <FigureModel key={def.name} def={def} />
      ))}
    </>
  );
}
