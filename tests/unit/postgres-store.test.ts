import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { Investigation } from '../../shared/contracts.js';
import { PostgresStore } from '../../server/postgres-store.js';
import type { StoredInvestigation } from '../../server/store.js';

interface FakeQueryResult {
  rows: Array<{ payload: StoredInvestigation }>;
}

interface FakeClient {
  query(sql: string, parameters?: readonly unknown[]): Promise<FakeQueryResult>;
  release(error?: Error): void;
}

interface PoolHarness {
  pool: Pool;
  poolQueries: string[];
  transactionQueries: string[];
  client: FakeClient;
  end: ReturnType<typeof vi.fn>;
}

function storedInvestigation(id = 'postgres-case'): StoredInvestigation {
  const data: Investigation = {
    id,
    title: 'A post office in Maplewick',
    revision: 0,
    tables: [
      {
        id: 'people',
        name: 'People',
        columns: [{ id: 'name', name: 'Name', kind: 'text' }],
        rows: [
          {
            id: 'row-1',
            original: { name: 'Mira' },
            values: { name: 'Mira' },
            excluded: false,
          },
        ],
      },
    ],
    cases: [],
    findings: [],
    history: [],
    stats: {
      totalRows: 1,
      activeRows: 1,
      changedRows: 0,
      openCases: 0,
      resolvedCases: 0,
      savedFindings: 0,
    },
    aiStatus: 'disabled',
  };
  return { ownerId: 'owner-1', data, receipts: {}, pendingFindings: {}, reviewUndos: {} };
}

function makePool(
  before: StoredInvestigation,
  respond?: (sql: string) => Promise<FakeQueryResult>,
): PoolHarness {
  const poolQueries: string[] = [];
  const transactionQueries: string[] = [];
  const end = vi.fn(async () => undefined);
  const client: FakeClient = {
    async query(sql) {
      transactionQueries.push(sql);
      if (respond) return respond(sql);
      return sql.startsWith('SELECT payload')
        ? { rows: [{ payload: structuredClone(before) }] }
        : { rows: [] };
    },
    release() {},
  };
  const pool = {
    async query(sql: string) {
      poolQueries.push(sql);
      return { rows: [] };
    },
    async connect() {
      return client;
    },
    end,
  } as unknown as Pool;
  return {
    pool,
    poolQueries,
    transactionQueries,
    client,
    end,
  };
}

describe('PostgresStore transaction guarantees', () => {
  it('locks one resource, commits a detached update, and keeps source records immutable', async () => {
    const original = storedInvestigation();
    const harness = makePool(original);
    const store = new PostgresStore('postgres://unused', harness.pool);

    const result = await store.transact(original.data.id, (item) => {
      item.data.revision += 1;
      item.data.tables[0]!.rows[0]!.values.name = 'Mira Vale';
      return item;
    });

    expect(harness.transactionQueries).toEqual([
      'BEGIN',
      'SELECT payload FROM detective_investigations WHERE id = $1 FOR UPDATE',
      'UPDATE detective_investigations SET payload = $2::jsonb, updated_at = NOW() WHERE id = $1',
      'COMMIT',
    ]);
    expect(result.data.revision).toBe(1);
    expect(result.data.tables[0]?.rows[0]?.values.name).toBe('Mira Vale');
    expect(result.data.tables[0]?.rows[0]?.original).toEqual({ name: 'Mira' });
    expect(original.data.revision).toBe(0);
    expect(original.data.tables[0]?.rows[0]?.values.name).toBe('Mira');
  });

  it('rolls back a failed write and preserves the original database error', async () => {
    const writeError = new Error('write failed');
    const harness = makePool(storedInvestigation(), async (sql) => {
      if (sql.startsWith('SELECT payload')) {
        return { rows: [{ payload: storedInvestigation() }] };
      }
      if (sql.startsWith('UPDATE')) throw writeError;
      return { rows: [] };
    });
    const store = new PostgresStore('postgres://unused', harness.pool);

    await expect(
      store.transact('postgres-case', (item) => {
        item.data.revision += 1;
        return item;
      }),
    ).rejects.toBe(writeError);
    expect(harness.transactionQueries.at(-1)).toBe('ROLLBACK');
    expect(harness.transactionQueries).not.toContain('COMMIT');
  });

  it('does not let a rollback failure mask the transaction error and discards that client', async () => {
    const writeError = new Error('write failed first');
    const rollbackError = new Error('rollback failed second');
    let releasedWith: Error | undefined;
    const harness = makePool(storedInvestigation(), async (sql) => {
      if (sql.startsWith('SELECT payload')) {
        return { rows: [{ payload: storedInvestigation() }] };
      }
      if (sql.startsWith('UPDATE')) throw writeError;
      if (sql === 'ROLLBACK') throw rollbackError;
      return { rows: [] };
    });
    harness.client.release = (error) => {
      releasedWith = error;
    };
    const store = new PostgresStore('postgres://unused', harness.pool);

    await expect(
      store.transact('postgres-case', (item) => {
        item.data.revision += 1;
        return item;
      }),
    ).rejects.toBe(writeError);
    expect(releasedWith).toBe(rollbackError);
  });

  it('rejects attempts to change resource ownership or identity before writing', async () => {
    const original = storedInvestigation();
    const harness = makePool(original);
    const store = new PostgresStore('postgres://unused', harness.pool);

    await expect(
      store.transact(original.data.id, (item) => {
        item.ownerId = 'attacker';
        return item;
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_ID_CONFLICT', status: 409 });
    expect(harness.transactionQueries).not.toContain(
      'UPDATE detective_investigations SET payload = $2::jsonb, updated_at = NOW() WHERE id = $1',
    );
    expect(harness.transactionQueries.at(-1)).toBe('ROLLBACK');
  });

  it('closes the pool after schema initialization fails without replacing the error', async () => {
    const schemaError = new Error('schema unavailable');
    const end = vi.fn(async () => undefined);
    const pool = {
      async query() {
        throw schemaError;
      },
      end,
    } as unknown as Pool;
    const store = new PostgresStore('postgres://unused', pool);

    await expect(store.initialize()).rejects.toBe(schemaError);
    expect(end).toHaveBeenCalledOnce();
  });
});
