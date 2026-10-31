import { performance } from 'node:perf_hooks';
import type { Cell, DataRow, DataTable, Investigation } from '../../shared/contracts.js';
import { detectCases, duplicateGroups, runQuery } from '../../server/engine.js';
import { MemoryStore, type StoredInvestigation } from '../../server/store.js';

function row(id: string, values: Record<string, Cell>): DataRow {
  return { id, original: { ...values }, values: { ...values }, excluded: false };
}

function table(id: string, name: string, columns: DataTable['columns'], rows: DataRow[]): DataTable {
  return { id, name, columns, rows };
}

function investigation(tables: DataTable[], id = 'baseline'): Investigation {
  return {
    id,
    title: 'Performance baseline',
    revision: 0,
    tables,
    cases: [],
    findings: [],
    history: [],
    stats: { totalRows: 0, activeRows: 0, changedRows: 0, openCases: 0, resolvedCases: 0, savedFindings: 0 },
    aiStatus: 'disabled',
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function measureSync(operation: () => unknown, iterations = 9): number {
  operation();
  const samples: number[] = [];
  for (let index = 0; index < iterations; index++) {
    const started = performance.now();
    operation();
    samples.push(performance.now() - started);
  }
  return median(samples);
}

function measureAsync(operation: () => Promise<unknown>): Promise<number> {
  const started = performance.now();
  return operation().then(() => performance.now() - started);
}

const aliasColumns: DataTable['columns'] = [
  { id: 'person_id', name: 'Person ID', kind: 'text' },
  { id: 'name', name: 'Name', kind: 'text' },
  { id: 'group', name: 'Group', kind: 'text' },
];
const aliasTable = table('aliases', 'Aliases', aliasColumns, Array.from({ length: 500 }, (_, index) => row(`a${index}`, {
  person_id: `P${String(index).padStart(4, '0')}`,
  name: index % 2 ? 'moss_reed' : 'Moss Reed',
  group: `group-${index % 10}`,
})));
const duplicateColumns: DataTable['columns'] = [
  { id: 'code', name: 'Code', kind: 'text' },
  { id: 'kind', name: 'Kind', kind: 'text' },
];
const duplicateTable = table('duplicates', 'Duplicates', duplicateColumns, Array.from({ length: 500 }, (_, index) => row(`d${index}`, { code: 'DUP', kind: 'same' })));
const fixture = investigation([aliasTable, duplicateTable]);
fixture.identity = { tableId: aliasTable.id, columnId: 'name' };

const storeFixture = (id: number): StoredInvestigation => ({
  ownerId: `owner-${id}`,
  data: investigation([table(`table-${id}`, `Table ${id}`, [{ id: 'value', name: 'Value', kind: 'text' }], Array.from({ length: 5 }, (_, index) => row(`r${index}`, { value: `v${index}` })))], `investigation-${id}`),
  receipts: {},
  pendingFindings: {},
  reviewUndos: {},
});

async function measureStore(remembered = 200) {
  const store = new MemoryStore();
  const entries = Array.from({ length: remembered }, (_, index) => storeFixture(index));
  const createMs = await measureAsync(async () => {
    for (const entry of entries) await store.create(entry);
  });
  const readStarted = performance.now();
  await Promise.all(entries.map((entry) => store.get(entry.data.id)));
  const readManyMs = performance.now() - readStarted;
  const transactionStarted = performance.now();
  await Promise.all(entries.map((entry) => store.transact(entry.data.id, (stored) => {
    stored.data.revision++;
    return stored;
  })));
  const transactManyMs = performance.now() - transactionStarted;
  return { independentInvestigations: remembered, createAllMs: createMs, parallelGetAllMs: readManyMs, parallelTransactAllMs: transactManyMs };
}

async function main() {
  const duplicateGroupsMs = measureSync(() => duplicateGroups(duplicateTable));
  const detectCasesMs = measureSync(() => detectCases(fixture));
  const groupCountMs = measureSync(() => runQuery(fixture, { mode: 'discovery', operation: 'group_count', tableId: aliasTable.id, columnId: 'group' }));
  const store = await measureStore();
  console.log(JSON.stringify({
    node: process.version,
    fixtures: { aliasRows: aliasTable.rows.length, exactDuplicateRows: duplicateTable.rows.length, uniqueInvestigations: store.independentInvestigations },
    medianEngineMs: { duplicateGroupsOne500RowGroup: duplicateGroupsMs, detectCasesBothTables: detectCasesMs, groupCount500Rows: groupCountMs },
    memoryStoreMs: { createAll200: store.createAllMs, parallelGetAll200: store.parallelGetAllMs, parallelTransactAll200: store.parallelTransactAllMs },
    note: 'Informational baseline only; durations are reported but do not gate correctness tests.',
  }, null, 2));
}

void main();
