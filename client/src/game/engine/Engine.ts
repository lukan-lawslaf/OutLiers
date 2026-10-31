import type { FileMeta, Analysis } from '../../../../shared/schemas.js';
import type {
  AsteroidEntity,
  BulletEntity,
  EngineConfig,
  EngineEvents,
  GameStatus,
  ParticleEntity,
  ShipEntity,
} from './types.js';

// Simple Linear Congruential Generator for deterministic seeding
export class SeededRng {
  private state: number;

  constructor(seed = 1337) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

export function computeLogRadius(bytes: number): number {
  const mb = Math.max(0, bytes) / (1024 * 1024);
  // Log scale: min 20px, max 55px
  const radius = 20 + 5.5 * Math.log(1 + mb);
  return Math.min(60, Math.max(20, radius));
}

export class GameEngine {
  public config: EngineConfig;
  public status: GameStatus = 'idle';
  public ship: ShipEntity;
  public asteroids: AsteroidEntity[] = [];
  public bullets: BulletEntity[] = [];
  public particles: ParticleEntity[] = [];
  public wave = 1;
  public pendingKeepAsteroid: AsteroidEntity | null = null;

  private events: EngineEvents;
  private rng: SeededRng;
  private bulletIdCounter = 0;
  private nextSpawnTimer = 0;
  private queueToSpawn: Array<{ file: FileMeta; analysis: Analysis }> = [];

  constructor(config: EngineConfig, events: EngineEvents = {}) {
    this.config = config;
    this.events = events;
    this.rng = new SeededRng(config.seed ?? 42);

    this.ship = {
      x: config.width / 2,
      y: config.height - 40,
      targetX: config.width / 2,
      speed: 400,
      cooldown: 0,
      fireRate: 0.18, // 180ms
      lives: 3,
      combo: 0,
      maxCombo: 0,
    };
  }

  public loadWave(filesWithAnalysis: Array<{ file: FileMeta; analysis: Analysis }>, waveNumber = 1): void {
    this.wave = waveNumber;
    this.queueToSpawn = [...filesWithAnalysis];
    this.asteroids = [];
    this.bullets = [];
    this.particles = [];
    this.nextSpawnTimer = 0.5;
    this.status = 'running';
  }

  public moveShip(direction: 'left' | 'right' | 'stop', dt: number): void {
    if (this.status !== 'running') return;
    if (direction === 'left') {
      this.ship.x = Math.max(30, this.ship.x - this.ship.speed * dt);
    } else if (direction === 'right') {
      this.ship.x = Math.min(this.config.width - 30, this.ship.x + this.ship.speed * dt);
    }
  }

  public setShipPosition(targetX: number): void {
    if (this.status !== 'running') return;
    this.ship.x = Math.max(30, Math.min(this.config.width - 30, targetX));
  }

  public fireBullet(): boolean {
    if (this.status !== 'running') return false;
    if (this.ship.cooldown > 0) return false;

    this.ship.cooldown = this.ship.fireRate;
    const bullet: BulletEntity = {
      id: ++this.bulletIdCounter,
      x: this.ship.x,
      y: this.ship.y - 18,
      vy: -550,
      radius: 4,
      active: true,
    };
    this.bullets.push(bullet);
    this.events.onShoot?.(bullet);
    return true;
  }

  public spawnAsteroid(file: FileMeta, analysis: Analysis): AsteroidEntity {
    const radius = computeLogRadius(file.size);
    const x = this.rng.range(radius + 20, this.config.width - radius - 20);
    const y = -radius - 10;
    // Slower speed for heavier asteroids
    const baseSpeed = 70;
    const speedFactor = Math.max(0.6, 1.2 - radius / 60);
    const vy = this.rng.range(baseSpeed * 0.8, baseSpeed * 1.2) * speedFactor;
    const vx = this.rng.range(-15, 15);

    // Procedural jagged shape points (8-12 vertices)
    const vertexCount = 10;
    const shapePoints: number[] = [];
    for (let i = 0; i < vertexCount; i++) {
      shapePoints.push(0.85 + this.rng.range(-0.15, 0.15));
    }

    const asteroid: AsteroidEntity = {
      id: file.id,
      file,
      x,
      y,
      vx,
      vy,
      radius,
      rotation: 0,
      rotationSpeed: this.rng.range(-1, 1),
      health: 1,
      maxHealth: 1,
      verdict: analysis.verdict,
      reason: analysis.reason,
      category: analysis.category,
      confidence: analysis.confidence,
      destroyed: false,
      escaped: false,
      shapePoints,
    };

    this.asteroids.push(asteroid);
    return asteroid;
  }

