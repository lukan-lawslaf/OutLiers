import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Investigation, ImportResult } from '../../shared/contracts.js';
import { migrateFiles } from '../../server/migrate-file-to-postgres.js';
import { PostgresStore } from '../../server/postgres-store.js';
import type { StoredImport, StoredInvestigation } from '../../server/store.js';

interface ResourceRecord {
  id: string;
  owner_id: string;
  payload: StoredImport | StoredInvestigation;
}

interface QueryCall {
  sql: string;
  parameters?: readonly unknown[];
}

interface QueryResult {
  rows: Array<Record<string, unknown>>;
}

interface MigrationDatabase {
  pool: Pool;
  calls: QueryCall[];
  imports: ResourceRecord[];
  investigations: ResourceRecord[];
  release: ReturnType<typeof vi.fn>;
}

const temporaryDirectories: string[] = [];

function makeInvestigation(id: string): StoredInvestigation {
  const data: Investigation = {
    id,
    title: `Case ${id}`,
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

function makeImport(id: string): StoredImport {
  const data: ImportResult = {
    id,
    tables: [
      {
        id: 'source-table',
        name: 'People',
        columns: [{ id: 'name', name: 'Name', kind: 'text' }],
        rows: [
          {
            id: 'source-row',
            original: { name: 'Mira' },
            values: { name: 'Mira' },
            excluded: false,
          },
        ],
      },
    ],
    warnings: [],
  };
  return { ownerId: 'owner-import', data };
}

function makeMigrationDatabase(options?: {
  existingImportIds?: string[];
  existingInvestigationIds?: string[];
  omitVerification?: 'imports' | 'investigations';
}): MigrationDatabase {
  const calls: QueryCall[] = [];
  const imports: ResourceRecord[] = [];
  const investigations: ResourceRecord[] = [];
  const release = vi.fn();
  const result = async (sql: string, parameters?: readonly unknown[]): Promise<QueryResult> => {
    calls.push({ sql, parameters });
    if (sql.startsWith('SELECT id FROM detective_imports')) {
      return { rows: (options?.existingImportIds ?? []).map((id) => ({ id })) };
    }
    if (sql.startsWith('SELECT id FROM detective_investigations')) {
      return { rows: (options?.existingInvestigationIds ?? []).map((id) => ({ id })) };
    }
    if (sql.startsWith('INSERT INTO detective_imports')) {
      imports.push(...(JSON.parse(String(parameters?.[0])) as ResourceRecord[]));
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO detective_investigations')) {
      investigations.push(...(JSON.parse(String(parameters?.[0])) as ResourceRecord[]));
      return { rows: [] };
    }
    if (sql.startsWith('SELECT owner_id, payload FROM detective_imports')) {
      return {
        rows:
          options?.omitVerification === 'imports'
            ? []
            : imports.map(({ owner_id, payload }) => ({ owner_id, payload })),
      };
    }
    if (sql.startsWith('SELECT owner_id, payload FROM detective_investigations')) {
      return {
        rows:
          options?.omitVerification === 'investigations'
            ? []
            : investigations.map(({ owner_id, payload }) => ({ owner_id, payload })),
      };
    }
    return { rows: [] };
  };
  const client = {
    query: result,
    release,
  };
  const pool = { connect: async () => client } as unknown as Pool;
  return { pool, calls, imports, investigations, release };
}

async function makeSource(snapshot: {
  imports: Record<string, StoredImport>;
  investigations: Record<string, StoredInvestigation>;
}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'maplewick-migration-test-'));
  temporaryDirectories.push(directory);
  const filename = path.join(directory, 'state.json');
  await writeFile(filename, JSON.stringify(snapshot), 'utf8');
  return { directory, filename };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('offline migration safety', () => {
  it('copies imports and investigations through parameters and commits only after verification', async () => {
    const sourceImport = makeImport('import-1');
    const sourceCase = makeInvestigation('case-1');
    const database = makeMigrationDatabase();
    const store = new PostgresStore('postgres://unused', database.pool);

    await expect(
      store.migrateSnapshot({
        imports: { [sourceImport.data.id]: sourceImport },
        investigations: { [sourceCase.data.id]: sourceCase },
      }),
    ).resolves.toEqual({ imports: 1, investigations: 1 });

    const statements = database.calls.map(({ sql }) => sql);
    expect(statements[0]).toBe('BEGIN');
    expect(statements[1]).toContain('LOCK TABLE detective_imports, detective_investigations');
    expect(statements.at(-1)).toBe('COMMIT');
    expect(database.imports).toEqual([
      { id: 'import-1', owner_id: 'owner-import', payload: sourceImport },
    ]);
    expect(database.investigations).toEqual([
      { id: 'case-1', owner_id: 'owner-1', payload: sourceCase },
    ]);
    expect(
      database.calls
        .filter(({ sql }) => sql.startsWith('INSERT'))
        .every(({ parameters }) => Array.isArray(parameters) && typeof parameters[0] === 'string'),
    ).toBe(true);
    expect(database.release).toHaveBeenCalledOnce();
  });

  it('refuses to overwrite an existing destination ID and rolls back before any inserts', async () => {
    const sourceCase = makeInvestigation('case-1');
    const database = makeMigrationDatabase({ existingInvestigationIds: ['case-1'] });
    const store = new PostgresStore('postgres://unused', database.pool);

    await expect(
      store.migrateSnapshot({
        imports: {},
        investigations: { [sourceCase.data.id]: sourceCase },
      }),
    ).rejects.toMatchObject({ code: 'MIGRATION_CONFLICT', status: 409 });

    expect(database.calls.some(({ sql }) => sql.startsWith('INSERT'))).toBe(false);
    expect(database.calls.map(({ sql }) => sql).at(-1)).toBe('ROLLBACK');
    expect(database.calls.map(({ sql }) => sql)).not.toContain('COMMIT');
  });

  it('rolls back the entire copy when post-insert verification finds a missing resource', async () => {
    const sourceImport = makeImport('import-1');
    const sourceCase = makeInvestigation('case-1');
    const database = makeMigrationDatabase({ omitVerification: 'investigations' });
    const store = new PostgresStore('postgres://unused', database.pool);

    await expect(
      store.migrateSnapshot({
        imports: { [sourceImport.data.id]: sourceImport },
        investigations: { [sourceCase.data.id]: sourceCase },
      }),
    ).rejects.toMatchObject({ code: 'MIGRATION_VERIFICATION', status: 500 });

    expect(database.calls.some(({ sql }) => sql.startsWith('INSERT INTO detective_imports'))).toBe(
      true,
    );
    expect(
      database.calls.some(({ sql }) => sql.startsWith('INSERT INTO detective_investigations')),
    ).toBe(true);
    expect(database.calls.map(({ sql }) => sql).at(-1)).toBe('ROLLBACK');
    expect(database.calls.map(({ sql }) => sql)).not.toContain('COMMIT');
  });

  it('reports dry-run counts without modifying the legacy source', async () => {
    const sourceCase = makeInvestigation('case-dry-run');
    const source = await makeSource({
      imports: {},
      investigations: { [sourceCase.data.id]: sourceCase },
    });
    const before = await readFile(source.filename);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await migrateFiles(['--source', source.directory]);

    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      mode: 'dry-run',
      databaseConnected: false,
      imports: 0,
      investigations: 1,
    });
    expect(await readFile(source.filename)).toEqual(before);
    expect(await readdir(source.directory)).toEqual(['state.json']);
  });

  it('requires explicit offline and backup flags before applying a migration', async () => {
    const sourceCase = makeInvestigation('case-apply');
    const source = await makeSource({
      imports: {},
      investigations: { [sourceCase.data.id]: sourceCase },
    });

    await expect(migrateFiles(['--source', source.directory, '--apply'])).rejects.toMatchObject({
      code: 'MIGRATION_SAFETY',
      status: 400,
    });
    expect(await readdir(source.directory)).toEqual(['state.json']);
  });
});
