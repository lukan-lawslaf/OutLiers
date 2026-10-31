import OfficeIllustration from './OfficeIllustration';
import { Component, memo, useRef, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Vector3Tuple,
} from 'three';
import type { Station } from '../../shared/contracts';

gsap.registerPlugin(useGSAP);
const cube = new BoxGeometry(1, 1, 1);
const cylinder = new CylinderGeometry(1, 1, 1, 16);
const sphere = new SphereGeometry(1, 12, 8);
const ring = new TorusGeometry(1, 0.13, 6, 32);
const lens = new CircleGeometry(1, 24);
const lensMaterial = new MeshStandardMaterial({
  color: '#D8E2D0',
  transparent: true,
  opacity: 0.22,
  roughness: 0.16,
});
const lampMaterial = new MeshStandardMaterial({
  color: '#E5BA72',
  emissive: '#E5BA72',
  emissiveIntensity: 0.9,
});
const palette = new Map<string, MeshStandardMaterial>();
function material(color: string) {
  let value = palette.get(color);
  if (!value) {
    value = new MeshStandardMaterial({ color, roughness: 0.88 });
    palette.set(color, value);
  }
  return value;
}
interface ShapeProps {
  p: Vector3Tuple;
  s: Vector3Tuple;
  color: string;
  r?: Vector3Tuple;
}
function Box({ p, s, color, r }: ShapeProps) {
  return <mesh geometry={cube} material={material(color)} position={p} scale={s} rotation={r} />;
}
function Round({ p, s, color, r }: ShapeProps) {
  return (
    <mesh geometry={cylinder} material={material(color)} position={p} scale={s} rotation={r} />
  );
}
function Orb({ p, s, color }: ShapeProps) {
  return <mesh geometry={sphere} material={material(color)} position={p} scale={s} />;
}

const views: Record<Station, { position: Vector3Tuple; target: Vector3Tuple }> = {
  desk: { position: [7.7, 6.3, 9], target: [0, 1.3, -0.25] },
  board: { position: [2.2, 3.9, 7.2], target: [-0.2, 1.9, -1.6] },
  archive: { position: [6.8, 4.3, 6.3], target: [1.2, 1.65, -1.3] },
};

function CameraRig({
  station,
  reduced,
  active,
}: {
  station: Station;
  reduced: boolean;
  active: boolean;
}) {
  const { camera, invalidate } = useThree();
  const look = useRef(new Vector3(0, 1.3, -0.25));
  const initialized = useRef(false);
  useGSAP(
    () => {
      if (!active) return;
      const view = views[station];
      if (reduced || !initialized.current) {
        initialized.current = true;
        camera.position.set(...view.position);
        look.current.set(...view.target);
        camera.lookAt(look.current);
        invalidate();
        return;
      }
      const start = camera.position.clone();
      const startLook = look.current.clone();
      const destination = new Vector3(...view.position);
      const destinationLook = new Vector3(...view.target);
      const progress = { value: 0 };
      // Tween a proxy rather than the camera: context cleanup then cannot snap
      // a newly interrupted transition back to its previous starting position.
      const timeline = gsap.timeline({ paused: true });
      timeline.to(progress, {
        value: 1,
        duration: 0.8,
        ease: 'power2.inOut',
        onUpdate: () => {
          camera.position.lerpVectors(start, destination, progress.value);
          look.current.lerpVectors(startLook, destinationLook, progress.value);
          camera.lookAt(look.current);
          invalidate();
        },
      });
      invalidate();
      const frame = requestAnimationFrame(() => timeline.play());
      return () => {
        cancelAnimationFrame(frame);
      };
    },
    { dependencies: [station, reduced, active, camera, invalidate], revertOnUpdate: true },
  );
  return null;
}

