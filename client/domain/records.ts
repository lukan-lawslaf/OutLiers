import { LIMITS, type Cell, type DataTable, type HistoryEntry } from '../../shared/contracts';

export function validateUpload(files: Pick<File, 'name' | 'size'>[]): string | null {
  if (files.length > LIMITS.maxFiles) return 'Choose at most two CSV or Excel files.';
  if (files.some((file) => !/\.(csv|xlsx)$/i.test(file.name))) {
    return 'The agency accepts .csv and .xlsx files.';
  }
  if (files.some((file) => file.size > LIMITS.maxFileBytes)) {
    return 'Each file must be 2 MB or smaller.';
  }
  return null;
}

export function latestUndoableAction(history: HistoryEntry[]): HistoryEntry | undefined {
  for (let index = history.length - 1; index >= 0; index--) {
    const entry = history[index];
    if (entry?.kind === 'resolve' && !entry.undone) return entry;
  }
  return undefined;
}

/** A repair can only point to a nonblank key occurring once among active parents. */
export function unambiguousParentValues(table: DataTable | undefined, columnId: string | undefined): Cell[] {
  if (!table || !columnId) return [];
  const counts = new Map<string, { value: Cell; count: number }>();
  for (const row of table.rows) {
    const value = row.values[columnId];
    if (row.excluded || value === undefined || value === null || value === '') continue;
    const key = JSON.stringify(value);
    const existing = counts.get(key);
    if (existing) existing.count++;
    else counts.set(key, { value, count: 1 });
  }
  return [...counts.values()].filter((entry) => entry.count === 1).map((entry) => entry.value);
}
