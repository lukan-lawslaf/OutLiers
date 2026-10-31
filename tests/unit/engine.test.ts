import { describe, expect, it } from 'vitest';
import type { Cell, DataRow, DataTable, Investigation } from '../../shared/contracts.js';
import { detectCases, duplicateGroups, preview, runQuery } from '../../server/engine.js';

function makeRow(id: string, values: Record<string, Cell>, excluded = false): DataRow {
  return { id, original: { ...values }, values: { ...values }, excluded };
}

function makeTable(
  id: string,
  name: string,
  columns: DataTable['columns'],
  rows: DataRow[],
): DataTable {
  return { id, name, columns, rows };
}

function makeInvestigation(
  tables: DataTable[],
  extras: Partial<Investigation> = {},
): Investigation {
  const rows = tables.flatMap((table) => table.rows);
  return {
    id: 'inv_unit',
    title: 'Unit fixture',
    revision: 4,
    tables,
    cases: [],
    findings: [],
    history: [],
    stats: {
      totalRows: rows.length,
      activeRows: rows.filter((row) => !row.excluded).length,
      changedRows: 0,
      openCases: 0,
      resolvedCases: 0,
      savedFindings: 0,
    },
    aiStatus: 'disabled',
    ...extras,
  };
}

function expectAppError(operation: () => unknown, status: number, code: string) {
  try {
    operation();
  } catch (error) {
    expect(error).toMatchObject({ status, code });
    return;
  }
  expect.fail(`Expected ${code} (${status})`);
}

const peopleColumns: DataTable['columns'] = [
  { id: 'person_id', name: 'Person ID', kind: 'text' },
  { id: 'name', name: 'Name', kind: 'text' },
  { id: 'team', name: 'Team', kind: 'text' },
];

describe('active-row policy', () => {
  it('excludes previously excluded rows from duplicate groups and query results', () => {
    const table = makeTable('people', 'People', peopleColumns, [
      makeRow('p1', { person_id: '1', name: 'Ada Lovelace', team: 'blue' }),
      makeRow('p2', { person_id: '1', name: 'Ada Lovelace', team: 'blue' }),
      makeRow('p3', { person_id: '2', name: 'Grace Hopper', team: 'green' }),
      makeRow('p4', { person_id: '1', name: 'Ada Lovelace', team: 'blue' }, true),
    ]);
    const investigation = makeInvestigation([table]);

    expect(duplicateGroups(table).map((group) => group.map((row) => row.id))).toEqual([
      ['p1', 'p2'],
    ]);

    const duplicateResult = runQuery(investigation, {
      mode: 'discovery',
      operation: 'find_duplicates',
      tableId: table.id,
    });
    expect(duplicateResult.answer).toContain('1 exact duplicate group');
    expect(duplicateResult.evidence.flatMap((ref) => ref.rowIds)).toEqual(['p1', 'p2']);

    const grouped = runQuery(investigation, {
      mode: 'discovery',
      operation: 'group_count',
      tableId: table.id,
      columnId: 'name',
    });
    expect(grouped.groups).toEqual([
      { label: 'Ada Lovelace', count: 2 },
      { label: 'Grace Hopper', count: 1 },
    ]);
    expect(grouped.evidence[0]?.rowIds).not.toContain('p4');
  });

  it('retains one 500-row alias group and one 500-row exact duplicate group', () => {
    const aliases = makeTable(
      'aliases',
      'Aliases',
      peopleColumns,
      Array.from({ length: 500 }, (_, index) =>
        makeRow(`a${index}`, {
          person_id: `P${String(index).padStart(4, '0')}`,
          name: index % 2 ? 'moss_reed' : 'Moss Reed',
          team: `team-${index % 10}`,
        }),
      ),
    );
    const duplicates = makeTable(
      'copies',
      'Copies',
      [
        { id: 'code', name: 'Code', kind: 'text' },
        { id: 'kind', name: 'Kind', kind: 'text' },
      ],
      Array.from({ length: 500 }, (_, index) =>
        makeRow(`d${index}`, { code: 'DUP', kind: 'same' }),
      ),
    );
    const investigation = makeInvestigation([aliases, duplicates], {
      identity: { tableId: aliases.id, columnId: 'name' },
    });

    expect(duplicateGroups(duplicates)).toHaveLength(1);
    expect(duplicateGroups(duplicates)[0]).toHaveLength(500);
    const cases = detectCases(investigation);
    const aliasCase = cases.find((item) => item.kind === 'alias');
    const duplicateCase = cases.find((item) => item.kind === 'duplicate');
    expect(aliasCase?.evidence[0]?.rowIds).toHaveLength(500);
    expect(aliasCase?.action?.type).toBe('canonicalizeAliases');
    if (aliasCase?.action?.type === 'canonicalizeAliases')
      expect(aliasCase.action.rowIds).toHaveLength(500);
    expect(duplicateCase?.evidence[0]?.rowIds).toHaveLength(500);
    expect(duplicateCase?.action).toMatchObject({
      type: 'excludeRows',
      rowIds: expect.arrayContaining(['d1', 'd499']),
    });
    if (duplicateCase?.action?.type === 'excludeRows')
      expect(duplicateCase.action.rowIds).toHaveLength(499);
  });
});

