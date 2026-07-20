"use client";

import * as THREE from "three";

/**
 * Source GLBs arrive at arbitrary author scale and origin. Normalization maps
 * any model to: feet at y=0, centered on x/z, exactly `targetHeight` tall —
 * so placement code deals in world units, never per-file magic numbers.
 */
export interface NormalizedTransform {
  scale: number;
  /** position offset to apply AFTER scaling */
  offset: THREE.Vector3;
}

export function normalizeToHeight(object: THREE.Object3D, targetHeight: number): NormalizedTransform {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const scale = size.y > 1e-6 ? targetHeight / size.y : 1;
  const center = box.getCenter(new THREE.Vector3());
  return {
    scale,
    offset: new THREE.Vector3(-center.x * scale, -box.min.y * scale, -center.z * scale),
  };
}
