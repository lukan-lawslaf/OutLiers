import {
  getFirestore,
  type Firestore,
  type DocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import type { DataTable } from '../shared/contracts.js';
import type { Store, StoredImport, StoredInvestigation } from './store.js';
import { insist } from './errors.js';

type Item = StoredImport | StoredInvestigation;
interface Manifest {
  ownerId: string;
  parts: number;
  tables: { id: string; rowIds: string[] }[];
}
function encode(item: Item): { manifest: Manifest; chunks: string[] } {
  const header = structuredClone(item);
  const tables: Manifest['tables'] = [];
  for (const table of header.data.tables) {
    tables.push({ id: table.id, rowIds: table.rows.map((row) => row.id) });
    table.rows = [];
  }
  const serialized = JSON.stringify(header);
  const chunks: string[] = [];
  // Slice by code points so UTF-8 documents always stay well below 1 MiB.
  let chunk = '';
  let bytes = 0;
  for (const character of serialized) {
    const size = Buffer.byteLength(character);
    if (bytes + size > 180_000) {
      chunks.push(chunk);
      chunk = '';
      bytes = 0;
    }
    chunk += character;
    bytes += size;
  }
  if (chunk) chunks.push(chunk);
  return { manifest: { ownerId: item.ownerId, parts: chunks.length, tables }, chunks };
}
export class FirestoreStore implements Store {
  constructor(private db: Firestore = getFirestore()) {}
  private ref(kind: string, id: string) {
    return this.db.collection(kind).doc(id);
  }
  private async load(
    kind: string,
    id: string,
    transaction?: Transaction,
  ): Promise<Item | undefined> {
    const root = this.ref(kind, id);
    const snapshot = transaction ? await transaction.get(root) : await root.get();
    if (!snapshot.exists) return undefined;
    const manifest = snapshot.data() as Manifest;
    const rows = manifest.tables.flatMap((table) =>
      table.rowIds.map((rowId) => ({ key: `${table.id}_${rowId}`, tableId: table.id, rowId })),
    );
    const refs = [
      ...Array.from({ length: manifest.parts }, (_, index) =>
        root.collection('parts').doc(String(index)),
      ),
      ...rows.flatMap((row) => [
        root.collection('working').doc(row.key),
        root.collection('originals').doc(row.key),
      ]),
    ];
    const snapshots: DocumentSnapshot[] = refs.length
      ? transaction
        ? await transaction.getAll(...refs)
        : await this.db.getAll(...refs)
      : [];
    const header = JSON.parse(
      snapshots
        .slice(0, manifest.parts)
        .map((part) => String(part.data()?.['json'] ?? ''))
        .join(''),
    ) as Item;
    const tables = new Map<string, DataTable>(header.data.tables.map((table) => [table.id, table]));
    rows.forEach((row, index) => {
      const working = snapshots[manifest.parts + index * 2]?.data();
      const original = snapshots[manifest.parts + index * 2 + 1]?.data();
      insist(working && original, 500, 'STORE_INCOMPLETE', 'Stored table is incomplete.');
      tables.get(row.tableId)!.rows.push({
        id: row.rowId,
        values: working['values'],
        excluded: working['excluded'],
        original: original['values'],
      } as DataTable['rows'][number]);
    });
    return header;
  }
  private writes(kind: string, item: Item, before?: Item) {
    const root = this.ref(kind, item.data.id);
    const encoded = encode(item);
    const writes: { ref: ReturnType<FirestoreStore['ref']>; value: Record<string, unknown> }[] = [
      { ref: root, value: encoded.manifest as unknown as Record<string, unknown> },
    ];
    encoded.chunks.forEach((json, index) =>
      writes.push({ ref: root.collection('parts').doc(String(index)), value: { json } }),
    );
    for (const table of item.data.tables)
      for (const row of table.rows) {
        const key = `${table.id}_${row.id}`;
        const old = before?.data.tables
          .find((oldTable) => oldTable.id === table.id)
          ?.rows.find((oldRow) => oldRow.id === row.id);
        if (!old)
          writes.push({
            ref: root.collection('originals').doc(key),
            value: { values: row.original },
          });
        if (
          !old ||
          JSON.stringify([old.values, old.excluded]) !== JSON.stringify([row.values, row.excluded])
        )
          writes.push({
            ref: root.collection('working').doc(key),
            value: { values: row.values, excluded: row.excluded },
          });
      }
    insist(
      Buffer.byteLength(JSON.stringify(encoded.manifest)) < 800_000,
      413,
      'IMPORT_LIMIT',
      'This import contains too many candidate rows.',
    );
    return writes;
  }
  private async publish(kind: string, item: Item): Promise<void> {
    const root = this.ref(kind, item.data.id);
    insist(!(await root.get()).exists, 409, 'ALREADY_EXISTS', 'Resource already exists.');
    const [manifest, ...writes] = this.writes(kind, item);
    insist(manifest, 500, 'INVALID_MANIFEST', 'Unable to prepare the import.');
    let batch = this.db.batch();
    let count = 0;
    let bytes = 0;
    for (const write of writes) {
      const size = Buffer.byteLength(JSON.stringify(write.value));
      if (count >= 350 || bytes + size > 6 * 1024 * 1024) {
        await batch.commit();
        batch = this.db.batch();
        count = 0;
        bytes = 0;
      }
      batch.create(write.ref, write.value);
      count++;
      bytes += size;
    }
    if (count) await batch.commit();
    // The resource becomes visible only after every immutable original and working row is durable.
    await root.create(manifest.value);
  }
  async putImport(item: StoredImport): Promise<void> {
    await this.publish('imports', item);
  }
  async getImport(id: string): Promise<StoredImport | undefined> {
    return (await this.load('imports', id)) as StoredImport | undefined;
  }
  async create(item: StoredInvestigation): Promise<void> {
    await this.publish('investigations', item);
  }
  async get(id: string): Promise<StoredInvestigation | undefined> {
    return this.db.runTransaction(
      async (transaction) =>
        (await this.load('investigations', id, transaction)) as StoredInvestigation | undefined,
    );
  }
  async transact(
    id: string,
    update: (item: StoredInvestigation) => StoredInvestigation,
  ): Promise<StoredInvestigation> {
    return this.db.runTransaction(async (transaction) => {
      const before = (await this.load('investigations', id, transaction)) as
        StoredInvestigation | undefined;
      insist(before, 404, 'NOT_FOUND', 'Investigation not found.');
      const item = update(structuredClone(before));
      const writes = this.writes('investigations', item, before);
      insist(
        Buffer.byteLength(JSON.stringify(writes.map((write) => write.value))) < 8 * 1024 * 1024,
        413,
        'TRANSACTION_LIMIT',
        'This action is too large to save atomically. Select fewer records.',
      );
      for (const write of writes) transaction.set(write.ref, write.value);
      return item;
    });
  }
}