function Plant({ x, z, small = false }: { x: number; z: number; small?: boolean }) {
  const size = small ? 0.45 : 1;
  return (
    <group position={[x, small ? 1.29 : 0, z]} scale={size}>
      <Round p={[0, 0.25, 0]} s={[0.27, 0.5, 0.27]} color="#AF7153" />
      <Round p={[0, 0.51, 0]} s={[0.3, 0.07, 0.3]} color="#C58B69" />
      <Round p={[0, 0.85, 0]} s={[0.035, 0.7, 0.035]} color="#536A40" />
      {[-1, 1].flatMap((sign) =>
        [0, 1, 2].map((i) => (
          <Orb
            key={`${sign}-${i}`}
            p={[sign * (0.13 + i * 0.025), 0.72 + i * 0.22, i % 2 ? 0.08 : -0.05]}
            s={[0.19, 0.28, 0.09]}
            color={i % 2 ? '#6B814F' : '#4E6444'}
          />
        )),
      )}
    </group>
  );
}

function Thread({ a, b }: { a: [number, number]; b: [number, number] }) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  return (
    <Box
      p={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, -2.54]}
      s={[Math.hypot(dx, dy), 0.014, 0.018]}
      r={[0, 0, Math.atan2(dy, dx)]}
      color="#A44838"
    />
  );
}

