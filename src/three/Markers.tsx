"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { REGIONS, toWorldX, toWorldZ, type Region } from "@/data/content";
import { heightAt } from "@/three/noise";
import { morph } from "@/three/Terrain";
import { useGame } from "@/state/store";
import { travelTo } from "@/game/actions";

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

const beamVertex = /* glsl */ `
  varying float vY;
  void main() {
    vY = uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vY;
  void main() {
    float a = (1.0 - vY) * (1.0 - vY) * uOpacity;
    gl_FragColor = vec4(uColor, a);
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
          uOpacity: { value: 0.3 },
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
    beamMat.uniforms.uOpacity.value = (0.22 + Math.sin(t * 2.1) * 0.08) * (hover ? 1.6 : 1);
    if (ring.current) {
      const k = 1 + Math.sin(t * 2.6) * 0.12;
      ring.current.scale.setScalar(k);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 2.6) * 0.25;
    }
    if (sprite.current) {
      const s = hover ? 1.12 : 1;
      sprite.current.scale.set(44 * s, 9.1 * s, 1);
    }
  });

  const travel = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
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
        <sprite ref={sprite} position={[0, 50, 0]} scale={[44, 9.1, 1]}>
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
  return (
    <group>
      {REGIONS.map((r) => (
        <Marker key={r.id} region={r} />
      ))}
    </group>
  );
}
