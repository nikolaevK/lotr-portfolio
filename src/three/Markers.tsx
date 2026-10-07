"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { toWorldX, toWorldZ, type Region } from "@/data/content";
import { useContent } from "@/state/content";
import { heightAt } from "@/three/noise";
import { solidAt } from "@/three/obstacles";
import { morph } from "@/three/Terrain";
import { useGame } from "@/state/store";
import { travelTo } from "@/game/actions";
import { runtime } from "@/game/runtime";

function cinzelFamily(): string {
  if (typeof document === "undefined") return "serif";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-cinzel").trim();
  return v || "serif";
}

function makeLabelTexture(text: string, visited: boolean, ring: string) {
  const cv = document.createElement("canvas");
  const W = 640;
  const H = 132;
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  // banner
  ctx.fillStyle = "rgba(20,13,6,0.85)";
  ctx.strokeStyle = "#6b5327";
  ctx.lineWidth = 4;
  const r = 10;
  ctx.beginPath();
  ctx.roundRect(6, 26, W - 12, H - 52, r);
  ctx.fill();
  ctx.stroke();
  // ring gem
  ctx.beginPath();
  ctx.arc(46, H / 2, 15, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.stroke();
  if (visited) {
    ctx.fillStyle = "#1a1208";
    ctx.font = `900 24px ${cinzelFamily()}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✓", 46, H / 2 + 1);
  }
  ctx.fillStyle = "#e2c682";
  ctx.font = `600 40px ${cinzelFamily()}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text.toUpperCase(), 78, H / 2 + 2, W - 100);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A pillar of light, not a painted tube: brightest along its core (where the
// surface faces the viewer), soft at its edges, and faded out when the camera
// is close enough to fly through it.
const beamVertex = /* glsl */ `
  varying float vY;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vY = uv.y;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vY;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    float core = pow(abs(dot(normalize(vNormalW), V)), 1.6);
    float near = smoothstep(18.0, 70.0, length(cameraPosition.xz - vWorld.xz));
    float a = (1.0 - vY) * (1.0 - vY) * uOpacity * core * near;
    gl_FragColor = vec4(uColor * a, 1.0);
  }`;

function Marker({ region }: { region: Region }) {
  const visited = useGame((s) => !!s.visited[region.id]);
  const tone = useGame((s) => s.tone);
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const sprite = useRef<THREE.Sprite>(null);
  const [labelTex, setLabelTex] = useState<THREE.CanvasTexture | null>(null);
  const [hover, setHover] = useState(false);

  const x = toWorldX(region.x);
  const z = toWorldZ(region.y);
  const baseY = useMemo(() => Math.max(heightAt(x, z), 2), [x, z]);
  // the banner floats clear of whatever stands here — inside the Tower of
  // Ecthelion or Erebor's gate it was cut in half by the masonry
  const labelY = useMemo(() => Math.max(50, solidAt(x, z) - baseY + 16), [x, z, baseY]);

  const label = region[tone].label;
  useEffect(() => {
    let alive = true;
    const draw = () => {
      if (!alive) return;
      setLabelTex((old) => {
        old?.dispose();
        return makeLabelTexture(label, visited, region.ring);
      });
    };
    draw();
    // redraw once webfonts are in
    document.fonts?.ready.then(draw).catch(() => {});
    return () => {
      alive = false;
    };
  }, [label, visited, region.ring]);

  const beamMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uColor: { value: new THREE.Color(region.ring) },
          uOpacity: { value: 0.5 },
        },
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
      }),
    [region.ring],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (group.current) {
      group.current.position.y = baseY * morph.value;
      group.current.visible = morph.value > 0.05;
    }
    beamMat.uniforms.uOpacity.value = (0.42 + Math.sin(t * 2.1) * 0.12) * (hover ? 1.5 : 1);
    if (ring.current) {
      const k = 1 + Math.sin(t * 2.6) * 0.12;
      ring.current.scale.setScalar(k);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 2.6) * 0.25;
    }
    if (sprite.current) {
      const s = hover ? 1.12 : 1;
      sprite.current.scale.set(44 * s, 9.1 * s, 1);
      // fade out as the steed arrives: the tale's scroll opens here, and a
      // banner overhead would only crowd the top of the screen and the HUD.
      // Map view keeps every banner — that is where they are read.
      const d = Math.hypot(runtime.pos.x - x, runtime.pos.z - z);
      (sprite.current.material as THREE.SpriteMaterial).opacity = useGame.getState().overview
        ? 1
        : THREE.MathUtils.smoothstep(d, 110, 230);
    }
  });

  const travel = (e: { stopPropagation: () => void; delta: number }) => {
    e.stopPropagation();
    // only map view has a drag gesture to disambiguate from a click
    if (useGame.getState().overview && e.delta > 6) return;
    travelTo(region.id);
  };

  return (
    <group ref={group} position={[x, 0, z]}>
      {/* pillar of light */}
      <mesh material={beamMat} position={[0, 67, 0]}>
        <cylinderGeometry args={[3.6, 4.8, 134, 12, 1, true]} />
      </mesh>
      {/* pulsing ground ring */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.8, 0]}>
        <torusGeometry args={[12, 0.75, 8, 36]} />
        <meshBasicMaterial color={region.ring} transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* name banner */}
      {labelTex && (
        <sprite ref={sprite} position={[0, labelY, 0]} scale={[44, 9.1, 1]} renderOrder={10}>
          <spriteMaterial map={labelTex} transparent depthWrite={false} />
        </sprite>
      )}
      {/* click volume */}
      <mesh
        visible={false}
        position={[0, 44, 0]}
        onClick={travel}
        onPointerOver={() => setHover(true)}
        onPointerOut={() => setHover(false)}
      >
        <cylinderGeometry args={[16, 16, 116, 8]} />
      </mesh>
    </group>
  );
}

export function Markers() {
  const regions = useContent((c) => c.regions);
  return (
    <group>
      {regions.map((r) => (
        <Marker key={r.id} region={r} />
      ))}
    </group>
  );
}