function Room({ onNavigate }: { onNavigate: (station: Station) => void }) {
  return (
    <group dispose={null}>
      <ambientLight intensity={0.55} color="#E5BA72" />
      <hemisphereLight args={['#C7D1B7', '#172823', 1.1]} />
      <directionalLight position={[-3, 8, 6]} intensity={2.1} color="#E5BA72" />
      <directionalLight position={[6, 5, -2]} intensity={0.9} color="#8AAB9A" />
      <pointLight
        position={[-1.97, 2, 0.23]}
        intensity={9}
        distance={5.5}
        decay={2}
        color="#E5BA72"
      />
      <Box p={[0, -0.16, 0]} s={[7.2, 0.3, 6.2]} color="#674A34" />
      {Array.from({ length: 12 }, (_, i) => (
        <Box
          key={i}
          p={[-3.26 + i * 0.59, 0, 0]}
          s={[0.575, 0.06, 6]}
          color={i % 3 === 0 ? '#B28B60' : i % 2 === 0 ? '#C49C6B' : '#BD9566'}
        />
      ))}
      <Box p={[0, 1.9, -3]} s={[7.2, 3.9, 0.16]} color="#233D34" />
      <Box p={[-3.5, 1.9, 0]} s={[0.16, 3.9, 6]} color="#2D493D" />
      <Box p={[0, 0.18, -2.86]} s={[7, 0.25, 0.12]} color="#73573D" />
      <Box p={[-3.36, 0.18, 0]} s={[0.12, 0.25, 6]} color="#73573D" />
      {/* Window and its quiet afternoon light. */}
      <group position={[-3.37, 2.32, -0.7]} rotation={[0, Math.PI / 2, 0]}>
        <Box p={[0, 0, 0]} s={[2.1, 2.05, 0.12]} color="#70543A" />
        <Box p={[0, 0, 0.08]} s={[1.85, 1.8, 0.08]} color="#36504A" />
        <Box p={[0, -0.42, 0.13]} s={[1.85, 0.9, 0.02]} color="#172823" />
        <Box p={[0, 0, 0.17]} s={[0.08, 1.9, 0.08]} color="#F3EBDD" />
        <Box p={[0, 0, 0.17]} s={[1.9, 0.08, 0.08]} color="#F3EBDD" />
        <Box p={[0, -1.05, 0.14]} s={[2.3, 0.12, 0.35]} color="#E9DBC1" />
        <Box p={[-1.05, 0.05, 0.1]} s={[0.29, 2.4, 0.2]} color="#B5BC98" />
        <Box p={[1.05, 0.05, 0.1]} s={[0.29, 2.4, 0.2]} color="#B5BC98" />
      </group>
      <Box p={[-1.2, 0.047, 1.05]} s={[3.8, 0.025, 2.65]} color="#7E8B65" />
      <Box p={[-1.2, 0.065, 1.05]} s={[3.55, 0.015, 2.4]} color="#99A17C" />
      {/* Writing desk. */}
      <group
        onClick={(event) => {
          event.stopPropagation();
          onNavigate('desk');
        }}
      >
        <Box p={[-0.95, 1.23, 0.65]} s={[3.2, 0.19, 1.48]} color="#92663F" />
        <Box p={[-0.95, 1.35, 0.65]} s={[3.28, 0.09, 1.55]} color="#BC905D" />
        {[-2.3, 0.4].flatMap((x) =>
          [0.11, 1.2].map((z) => (
            <Box key={`${x}-${z}`} p={[x, 0.61, z]} s={[0.16, 1.2, 0.16]} color="#735039" />
          )),
        )}
        <Box p={[0.03, 0.94, 0.65]} s={[0.73, 0.43, 1.25]} color="#9B7149" />
        <Box p={[0.03, 1.0, 1.29]} s={[0.65, 0.08, 0.035]} color="#6E4F36" />
        <Round
          p={[0.03, 0.97, 1.33]}
          s={[0.055, 0.03, 0.055]}
          r={[Math.PI / 2, 0, 0]}
          color="#B67A32"
        />
        <Box p={[-1.15, 1.41, 0.8]} s={[1.05, 0.03, 0.68]} color="#4E6444" />
        <Box p={[-1.1, 1.44, 0.7]} s={[0.88, 0.015, 0.68]} r={[0, 0.1, 0]} color="#FFF9EE" />
        <Box p={[-1.43, 1.455, 0.72]} s={[0.045, 0.014, 0.58]} r={[0, 0.1, 0]} color="#A44838" />
        <Box p={[-1.1, 1.46, 0.68]} s={[0.42, 0.01, 0.016]} r={[0, 0.1, 0]} color="#B2A58C" />
        <Box p={[-1.1, 1.46, 0.78]} s={[0.42, 0.01, 0.016]} r={[0, 0.1, 0]} color="#B2A58C" />
        <Box p={[-1.1, 1.46, 0.88]} s={[0.3, 0.01, 0.016]} r={[0, 0.1, 0]} color="#B2A58C" />
        <Round p={[-1.97, 1.45, 0.23]} s={[0.23, 0.09, 0.23]} color="#AF7B3C" />
        <Round p={[-1.97, 1.78, 0.23]} s={[0.035, 0.64, 0.035]} color="#A8783A" />
        <Round p={[-1.97, 2.1, 0.23]} s={[0.4, 0.2, 0.4]} color="#466441" />
        <mesh
          geometry={cylinder}
          material={lampMaterial}
          position={[-1.97, 1.995, 0.23]}
          scale={[0.3, 0.023, 0.3]}
        />
        <Round p={[-0.18, 1.54, 0.31]} s={[0.105, 0.27, 0.105]} color="#F2E9D4" />
        <Round p={[-0.18, 1.68, 0.31]} s={[0.083, 0.009, 0.083]} color="#58402A" />
        <Box p={[-0.1, 1.42, 1.02]} s={[0.5, 0.06, 0.36]} r={[0, -0.12, 0]} color="#A44838" />
        <Round p={[-0.1, 1.56, 1.02]} s={[0.07, 0.18, 0.07]} color="#493527" />
        <group position={[-1.17, 1.48, 0.82]} rotation={[-Math.PI / 2, 0, -0.5]}>
          <mesh geometry={ring} material={material('#B67A32')} scale={0.22} />
          <mesh geometry={lens} material={lensMaterial} scale={0.205} />
          <Box p={[0, -0.4, 0]} s={[0.075, 0.42, 0.07]} color="#493527" />
          <Box p={[0, -0.24, 0]} s={[0.09, 0.1, 0.075]} color="#B67A32" />
        </group>
      </group>
      <Plant x={0.38} z={0.19} small />
      {/* Chair. */}
      <Round p={[-1.3, 0.7, 1.95]} s={[0.43, 0.13, 0.43]} color="#76543B" />
      <Box p={[-1.3, 1.1, 2.25]} s={[0.7, 0.75, 0.11]} r={[-0.1, 0, 0]} color="#8F6848" />
      {[-1.58, -1.02].flatMap((x) =>
        [1.7, 2.17].map((z) => (
          <Box key={`${x}-${z}`} p={[x, 0.34, z]} s={[0.08, 0.7, 0.08]} color="#674A35" />
        )),
      )}
      {/* Cork caseboard. */}
      <group
        onClick={(event) => {
          event.stopPropagation();
          onNavigate('board');
        }}
      >
        <Box p={[-0.65, 2.38, -2.79]} s={[3.15, 1.97, 0.16]} color="#765235" />
        <Box p={[-0.65, 2.38, -2.67]} s={[2.94, 1.76, 0.1]} color="#AD8058" />
        {(
          [
            [-1.5, 2.8, -0.08],
            [-0.35, 2.9, 0.08],
            [-1.3, 1.94, 0.07],
            [0.18, 2.1, -0.08],
          ] as const
        ).map(([x, y, r], i) => (
          <group key={i}>
            <Box
              p={[x, y, -2.59]}
              s={[0.62, 0.59, 0.025]}
              r={[0, 0, r]}
              color={i === 1 ? '#DAE0C2' : '#F2E7CD'}
            />
            <Box p={[x, y - 0.02, -2.568]} s={[0.4, 0.016, 0.012]} r={[0, 0, r]} color="#B5A68D" />
            <Box p={[x, y - 0.12, -2.568]} s={[0.31, 0.016, 0.012]} r={[0, 0, r]} color="#B5A68D" />
            <Orb p={[x, y + 0.25, -2.53]} s={[0.035, 0.035, 0.035]} color="#A44838" />
          </group>
        ))}
        <Thread a={[-1.5, 3.05]} b={[-0.35, 3.15]} />
        <Thread a={[-1.5, 3.05]} b={[-1.3, 2.19]} />
        <Thread a={[-0.35, 3.15]} b={[0.18, 2.35]} />
        <Thread a={[-1.3, 2.19]} b={[0.18, 2.35]} />
      </group>
      {/* Archive shelves and linen-bound ledgers. */}
      <group
        position={[2.35, 0, -2.42]}
        onClick={(event) => {
          event.stopPropagation();
          onNavigate('archive');
        }}
      >
        <Box p={[0, 1.45, -0.33]} s={[1.6, 2.9, 0.12]} color="#7E5D40" />
        {[-0.82, 0.82].map((x) => (
          <Box key={x} p={[x, 1.43, 0]} s={[0.13, 2.9, 0.8]} color="#8F6743" />
        ))}
        {[0.13, 1.02, 1.91, 2.82].map((y) => (
          <Box key={y} p={[0, y, 0]} s={[1.76, 0.13, 0.86]} color="#A17950" />
        ))}
        {[0.6, 1.49, 2.38].flatMap((y, row) =>
          Array.from({ length: 5 }, (_, i) => (
            <group key={`${row}-${i}`}>
              <Box
                p={[-0.58 + i * 0.285, y, 0]}
                s={[0.235, 0.64 + (i % 2) * 0.08, 0.5]}
                color={['#75815C', '#AF8D62', '#A2634E', '#D0BA8B', '#69745B'][(i + row) % 5]!}
              />
              <Box
                p={[-0.58 + i * 0.285, y + 0.08, 0.26]}
                s={[0.12, 0.17, 0.012]}
                color="#E9DFC3"
              />
            </group>
          )),
        )}
        <Box p={[0.05, 3, 0]} s={[1.02, 0.2, 0.52]} color="#B9A27A" />
      </group>
      <Plant x={-2.85} z={-2.05} />
      <Round p={[1.26, 0.32, -2.2]} s={[0.32, 0.64, 0.32]} color="#AC8059" />
      <Box p={[1.3, 0.75, -2.2]} s={[0.5, 0.11, 0.42]} r={[0, 0.1, 0]} color="#E5D5B6" />
    </group>
  );
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <OfficeIllustration /> : this.props.children;
  }
}

function Office({
  station,
  reduced,
  active,
  onNavigate,
}: {
  station: Station;
  reduced: boolean;
  active: boolean;
  onNavigate: (station: Station) => void;
}) {
  return (
    <SceneBoundary>
      <Canvas
        frameloop={active ? 'demand' : 'never'}
        dpr={[1, 1.5]}
        camera={{ position: views.desk.position, fov: 37, near: 0.1, far: 60 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        fallback={<OfficeIllustration />}
        aria-hidden="true"
      >
        <CameraRig station={station} reduced={reduced} active={active} />
        <Room onNavigate={onNavigate} />
      </Canvas>
    </SceneBoundary>
  );
}

export default memo(Office);
