import { createHash, randomUUID } from 'node:crypto';
import type {
  Cell,
  DataAction,
  DataRow,
  DataTable,
  Investigation,
  CaseFile,
  Change,
  PreviewResponse,
  QueryRequest,
  QueryResult,
  EvidenceRef,
} from '../shared/contracts.js';
import { insist } from './errors.js';

export const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
};
export const hash = (value: unknown): string =>
  createHash('sha256').update(canonical(value)).digest('hex');
export const active = (table: DataTable): DataRow[] => table.rows.filter((row) => !row.excluded);
export const valueKey = (value: Cell): string => canonical(value);
const aliasKey = (value: Cell): string =>
  String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s._-]+/g, '');
export function tableOf(inv: Investigation, id: string): DataTable {
  const table = inv.tables.find((item) => item.id === id);
  insist(table, 400, 'INVALID_TABLE', 'Choose an existing table.');
  return table;
}
function evidence(
  table: DataTable,
  rows: DataRow[],
  columnIds: string[],
  explanation: string,
): EvidenceRef {
  return { tableId: table.id, rowIds: rows.map((row) => row.id), columnIds, explanation };
}
function appendGroup<T>(groups: Map<string, T[]>, key: string, value: T): void {
  const group = groups.get(key);
  if (group) group.push(value);
  else groups.set(key, [value]);
}
export function duplicateGroups(table: DataTable): DataRow[][] {
  const groups = new Map<string, DataRow[]>();
  for (const row of active(table)) {
    const key = canonical(table.columns.map((column) => row.values[column.id] ?? null));
    appendGroup(groups, key, row);
  }
  return [...groups.values()].filter((rows) => rows.length > 1);
}
export function detectCases(inv: Investigation): CaseFile[] {
  const cases: CaseFile[] = [];
  const previousCases = new Map(inv.cases.map((item) => [item.id, item]));
  const add = (item: Omit<CaseFile, 'id' | 'status' | 'basedOnRevision'>) => {
    const id = `case_${hash({ kind: item.kind, evidence: item.evidence, action: item.action }).slice(0, 20)}`;
    const old = previousCases.get(id);
    cases.push({
      ...item,
      id,
      status: old?.status === 'kept' || old?.status === 'deferred' ? old.status : 'open',
      basedOnRevision: inv.revision,
    });
  };
  for (const table of inv.tables)
    for (const rows of duplicateGroups(table)) {
      add({
        kind: 'duplicate',
        title: `${rows.length} matching records`,
        description: `These active records in ${table.name} match in every column. Keep the first and exclude the extra copies.`,
        evidence: [
          evidence(
            table,
            rows,
            table.columns.map((c) => c.id),
            'Every selected column has the same stored value.',
          ),
        ],
        action: {
          type: 'excludeRows',
          tableId: table.id,
          rowIds: rows.slice(1).map((row) => row.id),
        },
      });
    }
  if (inv.identity) {
    const table = tableOf(inv, inv.identity.tableId);
    const column = inv.identity.columnId;
    const groups = new Map<string, DataRow[]>();
    for (const row of active(table)) {
      const key = aliasKey(row.values[column] ?? null);
      if (key) appendGroup(groups, key, row);
    }
    for (const rows of groups.values()) {
      const variants = [...new Set(rows.map((row) => String(row.values[column] ?? '')))];
      if (variants.length < 2) continue;
      const selected =
        variants.find((value) => value.trim() === value && /[A-Z]/.test(value)) ?? variants[0]!;
      const rowIds = rows.map((row) => row.id);
      add({
        kind: 'alias',
        title: `One identity, ${variants.length} spellings?`,
        description: `Review these similar identity labels before choosing a common spelling. Similar spelling is evidence for review, not proof of identity.`,
        evidence: [
          evidence(
            table,
            rows,
            [column],
            `${variants.length} distinct labels differ only by case, spacing or separators.`,
          ),
        ],
        action: {
          type: 'canonicalizeAliases',
          tableId: table.id,
          columnId: column,
          rowIds,
          value: selected,
        },
        alternatives: variants.map((value) => ({
          type: 'canonicalizeAliases',
          tableId: table.id,
          columnId: column,
          rowIds,
          value,
        })),
      });
    }
  }
  if (inv.join) {
    const join = inv.join;
    const parent = tableOf(inv, join.parentTableId);
    const child = tableOf(inv, join.childTableId);
    const parents = new Map<string, DataRow[]>();
    for (const row of active(parent)) {
      const key = valueKey(row.values[join.parentColumnId] ?? null);
      appendGroup(parents, key, row);
    }
    const targets = [...parents.values()]
      .filter((items) => items.length === 1)
      .map((items) => items[0]!.values[join.parentColumnId] ?? null)
      .filter((value) => value !== null && value !== '');
    const normalizedTargets = new Map<string, Cell[]>();
    for (const target of targets) appendGroup(normalizedTargets, aliasKey(target), target);
    const broken = new Map<string, DataRow[]>();
    for (const row of active(child)) {
      const value = row.values[join.childColumnId] ?? null;
      if (value !== null && value !== '' && parents.get(valueKey(value))?.length === 1) continue;
      appendGroup(broken, valueKey(value), row);
    }
    for (const rows of broken.values()) {
      const current = rows[0]!.values[join.childColumnId] ?? null;
      const suggestions = normalizedTargets.get(aliasKey(current)) ?? [];
      const rowIds = rows.map((row) => row.id);
      const alternatives: DataAction[] = (
        suggestions.length ? suggestions : targets.slice(0, 20)
      ).map((value) => ({
        type: 'repairLinks',
        tableId: child.id,
        columnId: join.childColumnId,
        rowIds,
        value,
      }));
      add({
        kind: 'relationship',
        title: 'A reference needs a destination',
        description: `These child records have a missing or ambiguous parent reference. Choose a verified destination or keep/defer the case.`,
        evidence: [
          evidence(
            child,
            rows,
            [join.childColumnId],
            `The stored reference has no unique active match in ${parent.name}.`,
          ),
        ],
        ...(suggestions.length === 1 ? { action: alternatives[0] } : {}),
        alternatives,
      });
    }
  }
  const remaining = new Set(cases.map((item) => item.id));
  for (const old of inv.cases)
    if (!remaining.has(old.id))
      cases.push({ ...old, status: 'resolved', basedOnRevision: inv.revision });
  return cases;
}
export function refresh(inv: Investigation): Investigation {
  inv.cases = detectCases(inv);
  const stats = {
    totalRows: 0,
    activeRows: 0,
    changedRows: 0,
    openCases: 0,
    resolvedCases: 0,
    savedFindings: inv.findings.length,
  };
  for (const table of inv.tables)
    for (const row of table.rows) {
      stats.totalRows++;
      if (!row.excluded) stats.activeRows++;
      const keys = Object.keys(row.original);
      if (
        row.excluded ||
        keys.length !== Object.keys(row.values).length ||
        keys.some((key) => row.original[key] !== row.values[key])
      )
        stats.changedRows++;
    }
  for (const item of inv.cases) {
    if (item.status === 'open') stats.openCases++;
    if (item.status === 'resolved' || item.status === 'kept') stats.resolvedCases++;
  }
  inv.stats = stats;
  return inv;
}
export function preview(inv: Investigation, action: DataAction): PreviewResponse {
  const changes: Change[] = [];
  if (action.type === 'reviewCase') {
    insist(
      inv.cases.some((item) => item.id === action.caseId && item.status !== 'resolved'),
      400,
      'INVALID_CASE',
      'Choose an unresolved case.',
    );
  } else {
    const table = tableOf(inv, action.tableId);
    insist(
      action.rowIds.length > 0 && new Set(action.rowIds).size === action.rowIds.length,
      400,
      'INVALID_ROWS',
      'Choose at least one unique row.',
    );
    const rowsById = new Map(table.rows.map((row) => [row.id, row]));
    const rows = action.rowIds.map((id) => {
      const row = rowsById.get(id);
      insist(
        row && !row.excluded,
        400,
        'INVALID_ROWS',
        'Every selected row must exist and be active.',
      );
      return row;
    });
    if (action.type === 'excludeRows')
      for (const row of rows)
        changes.push({
          tableId: table.id,
          rowId: row.id,
          kind: 'excluded',
          before: row.excluded,
          after: true,
        });
    else {
      insist(
        table.columns.some((column) => column.id === action.columnId),
        400,
        'INVALID_COLUMN',
        'Choose an existing column.',
      );
      if (action.type === 'canonicalizeAliases')
        insist(
          inv.identity?.tableId === table.id && inv.identity.columnId === action.columnId,
          400,
          'INVALID_IDENTITY',
          'Alias repairs must use the confirmed identity column.',
        );
      if (action.type === 'repairLinks') {
        insist(
          inv.join?.childTableId === table.id && inv.join.childColumnId === action.columnId,
          400,
          'INVALID_JOIN',
          'Link repairs must use the confirmed child column.',
        );
        const parent = tableOf(inv, inv.join.parentTableId);
        insist(
          action.value !== null &&
            action.value !== '' &&
            active(parent).filter(
              (row) =>
                valueKey(row.values[inv.join!.parentColumnId] ?? null) === valueKey(action.value),
            ).length === 1,
          400,
          'INVALID_TARGET',
          'Choose an existing, unambiguous active parent key.',
        );
      }
      for (const row of rows) {
        const before = row.values[action.columnId] ?? null;
        if (valueKey(before) !== valueKey(action.value))
          changes.push({
            tableId: table.id,
            rowId: row.id,
            columnId: action.columnId,
            kind: 'cell',
            before,
            after: action.value,
          });
      }
      insist(changes.length > 0, 400, 'NO_CHANGES', 'This action would not change any records.');
    }
  }
  return {
    revision: inv.revision,
    action,
    effectHash: hash({ revision: inv.revision, action, changes }),
    changes,
    summary:
      action.type === 'reviewCase'
        ? `Mark this case ${action.outcome === 'keep' ? 'kept' : 'deferred'}.`
        : `${changes.length} confirmed record change${changes.length === 1 ? '' : 's'}.`,
    warnings: [],
  };
}
export function applyChanges(inv: Investigation, changes: Change[], inverse = false): void {
  const rowsByTable = new Map<string, Map<string, DataRow>>();
  for (const change of changes) {
    let rows = rowsByTable.get(change.tableId);
    if (!rows) {
      rows = new Map(tableOf(inv, change.tableId).rows.map((row) => [row.id, row]));
      rowsByTable.set(change.tableId, rows);
    }
    const row = rows.get(change.rowId);
    insist(row, 409, 'INVALID_HISTORY', 'The saved history no longer matches this table.');
    const value = inverse ? change.before : change.after;
    if (change.kind === 'excluded') row.excluded = value === true;
    else row.values[change.columnId!] = value;
  }
}
export function runQuery(inv: Investigation, request: QueryRequest): QueryResult {
  const table = request.tableId ? tableOf(inv, request.tableId) : inv.tables[0]!;
  const columnId =
    request.columnId ??
    (inv.identity?.tableId === table.id ? inv.identity.columnId : table.columns[0]!.id);
  insist(
    table.columns.some((column) => column.id === columnId),
    400,
    'INVALID_COLUMN',
    'Choose an existing column.',
  );
  const operation = request.operation;
  insist(
    operation,
    422,
    'UNSUPPORTED_QUERY',
    'Choose profile, group count, find duplicates, or trace links.',
  );
  let answer = '';
  let refs: EvidenceRef[] = [];
  let groups: { label: string; count: number }[] | undefined;
  if (operation === 'profile') {
    const rows = active(table);
    const blanks = rows.filter(
      (row) => row.values[columnId] === null || row.values[columnId] === '',
    );
    answer = `${table.name} has ${rows.length} active records and ${table.columns.length} columns. ${blanks.length} active records have a blank value in ${table.columns.find((column) => column.id === columnId)!.name}.`;
    refs = [
      evidence(
        table,
        blanks.length ? blanks : rows,
        [columnId],
        'Computed directly from active records.',
      ),
    ];
  } else if (operation === 'group_count') {
    const rows = active(table);
    const map = new Map<string, { label: string; count: number }>();
    for (const row of rows) {
      const value = row.values[columnId] ?? null;
      const key = valueKey(value);
      const entry = map.get(key) ?? { label: value === null ? '(blank)' : String(value), count: 0 };
      entry.count++;
      map.set(key, entry);
    }
    groups = [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    answer = `${groups.length} groups across ${rows.length} active records.`;
    refs = [
      evidence(
        table,
        rows,
        [columnId],
        'Groups use exact stored values; excluded records are omitted.',
      ),
    ];
  } else if (operation === 'find_duplicates') {
    const duplicates = duplicateGroups(table);
    answer = `${duplicates.length} exact duplicate group${duplicates.length === 1 ? '' : 's'}; ${duplicates.reduce((sum, rows) => sum + rows.length - 1, 0)} extra active copies.`;
    refs = duplicates.map((rows) =>
      evidence(
        table,
        rows,
        table.columns.map((column) => column.id),
        'All stored column values match.',
      ),
    );
  } else {
    insist(
      inv.join,
      422,
      'MAPPING_REQUIRED',
      'Confirm parent and child join columns before tracing links.',
    );
    const cases = detectCases(inv).filter(
      (item) => item.kind === 'relationship' && item.status !== 'resolved',
    );
    refs = cases.flatMap((item) => item.evidence);
    answer = `${cases.length} reference group${cases.length === 1 ? '' : 's'} need review in the confirmed relationship.`;
  }
  const finding = {
    id: `finding_${randomUUID()}`,
    title: operation.replaceAll('_', ' '),
    description: answer,
    evidence: refs,
    createdAt: new Date().toISOString(),
  };
  return { answer, evidence: refs, ...(groups ? { groups } : {}), finding, aiStatus: inv.aiStatus };
}
