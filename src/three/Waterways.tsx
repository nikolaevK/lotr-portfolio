"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MAP_W, MAP_H } from "@/data/content";
import { heightAt } from "@/three/noise";
import { morph } from "@/three/Terrain";

/**
 * Rivers and roads of Middle-earth, traced as map-fraction polylines against
 * the drawn art of map.jpg and draped as thin ribbons over the live terrain.
 */

interface Way {
  pts: [number, number][]; // u,v control points, source → mouth
  w: number; // half-width in world units
}

// ── rivers (source → sea), traced from the map art ───────────────────────────
const RIVERS: Way[] = [
  // Anduin, the Great River — from the northern vales past Lórien, Rauros,
  // Osgiliath and Pelargir to the delta at the Bay of Belfalas
  {
    pts: [
      [0.573, 0.115], [0.578, 0.185], [0.570, 0.223], [0.566, 0.258], [0.569, 0.288],
      [0.576, 0.318], [0.579, 0.352], [0.586, 0.390], [0.592, 0.432], [0.601, 0.468],
      [0.609, 0.492], [0.606, 0.520], [0.612, 0.545], [0.623, 0.572], [0.630, 0.600],
      [0.630, 0.613], [0.621, 0.636], [0.611, 0.650], [0.604, 0.670], [0.599, 0.694],
      [0.585, 0.708], [0.565, 0.714], [0.542, 0.716],
    ],
    w: 7.5,
  },
  // Brandywine / Baranduin — Lake Evendim through the Shire to the sea
  {
    pts: [
      [0.362, 0.205], [0.375, 0.238], [0.386, 0.266], [0.388, 0.300], [0.383, 0.336],
      [0.373, 0.372], [0.358, 0.398], [0.340, 0.415], [0.316, 0.428],
    ],
    w: 4.2,
  },
  // Hoarwell + Greyflood — down from the Ettenmoors past Tharbad to the sea
  {
    pts: [
      [0.478, 0.205], [0.470, 0.245], [0.460, 0.285], [0.452, 0.315], [0.437, 0.340],
      [0.425, 0.352], [0.408, 0.376], [0.390, 0.400], [0.368, 0.420],
    ],
    w: 4.4,
  },
  // Loudwater — out of the Hidden Valley to join the Hoarwell
  { pts: [[0.501, 0.256], [0.492, 0.290], [0.472, 0.312], [0.452, 0.315]], w: 3.0 },
  // Isen — from Isengard through the Gap of Rohan
  { pts: [[0.489, 0.492], [0.474, 0.496], [0.458, 0.498], [0.438, 0.506], [0.418, 0.516], [0.398, 0.527]], w: 3.2 },
  // Silverlode / Celebrant — from Moria's east gate through Lórien to Anduin
  { pts: [[0.514, 0.355], [0.530, 0.363], [0.548, 0.372], [0.565, 0.375], [0.578, 0.371]], w: 2.9 },
  // Limlight — along Fangorn's north eaves
  { pts: [[0.532, 0.408], [0.550, 0.408], [0.565, 0.406], [0.578, 0.402]], w: 3.2 },
  // Entwash — out of Fangorn to the marshes of Nindalf
  { pts: [[0.522, 0.455], [0.530, 0.480], [0.540, 0.505], [0.553, 0.520], [0.570, 0.525], [0.585, 0.514]], w: 3.2 },
  // Celduin, the River Running — Erebor and the Long Lake to the Sea of Rhûn
  {
    pts: [
      [0.6645, 0.2425], [0.671, 0.252], [0.678, 0.264], [0.683, 0.292], [0.695, 0.318],
      [0.715, 0.334], [0.740, 0.345], [0.765, 0.352], [0.790, 0.362],
    ],
    w: 3.9,
  },
  // Carnen, the Redwater — from the Iron Hills to the Celduin
  { pts: [[0.800, 0.185], [0.795, 0.225], [0.788, 0.262], [0.778, 0.300], [0.770, 0.330], [0.765, 0.352]], w: 3.1 },
  // Forest River — through northern Mirkwood to the Long Lake
  { pts: [[0.612, 0.222], [0.640, 0.230], [0.660, 0.242], [0.673, 0.248]], w: 3.2 },
  // Poros — border of Harondor, west into Anduin
  { pts: [[0.658, 0.724], [0.635, 0.728], [0.616, 0.722], [0.602, 0.712]], w: 2.9 },
];