  public update(dt: number): void {
    if (this.status !== 'running') return;

    // Cooldown update
    if (this.ship.cooldown > 0) {
      this.ship.cooldown = Math.max(0, this.ship.cooldown - dt);
    }

    // Spawn queue management
    this.nextSpawnTimer -= dt;
    if (this.nextSpawnTimer <= 0 && this.queueToSpawn.length > 0) {
      const item = this.queueToSpawn.shift()!;
      this.spawnAsteroid(item.file, item.analysis);
      this.nextSpawnTimer = this.rng.range(1.2, 2.5);
    }

    // Update bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.y += b.vy * dt;
      if (b.y < -20 || !b.active) {
        this.bullets.splice(i, 1);
      }
    }

    // Update asteroids
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
      if (a.destroyed || a.escaped) continue;

      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.rotation += a.rotationSpeed * dt;

      // Wall bounce
      if (a.x < a.radius && a.vx < 0) a.vx *= -1;
      if (a.x > this.config.width - a.radius && a.vx > 0) a.vx *= -1;

      // Bottom boundary check
      if (a.y > this.config.height + a.radius) {
        a.escaped = true;
        // Escaped junk breaks combo; escaped keep or maybe preserves combo
        if (a.verdict === 'junk' && this.ship.combo > 0) {
          this.ship.combo = 0;
          this.events.onComboChange?.(0);
        }
      }
    }

    // Collision Detection: Bullets vs Asteroids
    for (const bullet of this.bullets) {
      if (!bullet.active) continue;

      for (const asteroid of this.asteroids) {
        if (asteroid.destroyed || asteroid.escaped) continue;

        const dx = bullet.x - asteroid.x;
        const dy = bullet.y - asteroid.y;
        const distanceSq = dx * dx + dy * dy;

        if (distanceSq <= asteroid.radius * asteroid.radius) {
          bullet.active = false;

          // Check if it's a KEEP file -> Pause and prompt confirmation!
          if (asteroid.verdict === 'keep') {
            this.status = 'confirm_keep';
            this.pendingKeepAsteroid = asteroid;
            this.events.onKeepIntercepted?.(asteroid);
            return;
          }

          // Otherwise, destroy immediately!
          this.destroyAsteroid(asteroid, true);
          break;
        }
      }
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Check wave completion
    const activeAsteroids = this.asteroids.filter((a) => !a.destroyed && !a.escaped);
    if (this.queueToSpawn.length === 0 && activeAsteroids.length === 0) {
      this.status = 'wave_cleared';
      this.events.onWaveComplete?.(this.wave);
    }
  }

  public confirmKeepDestroy(): void {
    if (this.status !== 'confirm_keep' || !this.pendingKeepAsteroid) return;
    const asteroid = this.pendingKeepAsteroid;
    this.pendingKeepAsteroid = null;
    this.status = 'running';
    this.destroyAsteroid(asteroid, true);
  }

  public cancelKeepDestroy(): void {
    if (this.status !== 'confirm_keep' || !this.pendingKeepAsteroid) return;
    const asteroid = this.pendingKeepAsteroid;
    // Push slightly away or give shield bounce
    asteroid.vy = Math.max(40, asteroid.vy);
    this.pendingKeepAsteroid = null;
    this.status = 'running';
  }

  public destroyAsteroid(asteroid: AsteroidEntity, byPlayer: boolean): void {
    asteroid.destroyed = true;

    // Spawn explosion particles
    const particleCount = Math.min(24, Math.floor(asteroid.radius / 2));
    const colors =
      asteroid.verdict === 'junk'
        ? ['#ef4444', '#f87171', '#fee2e2']
        : asteroid.verdict === 'maybe'
          ? ['#f59e0b', '#fbbf24', '#fef3c7']
          : ['#3b82f6', '#60a5fa', '#dbeafe'];

    for (let i = 0; i < particleCount; i++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(40, 180);
      this.particles.push({
        x: asteroid.x,
        y: asteroid.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: this.rng.range(0.3, 0.6),
        maxLife: 0.6,
        color: colors[Math.floor(this.rng.range(0, colors.length))],
        size: this.rng.range(2, 5),
      });
    }

    if (byPlayer) {
      if (asteroid.verdict === 'junk') {
        this.ship.combo += 1;
        if (this.ship.combo > this.ship.maxCombo) {
          this.ship.maxCombo = this.ship.combo;
        }
      } else {
        this.ship.combo = 0;
      }
      this.events.onComboChange?.(this.ship.combo);
      this.events.onAsteroidDestroyed?.(asteroid, true);
    }
  }
}
