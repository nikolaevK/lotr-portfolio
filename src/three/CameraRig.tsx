"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MAP_W, MAP_H, EDGE, OVERVIEW_CAM } from "@/data/content";
import { runtime } from "@/game/runtime";
import { input, mouse, moveAxes } from "@/input/controls";
import { useGame } from "@/state/store";
import { morph } from "@/three/Terrain";
import { heightAt } from "@/three/noise";

const _eye = new THREE.Vector3();
const _look = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

export function CameraRig() {
  const smoothLook = useRef(new THREE.Vector3(MAP_W * 0.5, 0, MAP_H * 0.45));
  const fovRef = useRef(55);
  const t = useRef(0);

  useFrame(({ camera }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    t.current += dt;
    const s = useGame.getState();
    const cam = camera as THREE.PerspectiveCamera;

    _fwd.set(Math.cos(runtime.heading), 0, Math.sin(runtime.heading));
    _right.set(-_fwd.z, 0, _fwd.x);

    let stiffness = 3.2;
    let targetFov = 55;

    if (s.phase === "cover") {
      // cinematic drift over the flat parchment
      _eye.set(
        MAP_W * 0.38 + Math.sin(t.current * 0.05) * 90,
        640,
        MAP_H * 0.78 + Math.cos(t.current * 0.04) * 66,
      );
      _look.set(MAP_W * 0.52, 0, MAP_H * 0.38);
      stiffness = 1.2;
    } else if (s.overview) {
      // steering (WASD) or autopilot eases the mouse-panned view back onto the
      // steed — never while the user is actively holding a drag
      if (!runtime.overviewDragging) {
        const axes = moveAxes();
        if (Math.abs(axes.x) + Math.abs(axes.y) > 0.1 || runtime.autoTarget)
          runtime.overviewPan.multiplyScalar(Math.exp(-3.5 * dt));
      }
      // keep the viewed point on the map even as the steed moves post-drag
      const vx = THREE.MathUtils.clamp(runtime.pos.x + runtime.overviewPan.x, EDGE.x, MAP_W - EDGE.x);
      const vz = THREE.MathUtils.clamp(runtime.pos.z + runtime.overviewPan.y, EDGE.z, MAP_H - EDGE.z);
      runtime.overviewPan.set(vx - runtime.pos.x, vz - runtime.pos.z);
      const zm = runtime.overviewZoom;
      _eye.set(vx, runtime.pos.y + OVERVIEW_CAM.height * zm, vz + OVERVIEW_CAM.back * zm);
      _look.copy(runtime.pos).add(_fwd.multiplyScalar(46));
      _look.x += runtime.overviewPan.x;
      _look.z += runtime.overviewPan.y;
      stiffness = 2.2;
      targetFov = 50;
    } else {
      const speed01 = Math.min(runtime.speed / 115, 1);
      const boost = input.boost ? 1 : 0;
      const eagle = s.mount === "eagle";
      const dist = (eagle ? 25 : 30) + speed01 * 9 + boost * 4;
      _eye
        .copy(runtime.pos)
        .addScaledVector(_fwd, -dist)
        .add(_look.set(0, (eagle ? 10.5 : 12.5) + speed01 * 3, 0));
      // gentle mouse parallax (the concept's tilt)
      _eye.addScaledVector(_right, mouse.x * 5).y += -mouse.y * 3;
      _look.copy(runtime.pos).addScaledVector(_fwd, 14).y += 3.4;
      targetFov = 55 + speed01 * 5 + boost * 4;
      stiffness = 3.4;
      // intro swoop is softer
      if (morph.value < 1) stiffness = 1.6 + morph.value * 1.8;
    }

    const k = 1 - Math.exp(-stiffness * dt);
    runtime.camPos.lerp(_eye, k);
    smoothLook.current.lerp(_look, 1 - Math.exp(-4.2 * dt));

    // keep the (smoothed) camera out of the mountainsides
    if (s.phase === "map") {
      const groundAtCam =
        heightAt(
          THREE.MathUtils.clamp(runtime.camPos.x, 0, MAP_W),
          THREE.MathUtils.clamp(runtime.camPos.z, 0, MAP_H),
        ) * morph.value;
      if (runtime.camPos.y < groundAtCam + 8) runtime.camPos.y = groundAtCam + 8;
    }

    // shake (lightning, beacons)
    runtime.shake *= Math.exp(-3.2 * dt);
    const sh = runtime.shake;
    const shx = Math.sin(t.current * 71) * sh;
    const shy = Math.cos(t.current * 57) * sh * 0.8;

    cam.position.set(runtime.camPos.x + shx, runtime.camPos.y + shy, runtime.camPos.z + shx * 0.6);
    cam.up.set(0, 1, 0);
    cam.lookAt(smoothLook.current);
    if (s.phase === "map" && !s.overview) cam.rotateZ(-runtime.bank * 0.16);

    fovRef.current += (targetFov - fovRef.current) * Math.min(1, 3 * dt);
    if (Math.abs(cam.fov - fovRef.current) > 0.01) {
      cam.fov = fovRef.current;
      cam.updateProjectionMatrix();
    }
  });

  return null;
}
