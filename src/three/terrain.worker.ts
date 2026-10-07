/// <reference lib="webworker" />
import { buildTerrainData } from "@/three/terrainBake";

// One message in, the baked terrain out — buffers are transferred, not copied.
self.onmessage = () => {
  const d = buildTerrainData();
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(d, [
    d.heights.buffer,
    d.normals.buffer,
    d.features.buffer,
    d.biome.buffer,
    d.detail.buffer,
    d.waves.buffer,
  ]);
};
