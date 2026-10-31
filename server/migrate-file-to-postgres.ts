import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash } from './engine.js';
import { AppError, insist } from './errors.js';
import { readFileSnapshot } from './file-snapshot.js';
import { PostgresStore } from './postgres-store.js';

export async function migrateFiles(arguments_: string[]): Promise<void> {
  const allowed = new Set(['--source', '--backup', '--apply', '--offline']);
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index++) {
    const argument = arguments_[index]!;
    insist(
      allowed.has(argument) && !values.has(argument),
      400,
      'MIGRATION_ARGUMENT',
      'Use --source <directory> [--backup <directory> --offline --apply].',
    );
    if (argument === '--source' || argument === '--backup') {
      const value = arguments_[++index];
      insist(
        value && !value.startsWith('--'),
        400,
        'MIGRATION_ARGUMENT',
        'A directory argument is missing.',
      );
      values.set(argument, value);
    } else values.set(argument, 'true');
  }
  insist(values.has('--source'), 400, 'MIGRATION_ARGUMENT', 'Specify --source explicitly.');
  const source = path.resolve(values.get('--source')!);
  const snapshot = await readFileSnapshot(source);
  const counts = {
    imports: Object.keys(snapshot.imports).length,
    investigations: Object.keys(snapshot.investigations).length,
  };
  insist(
    counts.imports + counts.investigations > 0,
    400,
    'EMPTY_SOURCE',
    'No saved resources were found.',
  );
  if (!values.has('--apply')) {
    console.log(
      JSON.stringify({
        mode: 'dry-run',
        ...counts,
        databaseConnected: false,
        note: 'Stop all writers, verify a separate backup, and preserve the active session signing key before applying.',
      }),
    );
    return;
  }

  insist(
    values.has('--offline') && values.has('--backup'),
    400,
    'MIGRATION_SAFETY',
    'Apply requires stopped writers (--offline) and a verified --backup directory.',
  );
  const backup = path.resolve(values.get('--backup')!);
  insist(
    (await realpath(backup)) !== (await realpath(source)),
    400,
    'MIGRATION_SAFETY',
    'The backup must be a separate directory.',
  );
  const backedUp = await readFileSnapshot(backup);
  insist(
    hash(snapshot) === hash(backedUp),
    400,
    'BACKUP_MISMATCH',
    'The backup does not exactly match the source.',
  );
  try {
    const key = await readFile(path.join(source, 'session.key'));
    const backupKey = await readFile(path.join(backup, 'session.key'));
    insist(key.equals(backupKey), 400, 'BACKUP_MISMATCH', 'The session key backup does not match.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    // Hosted session/Firebase modes may not have a local session.key.
    const sourceHasKey = await readFile(path.join(source, 'session.key')).then(
      () => true,
      () => false,
    );
    insist(!sourceHasKey, 400, 'BACKUP_MISMATCH', 'The backup is missing the source session key.');
  }
  const connectionString = process.env['DATABASE_URL'];
  insist(
    connectionString,
    400,
    'STORE_CONFIGURATION',
    'DATABASE_URL must identify the intended migration destination.',
  );
  // A second read catches source writes during backup verification before connecting.
  insist(
    hash(await readFileSnapshot(source)) === hash(snapshot),
    409,
    'SOURCE_CHANGED',
    'Source records changed. Stop writers and take a fresh backup.',
  );
  const store = await new PostgresStore(connectionString).initialize();
  try {
    const copied = await store.migrateSnapshot(snapshot);
    console.log(
      JSON.stringify({
        mode: 'applied',
        ...copied,
        verified: true,
        note: 'Source and backup were preserved. Keep the existing session signing identity when changing persistence.',
      }),
    );
  } finally {
    await store.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  migrateFiles(process.argv.slice(2)).catch((error) => {
    // Never print database connection strings, raw driver errors, or uploaded records.
    console.error(
      error instanceof AppError
        ? error.message
        : 'Migration failed. No success was confirmed; preserve the source and inspect the database before retrying.',
    );
    process.exitCode = 1;
  });
}