// ── roads ────────────────────────────────────────────────────────────────────
const ROADS: Way[] = [
  // The Great East Road — Grey Havens through the Shire and Bree to Rivendell
  {
    pts: [
      [0.287, 0.268], [0.306, 0.259], [0.325, 0.262], [0.345, 0.263], [0.365, 0.266],
      [0.386, 0.267], [0.408, 0.267], [0.425, 0.266], [0.440, 0.268], [0.452, 0.270],
      [0.468, 0.272], [0.482, 0.268], [0.495, 0.259], [0.500, 0.254],
    ],
    w: 2.6,
  },
  // Greenway + Great West Road — Bree south past Tharbad, through the Gap of
  // Rohan, by Edoras and the beacon-hills to the gate of Minas Tirith
  {
    pts: [
      [0.425, 0.270], [0.423, 0.300], [0.422, 0.330], [0.425, 0.352], [0.435, 0.385],
      [0.447, 0.415], [0.458, 0.445], [0.468, 0.468], [0.472, 0.487], [0.482, 0.501],
      [0.492, 0.517], [0.503, 0.531], [0.512, 0.544], [0.527, 0.555], [0.545, 0.566],
      [0.562, 0.577], [0.580, 0.589], [0.595, 0.599], [0.605, 0.606],
    ],
    w: 2.4,
  },
];

/** Ribbon geometry draped on the terrain along a smoothed polyline. */
function buildRibbon(way: Way, lift: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(
    way.pts.map(([u, v]) => new THREE.Vector3(u * MAP_W, 0, v * MAP_H)),
    false,
    "centripetal",
  );
  const n = Math.max(24, way.pts.length * 7);
  const positions: number[] = [];
  const indices: number[] = [];
  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    curve.getPoint(f, p);
    curve.getTangent(f, t);
    // taper the ends so sources and mouths fade into the land
    const taper = Math.min(1, Math.min(f, 1 - f) * 10 + 0.25);
    const w = way.w * taper;
    const nx = -t.z;
    const nz = t.x;
    const inv = 1 / (Math.hypot(nx, nz) || 1);
    const y = heightAt(p.x, p.z) + lift;
    positions.push(p.x + nx * inv * w, y, p.z + nz * inv * w, p.x - nx * inv * w, y, p.z - nz * inv * w);
    if (i > 0) {
      const b = (i - 1) * 2;
      indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function mergeWays(ways: Way[], lift: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const w of ways) {
    const g = buildRibbon(w, lift);
    const base = positions.length / 3;
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    const idx = g.getIndex()!;
    for (let i = 0; i < idx.count; i++) indices.push(base + idx.getX(i));
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function Waterways() {
  const group = useRef<THREE.Group>(null);

  const riverGeo = useMemo(() => mergeWays(RIVERS, 2.0), []);
  const roadGeo = useMemo(() => mergeWays(ROADS, 1.6), []);

  const riverMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#3d7086",
        roughness: 0.22,
        metalness: 0.45,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    [],
  );
  const roadMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#8d7448",
        roughness: 0.96,
        transparent: true,
        opacity: 0.74,
        depthWrite: false,
      }),
    [],
  );

  useFrame(({ clock }) => {
    if (group.current) {
      group.current.scale.y = Math.max(morph.value, 0.001);
      group.current.visible = morph.value > 0.05;
    }
    // faint living shimmer on the water
    riverMat.opacity = 0.88 + Math.sin(clock.elapsedTime * 0.9) * 0.05;
  });

  return (
    <group ref={group}>
      <mesh geometry={roadGeo} material={roadMat} renderOrder={2} />
      <mesh geometry={riverGeo} material={riverMat} renderOrder={3} />
    </group>
  );
}
