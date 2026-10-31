import { Component, useRef, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry, Vector3, type Vector3Tuple } from 'three';
import type { Station } from '../../shared/contracts';

gsap.registerPlugin(useGSAP);
const cube = new BoxGeometry(1, 1, 1);
const cylinder = new CylinderGeometry(1, 1, 1, 16);
const sphere = new SphereGeometry(1, 12, 8);
const palette = new Map<string, MeshStandardMaterial>();
function material(color: string) {
  let value = palette.get(color);
  if (!value) { value = new MeshStandardMaterial({ color, roughness: 0.88 }); palette.set(color, value); }
  return value;
}
interface ShapeProps { p: Vector3Tuple; s: Vector3Tuple; color: string; r?: Vector3Tuple }
function Box({ p, s, color, r }: ShapeProps) { return <mesh geometry={cube} material={material(color)} position={p} scale={s} rotation={r} />; }
function Round({ p, s, color, r }: ShapeProps) { return <mesh geometry={cylinder} material={material(color)} position={p} scale={s} rotation={r} />; }
function Orb({ p, s, color }: ShapeProps) { return <mesh geometry={sphere} material={material(color)} position={p} scale={s} />; }

const views: Record<Station, { position: Vector3Tuple; target: Vector3Tuple }> = {
  desk: { position: [7.7, 6.3, 9], target: [0, 1.3, -0.25] },
  board: { position: [2.2, 3.9, 7.2], target: [-0.2, 1.9, -1.6] },
  archive: { position: [6.8, 4.3, 6.3], target: [1.2, 1.65, -1.3] },
};

function CameraRig({ station, reduced }: { station: Station; reduced: boolean }) {
  const { camera, invalidate } = useThree();
  const look = useRef(new Vector3(0, 1.3, -0.25));
  useGSAP(() => {
    const view = views[station];
    const update = () => { camera.lookAt(look.current); invalidate(); };
    if (reduced) { camera.position.set(...view.position); look.current.set(...view.target); update(); return; }
    const timeline = gsap.timeline({ paused: true, onUpdate: update });
    timeline.to(camera.position, { x: view.position[0], y: view.position[1], z: view.position[2], duration: 0.8, ease: 'power2.inOut' }, 0);
    timeline.to(look.current, { x: view.target[0], y: view.target[1], z: view.target[2], duration: 0.8, ease: 'power2.inOut' }, 0);
    invalidate();
    const frame = requestAnimationFrame(() => timeline.play());
    return () => { cancelAnimationFrame(frame); };
  }, { dependencies: [station, reduced, camera, invalidate], revertOnUpdate: true });
  return null;
}

function Plant({ x, z, small = false }: { x: number; z: number; small?: boolean }) {
  const size = small ? 0.45 : 1;
  return <group position={[x, small ? 1.29 : 0, z]} scale={size}>
    <Round p={[0, 0.25, 0]} s={[0.27, 0.5, 0.27]} color="#AF7153" />
    <Round p={[0, 0.51, 0]} s={[0.3, 0.07, 0.3]} color="#C58B69" />
    <Round p={[0, 0.85, 0]} s={[0.035, 0.7, 0.035]} color="#536A40" />
    {[-1, 1].flatMap((sign) => [0, 1, 2].map((i) => <Orb key={`${sign}-${i}`} p={[sign * (0.13 + i * 0.025), 0.72 + i * 0.22, i % 2 ? 0.08 : -0.05]} s={[0.19, 0.28, 0.09]} color={i % 2 ? '#6B814F' : '#4E6444'} />))}
  </group>;
}

function Thread({ a, b }: { a: [number, number]; b: [number, number] }) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return <Box p={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, -2.54]} s={[Math.hypot(dx, dy), 0.014, 0.018]} r={[0, 0, Math.atan2(dy, dx)]} color="#A44838" />;
}

