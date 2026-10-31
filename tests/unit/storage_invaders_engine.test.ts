import { describe, expect, it, vi } from 'vitest';
import { GameEngine, computeLogRadius } from '../../client/src/game/engine/Engine.js';
import type { AsteroidEntity } from '../../client/src/game/engine/types.js';
import type { FileMeta, Analysis } from '../../shared/schemas.js';

describe('Storage Invaders Pure Game Engine', () => {
  const dummyFile: FileMeta = {
    id: 'test-f1',
    name: 'test_installer.exe',
    mimeType: 'application/x-msdownload',
    size: 100 * 1024 * 1024, // 100 MB
  };

  const dummyAnalysis: Analysis = {
    id: 'test-f1',
    verdict: 'junk',
    confidence: 0.9,
    reason: 'Executable installer',
    category: 'installer',
  };

  const keepFile: FileMeta = {
    id: 'test-f2',
    name: 'Official_Tax_Return_2025.pdf',
    mimeType: 'application/pdf',
    size: 2 * 1024 * 1024,
  };

  const keepAnalysis: Analysis = {
    id: 'test-f2',
    verdict: 'keep',
    confidence: 0.95,
    reason: 'Critical financial document',
    category: 'important_doc',
  };

  it('computes log-scale radius correctly for file sizes', () => {
    const small = computeLogRadius(1024 * 1024); // 1 MB
    const medium = computeLogRadius(100 * 1024 * 1024); // 100 MB
    const large = computeLogRadius(5 * 1024 * 1024 * 1024); // 5 GB

    expect(small).toBeGreaterThanOrEqual(20);
    expect(medium).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(medium);
    expect(large).toBeLessThanOrEqual(60);
  });

  it('initializes ship in center and handles boundary movement', () => {
    const engine = new GameEngine({ width: 800, height: 600, fixedDeltaTime: 1 / 60 });
    expect(engine.ship.x).toBe(400);

    // Move left beyond screen
    for (let i = 0; i < 50; i++) {
      engine.moveShip('left', 0.1);
    }
    expect(engine.ship.x).toBeGreaterThanOrEqual(30);

    // Move right beyond screen
    for (let i = 0; i < 50; i++) {
      engine.moveShip('right', 0.1);
    }
    expect(engine.ship.x).toBeLessThanOrEqual(770);
  });

  it('spawns asteroid with deterministic RNG and correct properties', () => {
    const engine = new GameEngine({ width: 800, height: 600, fixedDeltaTime: 1 / 60, seed: 1234 });
    const asteroid = engine.spawnAsteroid(dummyFile, dummyAnalysis);

    expect(asteroid.id).toBe(dummyFile.id);
    expect(asteroid.verdict).toBe('junk');
    expect(asteroid.destroyed).toBe(false);
    expect(asteroid.escaped).toBe(false);
    expect(asteroid.shapePoints.length).toBe(10);
  });

  it('destroys junk asteroid on bullet collision and increments combo', () => {
    const onAsteroidDestroyed = vi.fn();
    const onComboChange = vi.fn();

    const engine = new GameEngine(
      { width: 800, height: 600, fixedDeltaTime: 1 / 60, seed: 100 },
      { onAsteroidDestroyed, onComboChange },
    );
    engine.status = 'running';

    const asteroid = engine.spawnAsteroid(dummyFile, dummyAnalysis);
    asteroid.x = 400;
    asteroid.y = 300;

    // Fire bullet positioned to hit
    engine.ship.x = 400;
    engine.bullets.push({
      id: 1,
      x: 400,
      y: 305,
      vy: -500,
      radius: 4,
      active: true,
    });

    engine.update(1 / 60);

    expect(asteroid.destroyed).toBe(true);
    expect(engine.ship.combo).toBe(1);
    expect(onAsteroidDestroyed).toHaveBeenCalled();
    expect(onComboChange).toHaveBeenCalledWith(1);
  });

  it('intercepts and pauses on shooting keep files', () => {
    let intercepted: AsteroidEntity | null = null;
    const engine = new GameEngine(
      { width: 800, height: 600, fixedDeltaTime: 1 / 60, seed: 100 },
      { onKeepIntercepted: (a) => (intercepted = a) },
    );
    engine.status = 'running';

    const asteroid = engine.spawnAsteroid(keepFile, keepAnalysis);
    asteroid.x = 400;
    asteroid.y = 300;

    engine.bullets.push({
      id: 2,
      x: 400,
      y: 305,
      vy: -500,
      radius: 4,
      active: true,
    });

    engine.update(1 / 60);

    expect(engine.status).toBe('confirm_keep');
    expect(asteroid.destroyed).toBe(false);
    expect(intercepted).not.toBeNull();

    // Confirm keep destroy
    engine.confirmKeepDestroy();
    expect(asteroid.destroyed).toBe(true);
    expect(engine.status).toBe('running');
  });

  it('resets combo when junk asteroid escapes bottom', () => {
    const onComboChange = vi.fn();
    const engine = new GameEngine(
      { width: 800, height: 600, fixedDeltaTime: 1 / 60 },
      { onComboChange },
    );
    engine.status = 'running';
    engine.ship.combo = 4;

    const asteroid = engine.spawnAsteroid(dummyFile, dummyAnalysis);
    asteroid.y = 650; // past screen height
    asteroid.vy = 50;

    engine.update(1 / 60);

    expect(asteroid.escaped).toBe(true);
    expect(engine.ship.combo).toBe(0);
    expect(onComboChange).toHaveBeenCalledWith(0);
  });
});
