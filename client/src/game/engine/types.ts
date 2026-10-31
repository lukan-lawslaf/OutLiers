import type { FileMeta, Verdict, Category } from '../../../../shared/schemas.js';

export interface AsteroidEntity {
  id: string;
  file: FileMeta;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
  rotationSpeed: number;
  health: number;
  maxHealth: number;
  verdict: Verdict;
  reason: string;
  category: Category;
  confidence: number;
  destroyed: boolean;
  escaped: boolean;
  shapePoints: number[]; // relative radial offsets for jagged polygon
}

export interface BulletEntity {
  id: number;
  x: number;
  y: number;
  vy: number;
  radius: number;
  active: boolean;
}

export interface ParticleEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface ShipEntity {
  x: number;
  y: number;
  targetX: number;
  speed: number;
  cooldown: number;
  fireRate: number;
  lives: number;
  combo: number;
  maxCombo: number;
}

export type GameStatus =
  'idle' | 'running' | 'paused' | 'confirm_keep' | 'wave_cleared' | 'game_over';

export interface EngineConfig {
  width: number;
  height: number;
  fixedDeltaTime: number; // e.g. 1/60
  seed?: number;
}

export interface EngineEvents {
  onShoot?: (bullet: BulletEntity) => void;
  onAsteroidDestroyed?: (asteroid: AsteroidEntity, byPlayer: boolean) => void;
  onKeepIntercepted?: (asteroid: AsteroidEntity) => void;
  onComboChange?: (combo: number) => void;
  onWaveComplete?: (wave: number) => void;
}
