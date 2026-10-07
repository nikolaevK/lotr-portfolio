/**
 * Rivers, roads and woods of Middle-earth, traced as map-fraction (u, v)
 * polylines and ellipses against the drawn art of public/assets/map.jpg.
 *
 * Pure data: the terrain baker (terrainData.ts, run in a worker) rasterises
 * these into the feature texture the ground shader and the forests read.
 */

export interface Way {
  pts: [number, number][]; // u,v control points, source → mouth
  w: number; // half-width in world units
}

// ── rivers (source → sea), traced from the map art ───────────────────────────
export const RIVERS: Way[] = [
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
export const ROADS: Way[] = [
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

/**
 * Woods, as soft ellipses in map fractions: centre (u, v), radii (ru, rv),
 * density 0..1 and the kind of tree that grows there. Placed over the forest
 * glyphs of map.jpg (Oct 2026 trace).
 */
export type TreeKind = "broadleaf" | "conifer" | "mirk" | "mallorn" | "ent";

export interface Wood {
  u: number;
  v: number;
  ru: number;
  rv: number;
  density: number;
  kind: TreeKind;
}

export const WOODS: Wood[] = [
  // Mirkwood — the great dark forest, laid out as overlapping lobes
  { u: 0.612, v: 0.185, ru: 0.047, rv: 0.032, density: 1, kind: "mirk" },
  { u: 0.627, v: 0.255, ru: 0.060, rv: 0.058, density: 1, kind: "mirk" },
  { u: 0.632, v: 0.325, ru: 0.046, rv: 0.045, density: 1, kind: "mirk" },
  { u: 0.625, v: 0.383, ru: 0.030, rv: 0.026, density: 0.95, kind: "mirk" },
  // Fangorn, eaves of the Misty Mountains' southern tip
  { u: 0.522, v: 0.447, ru: 0.026, rv: 0.027, density: 1, kind: "ent" },
  // Lothlórien, the Golden Wood between Celebrant and Anduin
  { u: 0.548, v: 0.378, ru: 0.017, rv: 0.013, density: 1, kind: "mallorn" },
  // Eriador
  { u: 0.401, v: 0.272, ru: 0.017, rv: 0.024, density: 0.95, kind: "broadleaf" }, // the Old Forest
  { u: 0.428, v: 0.221, ru: 0.014, rv: 0.014, density: 0.85, kind: "broadleaf" }, // Chetwood
  { u: 0.344, v: 0.224, ru: 0.010, rv: 0.010, density: 0.55, kind: "broadleaf" }, // woods of the Northfarthing
  { u: 0.371, v: 0.283, ru: 0.012, rv: 0.007, density: 0.55, kind: "broadleaf" }, // Green Hill Country
  { u: 0.478, v: 0.290, ru: 0.013, rv: 0.020, density: 0.85, kind: "conifer" }, // the Trollshaws
  { u: 0.487, v: 0.222, ru: 0.012, rv: 0.010, density: 0.7, kind: "conifer" },
  { u: 0.310, v: 0.386, ru: 0.020, rv: 0.012, density: 0.8, kind: "broadleaf" }, // Harlindon groves
  { u: 0.355, v: 0.391, ru: 0.012, rv: 0.010, density: 0.75, kind: "broadleaf" },
  { u: 0.326, v: 0.440, ru: 0.011, rv: 0.009, density: 0.85, kind: "conifer" }, // Eryn Vorn
  // Gondor
  { u: 0.588, v: 0.525, ru: 0.012, rv: 0.010, density: 0.85, kind: "conifer" }, // Drúadan Forest
  { u: 0.632, v: 0.600, ru: 0.010, rv: 0.040, density: 0.6, kind: "broadleaf" }, // Ithilien
  { u: 0.566, v: 0.671, ru: 0.012, rv: 0.010, density: 0.7, kind: "broadleaf" }, // Lebennin
  // the East
  { u: 0.832, v: 0.350, ru: 0.028, rv: 0.030, density: 0.9, kind: "conifer" }, // woods north of Rhûn
  { u: 0.930, v: 0.495, ru: 0.025, rv: 0.050, density: 0.9, kind: "conifer" },
];
