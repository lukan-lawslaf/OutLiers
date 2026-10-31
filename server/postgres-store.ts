import pg from 'pg';
import type { Store, StoredImport, StoredInvestigation } from './store.js';
import { insist } from './errors.js';

/** PostgreSQL keeps one bounded JSON snapshot per resource; row locks serialize edits across replicas. */
export class PostgresStore implements Store {
  private pool: pg.Pool;
  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  async initialize(): Promise<this> {
    await this.pool.query(
      'CREATE TABLE IF NOT EXISTS detective_imports (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
    );
    await this.pool.query(
      'CREATE TABLE IF NOT EXISTS detective_investigations (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
    );
    return this;
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
  async putImport(item: StoredImport): Promise<void> {
    await this.pool.query(
      'INSERT INTO detective_imports (id, owner_id, payload) VALUES ($1, $2, $3::jsonb)',
      [item.data.id, item.ownerId, JSON.stringify(item)],
    );
  }
  async getImport(id: string): Promise<StoredImport | undefined> {
    const result = await this.pool.query<{ payload: StoredImport }>(
      'SELECT payload FROM detective_imports WHERE id = $1',
      [id],
    );
    return result.rows[0]?.payload;
  }
  async create(item: StoredInvestigation): Promise<void> {
    await this.pool.query(
      'INSERT INTO detective_investigations (id, owner_id, payload) VALUES ($1, $2, $3::jsonb)',
      [item.data.id, item.ownerId, JSON.stringify(item)],
    );
  }
  async get(id: string): Promise<StoredInvestigation | undefined> {
    const result = await this.pool.query<{ payload: StoredInvestigation }>(
      'SELECT payload FROM detective_investigations WHERE id = $1',
      [id],
    );
    return result.rows[0]?.payload;
  }
  async transact(
    id: string,
    update: (item: StoredInvestigation) => StoredInvestigation,
  ): Promise<StoredInvestigation> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ payload: StoredInvestigation }>(
        'SELECT payload FROM detective_investigations WHERE id = $1 FOR UPDATE',
        [id],
      );
      const before = result.rows[0]?.payload;
      insist(before, 404, 'NOT_FOUND', 'Investigation not found.');
      const after = update(structuredClone(before));
      await client.query(
        'UPDATE detective_investigations SET payload = $2::jsonb, updated_at = NOW() WHERE id = $1',
        [id, JSON.stringify(after)],
      );
      await client.query('COMMIT');
      return after;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
