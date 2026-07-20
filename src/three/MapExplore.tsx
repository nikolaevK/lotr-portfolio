"use client";

import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OVERVIEW_CAM, SITES, toWorldX, toWorldZ } from "@/data/content";
import { runtime } from "@/game/runtime";
import { useGame, game } from "@/state/store";

/**
 * Map-view mouse exploration: drag pans the camera, the wheel zooms, and
 * invisible volumes over the SITES feed the hover tooltip. Camera-only —
 * the steed stays where it is; gliding (WASD) or autopilot re-centers.
 */
export function MapExplore() {
  const overview = useGame((s) => s.overview);
  const phase = useGame((s) => s.phase);
  const setMapHover = useGame((s) => s.setMapHover);
  const gl = useThree((st) => st.gl);
  const camera = useThree((st) => st.camera);
  const active = overview && phase === "map";

  // the world can slide under a motionless cursor (glide, autopilot) — no
  // pointer event fires then, so clear a now-stale tooltip here
  useFrame(() => {
    if (active && runtime.speed > 20 && game().mapHover) game().setMapHover(null);
  });

  useEffect(() => {
    if (!active) return;
    runtime.overviewPan.set(0, 0);
    runtime.overviewZoom = 1;
    const el = gl.domElement;
    let dragId: number | null = null;
    let lastX = 0;
    let lastY = 0;

    const endDrag = () => {
      dragId = null;
      runtime.overviewDragging = false;
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || dragId !== null) return;
      dragId = e.pointerId;
      runtime.overviewDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      // capture: moves keep coming after the cursor leaves the canvas, and a
      // second touch (joystick finger) can never interleave into this drag
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== dragId) return;
      if (e.pointerType === "mouse" && (e.buttons & 1) === 0) return endDrag(); // missed release
      // grab semantics: the map follows the cursor
      const cam = camera as THREE.PerspectiveCamera;
      const worldPerPx =
        (2 * OVERVIEW_CAM.height * runtime.overviewZoom *
          Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) /
        el.clientHeight;
      runtime.overviewPan.x -= (e.clientX - lastX) * worldPerPx;
      runtime.overviewPan.y -= (e.clientY - lastY) * worldPerPx;
      lastX = e.clientX;
      lastY = e.clientY;
      // (CameraRig clamps the viewed point to the map every frame)
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === dragId) endDrag();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      runtime.overviewZoom = THREE.MathUtils.clamp(
        runtime.overviewZoom * Math.exp(e.deltaY * 0.0011),
        0.45,
        1.6,
      );
      game().setMapHover(null); // the world just moved under the cursor
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("lostpointercapture", up);
      el.removeEventListener("wheel", wheel);
      endDrag();
      // Weather/particles anchor to pos + overviewPan — never leave it stale
      runtime.overviewPan.set(0, 0);
      runtime.overviewZoom = 1;
      game().setMapHover(null);
    };
  }, [active, gl, camera]);

  if (!active) return null;
  return (
    <group>
      {Object.entries(SITES).map(([id, site]) => (
        <mesh
          key={id}
          visible={false}
          position={[toWorldX(site.u), 90, toWorldZ(site.v)]}
          onPointerOver={() => setMapHover(site)}
          onPointerOut={() => setMapHover(null)}
        >
          <cylinderGeometry args={[site.r, site.r, 320, 8]} />
        </mesh>
      ))}
    </group>
  );
}
