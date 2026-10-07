/**
 * Main-thread access to the baked terrain (terrainBake.ts). The bake runs in
 * a worker; kept apart from the bake itself so the worker chunk does not
 * import the module that spawns it.
 */

import { buildTerrainData, type TerrainData } from "@/three/terrainBake";

export * from "@/three/terrainBake";

let DATA: TerrainData | null = null;
let pending: Promise<TerrainData> | null = null;

/** The baked terrain, once ready (null before). */
export const terrainData = () => DATA;

/**
 * Bake in a worker (main-thread fallback). Always the same promise — React's
 * `use()` must see a stable thenable or it would suspend on every render.
 */
export function loadTerrainData(): Promise<TerrainData> {
  if (pending) return pending;
  pending = new Promise<TerrainData>((resolve, reject) => {
    const finish = (d: TerrainData) => {
      DATA = d;
      resolve(d);
    };
    // if the fallback bake itself fails (e.g. out of memory on a small
    // phone), settle the promise rather than suspend the scene forever
    const fallback = () => {
      try {
        finish(buildTerrainData());
      } catch (err) {
        pending = null;
        reject(err);
      }
    };
    try {
      const worker = new Worker(new URL("./terrain.worker.ts", import.meta.url));
      worker.onmessage = (e: MessageEvent<TerrainData>) => {
        finish(e.data);
        worker.terminate();
      };
      worker.onerror = () => {
        worker.terminate();
        fallback();
      };
      worker.postMessage(null);
    } catch {
      fallback();
    }
  });
  return pending;
}