function Room({ onNavigate }: { onNavigate: (station: Station) => void }) {
  return <group dispose={null}>
    <ambientLight intensity={1.9} color="#FFF1D5" />
    <directionalLight position={[-3, 8, 6]} intensity={3} color="#FFF3D4" />
    <directionalLight position={[6, 5, -2]} intensity={1.1} color="#D5DEC9" />
    <Box p={[0, -0.16, 0]} s={[7.2, 0.3, 6.2]} color="#674A34" />
    {Array.from({ length: 12 }, (_, i) => <Box key={i} p={[-3.26 + i * 0.59, 0, 0]} s={[0.575, 0.06, 6]} color={i % 3 === 0 ? '#B28B60' : i % 2 === 0 ? '#C49C6B' : '#BD9566'} />)}
    <Box p={[0, 1.9, -3]} s={[7.2, 3.9, 0.16]} color="#D1CAB0" />
    <Box p={[-3.5, 1.9, 0]} s={[0.16, 3.9, 6]} color="#E2D8BF" />
    <Box p={[0, 0.18, -2.86]} s={[7, 0.25, 0.12]} color="#73573D" />
    <Box p={[-3.36, 0.18, 0]} s={[0.12, 0.25, 6]} color="#73573D" />
    {/* Window and its quiet afternoon light. */}
    <group position={[-3.37, 2.32, -0.7]} rotation={[0, Math.PI / 2, 0]}>
      <Box p={[0, 0, 0]} s={[2.1, 2.05, 0.12]} color="#70543A" />
      <Box p={[0, 0, 0.08]} s={[1.85, 1.8, 0.08]} color="#B7CEBD" />
      <Box p={[0, -0.42, 0.13]} s={[1.85, 0.9, 0.02]} color="#A5BBA0" />
      <Box p={[0, 0, 0.17]} s={[0.08, 1.9, 0.08]} color="#F3EBDD" />
      <Box p={[0, 0, 0.17]} s={[1.9, 0.08, 0.08]} color="#F3EBDD" />
      <Box p={[0, -1.05, 0.14]} s={[2.3, 0.12, 0.35]} color="#E9DBC1" />
      <Box p={[-1.05, 0.05, 0.1]} s={[0.29, 2.4, 0.2]} color="#B5BC98" />
      <Box p={[1.05, 0.05, 0.1]} s={[0.29, 2.4, 0.2]} color="#B5BC98" />
    </group>
    <Box p={[-1.2, 0.047, 1.05]} s={[3.8, 0.025, 2.65]} color="#7E8B65" />
    <Box p={[-1.2, 0.065, 1.05]} s={[3.55, 0.015, 2.4]} color="#99A17C" />
    {/* Writing desk. */}
    <group onClick={(event) => { event.stopPropagation(); onNavigate('desk'); }}>
      <Box p={[-0.95, 1.23, 0.65]} s={[3.2, 0.19, 1.48]} color="#92663F" />
      <Box p={[-0.95, 1.35, 0.65]} s={[3.28, 0.09, 1.55]} color="#BC905D" />
      {[-2.3, 0.4].flatMap((x) => [0.11, 1.2].map((z) => <Box key={`${x}-${z}`} p={[x, 0.61, z]} s={[0.16, 1.2, 0.16]} color="#735039" />))}
      <Box p={[0.03, 0.94, 0.65]} s={[0.73, 0.43, 1.25]} color="#9B7149" />
      <Box p={[0.03, 1.0, 1.29]} s={[0.65, 0.08, 0.035]} color="#6E4F36" />
      <Round p={[0.03, 0.97, 1.33]} s={[0.055, 0.03, 0.055]} r={[Math.PI / 2, 0, 0]} color="#B67A32" />
      <Box p={[-1.15, 1.41, 0.8]} s={[1.05, 0.03, 0.68]} color="#4E6444" />
      <Box p={[-1.1, 1.44, 0.7]} s={[0.66, 0.015, 0.52]} r={[0, 0.1, 0]} color="#FFF6E4" />
      <Box p={[-1.1, 1.46, 0.68]} s={[0.42, 0.01, 0.016]} r={[0, 0.1, 0]} color="#B2A58C" />
      <Box p={[-1.1, 1.46, 0.78]} s={[0.42, 0.01, 0.016]} r={[0, 0.1, 0]} color="#B2A58C" />
      <Box p={[-1.1, 1.46, 0.88]} s={[0.3, 0.01, 0.016]} r={[0, 0.1, 0]} color="#B2A58C" />
      <Round p={[-1.97, 1.45, 0.23]} s={[0.23, 0.09, 0.23]} color="#AF7B3C" />
      <Round p={[-1.97, 1.78, 0.23]} s={[0.035, 0.64, 0.035]} color="#A8783A" />
      <Round p={[-1.97, 2.1, 0.23]} s={[0.4, 0.2, 0.4]} color="#466441" />
      <Round p={[-0.18, 1.54, 0.31]} s={[0.105, 0.27, 0.105]} color="#F2E9D4" />
      <Round p={[-0.18, 1.68, 0.31]} s={[0.083, 0.009, 0.083]} color="#58402A" />
      <Box p={[-0.1, 1.42, 1.02]} s={[0.5, 0.06, 0.36]} r={[0, -0.12, 0]} color="#A44838" />
    </group>
    <Plant x={0.38} z={0.19} small />
    {/* Chair. */}
    <Round p={[-1.3, 0.7, 1.95]} s={[0.43, 0.13, 0.43]} color="#76543B" />
    <Box p={[-1.3, 1.1, 2.25]} s={[0.7, 0.75, 0.11]} r={[-0.1, 0, 0]} color="#8F6848" />
    {[-1.58, -1.02].flatMap((x) => [1.7, 2.17].map((z) => <Box key={`${x}-${z}`} p={[x, 0.34, z]} s={[0.08, 0.7, 0.08]} color="#674A35" />))}
    {/* Cork caseboard. */}
    <group onClick={(event) => { event.stopPropagation(); onNavigate('board'); }}>
      <Box p={[-0.65, 2.38, -2.79]} s={[3.15, 1.97, 0.16]} color="#765235" />
      <Box p={[-0.65, 2.38, -2.67]} s={[2.94, 1.76, 0.1]} color="#AD8058" />
      {([[-1.5, 2.8, -0.08], [-0.35, 2.9, 0.08], [-1.3, 1.94, 0.07], [0.18, 2.1, -0.08]] as const).map(([x,y,r], i) => <group key={i}>
        <Box p={[x, y, -2.59]} s={[0.62, 0.59, 0.025]} r={[0, 0, r]} color={i === 1 ? '#DAE0C2' : '#F2E7CD'} />
        <Box p={[x, y - 0.02, -2.568]} s={[0.4, 0.016, 0.012]} r={[0, 0, r]} color="#B5A68D" />
        <Box p={[x, y - 0.12, -2.568]} s={[0.31, 0.016, 0.012]} r={[0, 0, r]} color="#B5A68D" />
        <Orb p={[x, y + 0.25, -2.53]} s={[0.035, 0.035, 0.035]} color="#A44838" />
      </group>)}
      <Thread a={[-1.5, 3.05]} b={[-0.35, 3.15]} />
      <Thread a={[-1.5, 3.05]} b={[-1.3, 2.19]} />
      <Thread a={[-0.35, 3.15]} b={[0.18, 2.35]} />
      <Thread a={[-1.3, 2.19]} b={[0.18, 2.35]} />
    </group>
    {/* Archive shelves and linen-bound ledgers. */}
    <group position={[2.35, 0, -2.42]} onClick={(event) => { event.stopPropagation(); onNavigate('archive'); }}>
      <Box p={[0, 1.45, -0.33]} s={[1.6, 2.9, 0.12]} color="#7E5D40" />
      {[-0.82, 0.82].map((x) => <Box key={x} p={[x, 1.43, 0]} s={[0.13, 2.9, 0.8]} color="#8F6743" />)}
      {[0.13, 1.02, 1.91, 2.82].map((y) => <Box key={y} p={[0, y, 0]} s={[1.76, 0.13, 0.86]} color="#A17950" />)}
      {[0.6, 1.49, 2.38].flatMap((y, row) => Array.from({ length: 5 }, (_, i) => <group key={`${row}-${i}`}>
        <Box p={[-0.58 + i * 0.285, y, 0]} s={[0.235, 0.64 + (i % 2) * 0.08, 0.5]} color={['#75815C', '#AF8D62', '#A2634E', '#D0BA8B', '#69745B'][(i + row) % 5]!} />
        <Box p={[-0.58 + i * 0.285, y + 0.08, 0.26]} s={[0.12, 0.17, 0.012]} color="#E9DFC3" />
      </group>))}
      <Box p={[0.05, 3, 0]} s={[1.02, 0.2, 0.52]} color="#B9A27A" />
    </group>
    <Plant x={-2.85} z={-2.05} />
    <Round p={[1.26, 0.32, -2.2]} s={[0.32, 0.64, 0.32]} color="#AC8059" />
    <Box p={[1.3, 0.75, -2.2]} s={[0.5, 0.11, 0.42]} r={[0, 0.1, 0]} color="#E5D5B6" />
  </group>;
}

