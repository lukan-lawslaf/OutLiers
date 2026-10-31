# Offline file-to-PostgreSQL migration

Changing `PERSISTENCE_MODE` does not transfer existing records. This tool is an explicit operator action; it is never run at startup. It copies imports and complete investigation snapshots, including owner IDs, original/working values, revisions, cases, findings, history, undo metadata and idempotency receipts.

1. Stop every process that can write the source or destination. `--offline` acknowledges this operational requirement; the tool cannot stop remote writers.
2. Take a private, separate backup of the entire data directory, including `session.key` when present. Keep the original directory and backup after migration.
3. Inspect counts without connecting to a database:

   ```sh
   pnpm exec tsx server/migrate-file-to-postgres.ts --source /absolute/source-directory
   ```

4. Set `DATABASE_URL` in the operator environment to the intended destination. Do not put credentials in command arguments, logs, or source control. Then run:

   ```sh
   pnpm exec tsx server/migrate-file-to-postgres.ts --source /absolute/source-directory --backup /absolute/backup-directory --offline --apply
   ```

The tool requires the backup contents to match, rejects destination ID collisions, copies and verifies content hashes/counts inside one PostgreSQL transaction, and rolls back on conflict or verification failure. It never modifies the source or permanently deletes records. Existing unrelated destination records remain untouched. A lost connection during `COMMIT` can make the outcome uncertain: inspect destination counts before retrying; collisions prevent accidental overwrites.

5. Preserve the active authentication identity when switching persistence. Keep the same `SESSION_SECRET` for hosted sessions or the same Firebase project. To preserve a binary local `session.key`, configure `SESSION_SECRET=base64:<base64 of that existing key>` securely; do not generate a replacement key. A new signing key makes existing anonymous browser cookies unrecognizable, even though their owned records remain saved.
6. After verification, set `PERSISTENCE_MODE=postgres`, restart with the intended `DATABASE_URL`, and verify an existing session can open its casefile. Keep the file backup for rollback. Do not resume writes to both stores: later changes will diverge.

No live PostgreSQL connection is required for the default dry run. Never apply against production until the offline maintenance and backup steps have been completed.
