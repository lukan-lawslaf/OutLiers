import pg from 'pg';
import type { Store, StoredImport, StoredInvestigation } from './store.js';
import { insist } from './errors.js';
import { hash } from './engine.js';
import type { FileSnapshot } from './file-snapshot.js';

/** PostgreSQL keeps one bounded JSON snapshot per resource; row locks serialize edits across replicas. */
export class PostgresStore implements Store {
  private pool: pg.Pool;
  constructor(connectionString: string, pool?: pg.Pool) {
    this.pool =
      pool ??
      new pg.Pool({
        connectionString,
        max: 5,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        statement_timeout: 10_000,
        query_timeout: 12_000,
      });
  }
  async initialize(): Promise<this> {
    try {
      await this.pool.query(
        'CREATE TABLE IF NOT EXISTS detective_imports (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
      );
      await this.pool.query(
        'CREATE TABLE IF NOT EXISTS detective_investigations (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
      );
      return this;
    } catch (error) {
      await this.pool.end().catch(() => undefined);
      throw error;
    }
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

  /** Explicit offline operation: all resources copy and verify together, or none commit. */
  async migrateSnapshot(input: FileSnapshot): Promise<{ imports: number; investigations: number }> {
    const snapshot = structuredClone(input);
    const imports = Object.values(snapshot.imports);
    const investigations = Object.values(snapshot.investigations);
    const client = await this.pool.connect();
    let releaseError: Error | undefined;
    try {
      await client.query('BEGIN');
      await client.query(
        'LOCK TABLE detective_imports, detective_investigations IN EXCLUSIVE MODE',
      );
      const importIds = imports.map((item) => item.data.id);
      const investigationIds = investigations.map((item) => item.data.id);
      const existingImports = await client.query(
        'SELECT id FROM detective_imports WHERE id = ANY($1::text[])',
        [importIds],
      );
      const existingInvestigations = await client.query(
        'SELECT id FROM detective_investigations WHERE id = ANY($1::text[])',
        [investigationIds],
      );
      insist(
        existingImports.rows.length === 0 && existingInvestigations.rows.length === 0,
        409,
        'MIGRATION_CONFLICT',
        'The destination already contains a source ID. Nothing was overwritten.',
      );

      // Fixed SQL with bounded parameter batches; file values never become SQL text.
      for (let offset = 0; offset < imports.length; offset += 10) {
        const batch = imports
          .slice(offset, offset + 10)
          .map((item) => ({ id: item.data.id, owner_id: item.ownerId, payload: item }));
        await client.query(
          'INSERT INTO detective_imports (id, owner_id, payload) SELECT id, owner_id, payload FROM jsonb_to_recordset($1::jsonb) AS records(id TEXT, owner_id TEXT, payload JSONB)',
          [JSON.stringify(batch)],
        );
      }
      for (let offset = 0; offset < investigations.length; offset += 10) {
        const batch = investigations
          .slice(offset, offset + 10)
          .map((item) => ({ id: item.data.id, owner_id: item.ownerId, payload: item }));
        await client.query(
          'INSERT INTO detective_investigations (id, owner_id, payload) SELECT id, owner_id, payload FROM jsonb_to_recordset($1::jsonb) AS records(id TEXT, owner_id TEXT, payload JSONB)',
          [JSON.stringify(batch)],
        );
      }

      const copiedImports = await client.query<{ owner_id: string; payload: StoredImport }>(
        'SELECT owner_id, payload FROM detective_imports WHERE id = ANY($1::text[])',
        [importIds],
      );
      const copiedInvestigations = await client.query<{
        owner_id: string;
        payload: StoredInvestigation;
      }>('SELECT owner_id, payload FROM detective_investigations WHERE id = ANY($1::text[])', [
        investigationIds,
      ]);
      insist(
        copiedImports.rows.length === imports.length &&
          copiedInvestigations.rows.length === investigations.length,
        500,
        'MIGRATION_VERIFICATION',
        'Copied resource counts do not match. Nothing was committed.',
      );
      for (const row of copiedImports.rows)
        insist(
          row.owner_id === row.payload.ownerId &&
            hash(row.payload) === hash(snapshot.imports[row.payload.data.id]),
          500,
          'MIGRATION_VERIFICATION',
          'An import differs from its source. Nothing was committed.',
        );
      for (const row of copiedInvestigations.rows)
        insist(
          row.owner_id === row.payload.ownerId &&
            hash(row.payload) === hash(snapshot.investigations[row.payload.data.id]),
          500,
          'MIGRATION_VERIFICATION',
          'An investigation differs from its source. Nothing was committed.',
        );
      await client.query('COMMIT');
      return { imports: imports.length, investigations: investigations.length };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        releaseError =
          rollbackError instanceof Error ? rollbackError : new Error('Database rollback failed.');
      }
      throw error;
    } finally {
      client.release(releaseError);
    }
  }
  async transact(
    id: string,
    update: (item: StoredInvestigation) => StoredInvestigation,
  ): Promise<StoredInvestigation> {
    const client = await this.pool.connect();
    let releaseError: Error | undefined;
    try {
      await client.query('BEGIN');
      const result = await client.query<{ payload: StoredInvestigation }>(
        'SELECT payload FROM detective_investigations WHERE id = $1 FOR UPDATE',
        [id],
      );
      const before = result.rows[0]?.payload;
      insist(before, 404, 'NOT_FOUND', 'Investigation not found.');
      const after = update(structuredClone(before));
      insist(
        after.data.id === id && after.ownerId === before.ownerId,
        409,
        'RESOURCE_ID_CONFLICT',
        'Investigation identity and ownership cannot be changed.',
      );
      await client.query(
        'UPDATE detective_investigations SET payload = $2::jsonb, updated_at = NOW() WHERE id = $1',
        [id, JSON.stringify(after)],
      );
      await client.query('COMMIT');
      return after;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        releaseError =
          rollbackError instanceof Error ? rollbackError : new Error('Database rollback failed.');
      }
      throw error;
    } finally {
      client.release(releaseError);
    }
  }
}
