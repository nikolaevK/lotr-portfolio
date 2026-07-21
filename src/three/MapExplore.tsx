"use client";

import { useEffect, useRef } from "react";
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
  const sitesRef = useRef<THREE.Group>(null);
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
    // all captured pointers — one pans (grab semantics), two pinch-zoom
    const pts = new Map<number, { x: number; y: number }>();
    let lastCX = 0;
    let lastCY = 0;
    let pinchDist = 0;
    // touch tap candidate: hover doesn't exist on touch, so a tap that never
    // turned into a drag/pinch reveals (or dismisses) the site tooltip instead
    let tap: { id: number; x: number; y: number; t: number } | null = null;

    const centroid = () => {
      let x = 0, y = 0;
      for (const p of pts.values()) { x += p.x; y += p.y; }
      return { x: x / pts.size, y: y / pts.size };
    };
    const resetCentroid = () => {
      if (pts.size === 0) return;
      const c = centroid();
      lastCX = c.x;
      lastCY = c.y;
    };
    const endDrag = () => {
      runtime.overviewDragging = false;
    };
    /** Shared bookkeeping for up/cancel/missed-release — keeps centroid and
     *  pinch baseline coherent whatever order pointers leave in. */
    const removePointer = (id: number) => {
      pts.delete(id);
      if (pts.size === 0) endDrag();
      else resetCentroid();
      if (pts.size === 2) {
        // 3→2 fingers: re-baseline or the next move applies a stale ratio
        const [a, b] = [...pts.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      } else if (pts.size < 2) {
        pinchDist = 0;
      }
    };
    const clamp = (z: number) => THREE.MathUtils.clamp(z, 0.45, 1.6);

    const raycaster = new THREE.Raycaster();
    const tapSelect = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      // hit the same 320-tall cylinders the mouse hover uses — a flat-plane
      // intersection misses sites that sit on raised terrain (Erebor, Mt Doom)
      const hits = sitesRef.current ? raycaster.intersectObjects(sitesRef.current.children, false) : [];
      const site = hits[0]?.object.userData.site as (typeof SITES)[keyof typeof SITES] | undefined;
      game().setMapHover(site ?? null);
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // a new touch gesture dismisses any open tooltip; a tap re-shows it
      if (e.pointerType !== "mouse") game().setMapHover(null);
      // capture: moves keep coming after the cursor leaves the canvas, and the
      // joystick finger can never interleave into this gesture
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // pointer already gone (rare) — bookkeeping below still self-heals
      }
      if (pts.size === 1) {
        runtime.overviewDragging = true;
        tap = e.pointerType !== "mouse" ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() } : null;
      } else {
        tap = null; // a second finger means pinch, not tap
        if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        }
      }
      resetCentroid();
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      if (e.pointerType === "mouse" && (e.buttons & 1) === 0) {
        removePointer(e.pointerId);
        return; // missed release
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (tap && tap.id === e.pointerId && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10) {
        tap = null; // it became a drag
      }
      // grab semantics: the map follows the pointer centroid
      const cam = camera as THREE.PerspectiveCamera;
      const worldPerPx =
        (2 * OVERVIEW_CAM.height * runtime.overviewZoom *
          Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) /
        el.clientHeight;
      const c = centroid();
      runtime.overviewPan.x -= (c.x - lastCX) * worldPerPx;
      runtime.overviewPan.y -= (c.y - lastCY) * worldPerPx;
      lastCX = c.x;
      lastCY = c.y;
      // (CameraRig clamps the viewed point to the map every frame)
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0 && d > 0) {
          // fingers apart = closer to the map
          runtime.overviewZoom = clamp(runtime.overviewZoom * (pinchDist / d));
          game().setMapHover(null);
        }
        pinchDist = d;
      }
    };
    const up = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      removePointer(e.pointerId);
      if (tap && tap.id === e.pointerId) {
        const wasTap = Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 10 && performance.now() - tap.t < 500;
        tap = null;
        if (wasTap) tapSelect(e.clientX, e.clientY);
      }
    };
    const cancel = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      if (tap?.id === e.pointerId) tap = null;
      removePointer(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      runtime.overviewZoom = clamp(runtime.overviewZoom * Math.exp(e.deltaY * 0.0011));
      game().setMapHover(null); // the world just moved under the cursor
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("lostpointercapture", cancel);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("lostpointercapture", cancel);
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
    <group ref={sitesRef}>
      {Object.entries(SITES).map(([id, site]) => (
        <mesh
          key={id}
          visible={false}
          userData={{ site }}
          position={[toWorldX(site.u), 90, toWorldZ(site.v)]}
          // mouse only: on touch the synthetic over/out pair around a tap would
          // instantly clear the tooltip that tapSelect just showed
          onPointerOver={(e) => e.pointerType === "mouse" && setMapHover(site)}
          onPointerOut={(e) => e.pointerType === "mouse" && setMapHover(null)}
        >
          <cylinderGeometry args={[site.r, site.r, 320, 8]} />
        </mesh>
      ))}
    </group>
  );
}