export function OfficeFallback() {
  return <div className="flat-office" aria-hidden="true"><svg viewBox="0 0 760 700" xmlns="http://www.w3.org/2000/svg">
    <defs><pattern id="boards" width="60" height="100" patternUnits="userSpaceOnUse"><path d="M0 0h60v100H0Z" fill="#C6A67B" stroke="#AD8A60" strokeWidth="2" /></pattern><pattern id="cork" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 0h12v12H0Z" fill="#AD8058" /><circle cx="3" cy="5" r="1" fill="#9C704C" /></pattern></defs>
    <path d="M85 130 415 70 690 205v355L365 660 85 480Z" fill="#D5CDB5" />
    <path d="m85 480 330-95 275 175-325 100Z" fill="url(#boards)" />
    <path d="M415 70v315L85 480V130Z" fill="#E3D9C0" />
    <path d="m415 70 275 135v355L415 385Z" fill="#CEC8AF" />
    <path d="m131 188 152-30v185l-152 42Z" fill="#72573E" />
    <path d="m142 197 131-26v163l-131 36Z" fill="#B7CEBD" />
    <path d="m208 184 1 166m-65-80 130-31" stroke="#F4EBD5" strokeWidth="9" />
    <path d="m448 165 177 85v141l-177-88Z" fill="#775235" />
    <path d="m459 182 155 74v117l-155-76Z" fill="url(#cork)" />
    <path d="m474 210 44 21v38l-44-21Zm77 40 43 21v41l-43-21Zm-59 31 42 19v38l-42-20Z" fill="#F4E8CC" />
    <path d="m493 217 79 51-57 19" fill="none" stroke="#A44838" strokeWidth="3" />
    <path d="m560 390 102 52v123l-102-59Z" fill="#7A593C" />
    <path d="m570 402 81 41m-81-1 81 43m-81-2 81 44" stroke="#B38A59" strokeWidth="10" />
    <path d="m582 413 1 25m17-17 1 25m18-15 1 25m-40 5 1 25m18-16 1 25m17-16 1 25" stroke="#AABA8A" strokeWidth="10" />
    <path d="m177 427 210-60 142 88-207 66Z" fill="#BA8E5B" stroke="#805A39" strokeWidth="8" />
    <path d="M190 439v104m128-30v109m195-168v108" stroke="#805A39" strokeWidth="15" />
    <path d="m282 430 91-26 55 35-92 28Z" fill="#4E6444" /><path d="m305 429 51-15 35 23-50 16Z" fill="#FFF5DF" />
    <path d="M247 418v-69m-27 0h55l-10-20h-35Z" fill="#4E6444" stroke="#9D763E" strokeWidth="7" />
    <ellipse cx="362" cy="565" rx="43" ry="20" fill="#896343" /><path d="M327 566v48m68-48v42m-67-48v-56q34-25 68 0v56" fill="#A17B53" stroke="#7D5839" strokeWidth="8" />
    <path d="m132 438 32-8 19 55-35 11Z" fill="#AE7154" /><path d="m154 439 2-82m0 39-26-16m26-4 26-21" stroke="#4E6444" strokeWidth="10" /><ellipse cx="130" cy="377" rx="13" ry="24" fill="#6F8453" transform="rotate(-35 130 377)" /><ellipse cx="181" cy="351" rx="14" ry="25" fill="#6F8453" transform="rotate(32 181 351)" />
  </svg></div>;
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <OfficeFallback /> : this.props.children; }
}

export default function Office({ station, reduced, flat, onNavigate }: { station: Station; reduced: boolean; flat: boolean; onNavigate: (station: Station) => void }) {
  if (flat) return <OfficeFallback />;
  return <SceneBoundary><Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: views.desk.position, fov: 37, near: 0.1, far: 60 }} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }} fallback={<OfficeFallback />} aria-hidden="true">
    <CameraRig station={station} reduced={reduced} />
    <Room onNavigate={onNavigate} />
  </Canvas></SceneBoundary>;
}
