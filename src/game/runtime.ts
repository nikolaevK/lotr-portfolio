import * as THREE from "three";
import { MAP_W, MAP_H } from "@/data/content";

/**
 * Mutable per-frame game state shared between three.js systems without React
 * re-renders. The dragon writes; camera, weather, particles and UI read.
 */
export const runtime = {
  // dragon rigid state (world space)
  pos: new THREE.Vector3(MAP_W * 0.3, 60, MAP_H * 0.42),
  vel: new THREE.Vector3(),
  heading: -Math.PI / 4, // yaw, radians — direction of travel around +Y
  bank: 0,
  pitch: 0,
  speed: 0,
  wingPhase: 0,

  // combat / fx
  firing: false,
  mouthPos: new THREE.Vector3(),
  mouthDir: new THREE.Vector3(1, 0, 0),

  // navigation
  autoTarget: null as { x: number; z: number; id?: string } | null,
  cooldown: null as string | null,

  // camera
  shake: 0,
  camPos: new THREE.Vector3(MAP_W * 0.42, 420, MAP_H * 0.95),

  // camera director: while `owner` is set (a cinematic, photo mode), the rig
  // eases toward eye/look/fov instead of following the steed. The owner
  // writes these every frame and clears `owner` when it lets go.
  director: {
    owner: null as string | null,
    eye: new THREE.Vector3(),
    look: new THREE.Vector3(),
    fov: 55,
    stiffness: 3, // 1/s; Infinity snaps
    roll: 0, // radians about the view axis
  },

  // time of day, 0..1 (0 = midnight, 0.25 dawn, 0.5 noon, 0.75 dusk); the
  // sky advances it. `dayLock` pins it (photo mode's time slider).
  dayTime: 0.42,
  dayLock: null as number | null,

  // map view (overview) mouse exploration — camera-only, dragon stays put
  overviewPan: new THREE.Vector2(),
  overviewZoom: 1,
  overviewDragging: false,

  // ambience
  wind: new THREE.Vector2(1, 0.35).normalize(),
  windT: 0,

  // weather zone weights (regionId → 0..1), plus active zone id
  zoneWeights: {} as Record<string, number>,
  activeZone: "clear",

  reset() {
    this.pos.set(MAP_W * 0.3, 60, MAP_H * 0.42);
    this.vel.set(0, 0, 0);
    this.heading = -Math.PI / 4;
    this.bank = 0;
    this.pitch = 0;
    this.speed = 0;
    this.firing = false;
    this.autoTarget = null;
    this.cooldown = null;
    this.shake = 0;
    this.activeZone = "clear";
    this.overviewPan.set(0, 0);
    this.overviewZoom = 1;
    this.overviewDragging = false;
    this.director.owner = null;
    this.dayLock = null;
  },
};
