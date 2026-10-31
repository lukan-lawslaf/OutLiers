import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Investigation } from '../../shared/contracts.js';
import {
  FileStore,
  MemoryStore,
  type StoredImport,
  type StoredInvestigation,
} from '../../server/store.js';

const temporaryDirectories: string[] = [];

class FailingPersistFileStore extends FileStore {
  failNextPersistence = false;

  protected override async persist(
    kind: 'imports' | 'investigations',
    item: StoredImport | StoredInvestigation,
  ): Promise<void> {
    if (this.failNextPersistence) {
      this.failNextPersistence = false;
      throw new Error('simulated file persistence failure');
    }
    await super.persist(kind, item);
  }
}

async function makeStored(id: string, ownerId: string): Promise<StoredInvestigation> {
  const investigation: Investigation = {
    id,
    title: `Case ${id}`,
    revision: 0,
    tables: [
      {
        id: `table-${id}`,
        name: `Table ${id}`,
        columns: [{ id: 'value', name: 'Value', kind: 'text' }],
        rows: [
          {
            id: `row-${id}`,
            original: { value: `source-${id}` },
            values: { value: `source-${id}` },
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
  return { ownerId, data: investigation, receipts: {}, pendingFindings: {}, reviewUndos: {} };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('store resource isolation and rollback', () => {
  it('isolates concurrent updates, preserves originals, and returns detached snapshots', async () => {
    const store = new MemoryStore();
    const first = await makeStored('case-one', 'user-one');
    const second = await makeStored('case-two', 'user-two');
    await Promise.all([store.create(first), store.create(second)]);
    const secondBefore = await store.get(second.data.id);

    await Promise.all(
      Array.from({ length: 20 }, () =>
        store.transact(first.data.id, (item) => {
          item.data.revision++;
          item.data.tables[0]!.rows[0]!.values.value = `working-${item.data.revision}`;
          return item;
        }),
      ),
    );
    const updated = await store.get(first.data.id);
    expect(updated?.data.revision).toBe(20);
    expect(updated?.data.tables[0]?.rows[0]?.original).toEqual({ value: 'source-case-one' });

    if (updated) updated.data.tables[0]!.rows[0]!.values.value = 'mutated-return-value';
    expect(await store.get(first.data.id)).toMatchObject({
      data: { revision: 20, tables: [{ rows: [{ original: { value: 'source-case-one' } }] }] },
    });
    expect(await store.get(second.data.id)).toEqual(secondBefore);
  });

  it('discards a failed transaction draft and continues accepting later transactions', async () => {
    const store = new MemoryStore();
    const first = await makeStored('rollback-case', 'user-one');
    await store.create(first);
    const before = await store.get(first.data.id);

    await expect(
      store.transact(first.data.id, (item) => {
        item.data.revision++;
        item.data.title = 'partially changed';
        item.data.tables[0]!.rows[0]!.values.value = 'uncommitted';
        throw new Error('simulated transaction abort');
      }),
    ).rejects.toThrow('simulated transaction abort');

    expect(await store.get(first.data.id)).toEqual(before);
    const committed = await store.transact(first.data.id, (item) => {
      item.data.revision++;
      return item;
    });
    expect(committed.data.revision).toBe(1);
  });

  it('persists multiple independent resources across FileStore restarts', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'maplewick-store-test-'));
    temporaryDirectories.push(directory);
    const store = await new FileStore(directory).initialize();
    const first = await makeStored('persisted-one', 'owner-one');
    const second = await makeStored('persisted-two', 'owner-two');
    await Promise.all([store.create(first), store.create(second)]);
    await store.transact(first.data.id, (item) => {
      item.data.revision++;
      item.data.tables[0]!.rows[0]!.values.value = 'confirmed edit';
      return item;
    });

    const restarted = await new FileStore(directory).initialize();
    const [restoredFirst, restoredSecond] = await Promise.all([
      restarted.get(first.data.id),
      restarted.get(second.data.id),
    ]);
    expect(restoredFirst).toMatchObject({
      ownerId: 'owner-one',
      data: {
        revision: 1,
        tables: [
          {
            rows: [
              { original: { value: 'source-persisted-one' }, values: { value: 'confirmed edit' } },
            ],
          },
        ],
      },
    });
    expect(restoredSecond).toEqual(second);
  });

  it('migrates a legacy snapshot and retains every independent investigation', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'maplewick-legacy-test-'));
    temporaryDirectories.push(directory);
    const first = await makeStored('legacy-one', 'owner-one');
    const second = await makeStored('legacy-two', 'owner-two');
    const legacyState = {
      imports: {},
      investigations: { [first.data.id]: first, [second.data.id]: second },
    };
    await writeFile(path.join(directory, 'state.json'), JSON.stringify(legacyState), 'utf8');

    const migrated = await new FileStore(directory).initialize();
    const [restoredFirst, restoredSecond] = await Promise.all([
      migrated.get(first.data.id),
      migrated.get(second.data.id),
    ]);
    expect(restoredFirst).toEqual(first);
    expect(restoredSecond).toEqual(second);

    const restarted = await new FileStore(directory).initialize();
    expect(await restarted.get(first.data.id)).toEqual(first);
    expect(await restarted.get(second.data.id)).toEqual(second);
  });

  it('does not publish an in-memory or on-disk change when a resource write fails', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'maplewick-failed-write-test-'));
    temporaryDirectories.push(directory);
    const store = await new FailingPersistFileStore(directory).initialize();
    const record = await makeStored('atomic-case', 'owner');
    await store.create(record);

    store.failNextPersistence = true;
    await expect(
      store.transact(record.data.id, (item) => {
        item.data.revision++;
        item.data.title = 'must not commit';
        return item;
      }),
    ).rejects.toThrow('simulated file persistence failure');

    expect(await store.get(record.data.id)).toEqual(record);
    const restarted = await new FileStore(directory).initialize();
    expect(await restarted.get(record.data.id)).toEqual(record);
  });
});