describe('preview validation', () => {
  it('computes a deterministic preview without mutating source or working rows', () => {
    const table = makeTable('people', 'People', peopleColumns, [
      makeRow('p1', { person_id: '1', name: 'Ada Lovelace', team: 'blue' }),
      makeRow('p2', { person_id: '2', name: 'ada_lovelace', team: 'blue' }),
    ]);
    const investigation = makeInvestigation([table], {
      identity: { tableId: 'people', columnId: 'name' },
    });
    const before = structuredClone(investigation);
    const action = {
      type: 'canonicalizeAliases' as const,
      tableId: 'people',
      columnId: 'name',
      rowIds: ['p1', 'p2'],
      value: 'Ada Lovelace',
    };

    const first = preview(investigation, action);
    const second = preview(investigation, action);

    expect(first).toEqual(second);
    expect(first.revision).toBe(investigation.revision);
    expect(first.changes).toEqual([
      {
        tableId: 'people',
        rowId: 'p2',
        columnId: 'name',
        kind: 'cell',
        before: 'ada_lovelace',
        after: 'Ada Lovelace',
      },
    ]);
    expect(investigation).toEqual(before);
  });

  it('rejects aliases outside the explicitly confirmed identity column', () => {
    const table = makeTable('people', 'People', peopleColumns, [
      makeRow('p1', { person_id: '1', name: 'Ada Lovelace', team: 'blue' }),
      makeRow('p2', { person_id: '2', name: 'ada_lovelace', team: 'blue' }),
    ]);
    const investigation = makeInvestigation([table], {
      identity: { tableId: 'people', columnId: 'name' },
    });

    expectAppError(
      () =>
        preview(investigation, {
          type: 'canonicalizeAliases',
          tableId: 'people',
          columnId: 'team',
          rowIds: ['p1'],
          value: 'green',
        }),
      400,
      'INVALID_IDENTITY',
    );
  });

  it('requires a unique active parent for link repairs and accepts a target whose duplicate is excluded', () => {
    const parent = makeTable(
      'parents',
      'Parents',
      [{ id: 'code', name: 'Code', kind: 'text' }],
      [
        makeRow('parent-1', { code: 'K1' }),
        makeRow('parent-2', { code: 'K2' }),
        makeRow('parent-2-copy', { code: 'K2' }, true),
        makeRow('parent-3', { code: 'K3' }),
        makeRow('parent-3-copy', { code: 'K3' }),
      ],
    );
    const child = makeTable(
      'children',
      'Children',
      [{ id: 'parent_code', name: 'Parent code', kind: 'text' }],
      [makeRow('child-1', { parent_code: 'BROKEN' })],
    );
    const investigation = makeInvestigation([parent, child], {
      join: {
        parentTableId: 'parents',
        parentColumnId: 'code',
        childTableId: 'children',
        childColumnId: 'parent_code',
      },
    });

    const valid = preview(investigation, {
      type: 'repairLinks',
      tableId: 'children',
      columnId: 'parent_code',
      rowIds: ['child-1'],
      value: 'K2',
    });
    expect(valid.changes).toHaveLength(1);
    expect(valid.changes[0]?.after).toBe('K2');

    expectAppError(
      () =>
        preview(investigation, {
          type: 'repairLinks',
          tableId: 'children',
          columnId: 'parent_code',
          rowIds: ['child-1'],
          value: 'K3',
        }),
      400,
      'INVALID_TARGET',
    );
    expectAppError(
      () =>
        preview(investigation, {
          type: 'repairLinks',
          tableId: 'children',
          columnId: 'parent_code',
          rowIds: ['child-1'],
          value: 'UNKNOWN',
        }),
      400,
      'INVALID_TARGET',
    );
  });

  it('rejects absent query operations as unsupported instead of fabricating an answer', () => {
    const table = makeTable('people', 'People', peopleColumns, [
      makeRow('p1', { person_id: '1', name: 'Ada Lovelace', team: 'blue' }),
    ]);
    const investigation = makeInvestigation([table]);
    expectAppError(
      () => runQuery(investigation, { mode: 'open', prompt: 'show me a made-up operation' }),
      422,
      'UNSUPPORTED_QUERY',
    );
  });
});
