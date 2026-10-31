import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { insist } from './errors.js';
import type { StoredImport, StoredInvestigation } from './store.js';

export interface FileSnapshot {
  imports: Record<string, StoredImport>;
  investigations: Record<string, StoredInvestigation>;
}

function resource(value: unknown): StoredImport | StoredInvestigation {
  insist(
    value && typeof value === 'object',
    400,
    'INVALID_BACKUP',
    'The source contains an invalid resource.',
  );
  const item = value as StoredInvestigation;
  insist(
    typeof item.ownerId === 'string' &&
      item.ownerId.length > 0 &&
      typeof item.data?.id === 'string' &&
      /^[a-zA-Z0-9_-]{1,128}$/.test(item.data.id) &&
      Array.isArray(item.data.tables),
    400,
    'INVALID_BACKUP',
    'Resource identity, ownership or tables are invalid.',
  );
  for (const table of item.data.tables)
    for (const row of table.rows) {
      insist(
        row.original &&
          row.values &&
          typeof row.original === 'object' &&
          typeof row.values === 'object',
        400,
        'INVALID_BACKUP',
        'A source row is missing its immutable original or working values.',
      );
    }
  return item;
}

/** Reads legacy and current file layouts without migrating or modifying the source. */
export async function readFileSnapshot(directory: string): Promise<FileSnapshot> {
  const snapshot: FileSnapshot = {
    imports: Object.create(null),
    investigations: Object.create(null),
  };
  try {
    const legacy = JSON.parse(
      await readFile(path.join(directory, 'state.json'), 'utf8'),
    ) as FileSnapshot;
    for (const kind of ['imports', 'investigations'] as const)
      for (const [id, value] of Object.entries(legacy[kind])) {
        const item = resource(value);
        insist(
          item.data.id === id,
          400,
          'INVALID_BACKUP',
          'A legacy resource ID does not match its saved key.',
        );
        if (kind === 'imports') snapshot.imports[id] = item as StoredImport;
        else snapshot.investigations[id] = item as StoredInvestigation;
      }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  for (const kind of ['imports', 'investigations'] as const) {
    let names: string[];
    try {
      names = await readdir(path.join(directory, kind));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    for (const name of names) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const item = resource(JSON.parse(await readFile(path.join(directory, kind, name), 'utf8')));
      const expected = `${createHash('sha256').update(item.data.id).digest('hex')}.json`;
      insist(
        name === expected,
        400,
        'INVALID_BACKUP',
        'A resource filename does not match its saved ID.',
      );
      if (kind === 'imports') snapshot.imports[item.data.id] = item as StoredImport;
      else snapshot.investigations[item.data.id] = item as StoredInvestigation;
    }
  }
  return snapshot;
}
