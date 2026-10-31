import { Router, type Express } from 'express';
import type { Store } from '../store.js';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { LIMITS } from '../../shared/contracts.js';
import { insist } from '../errors.js';
import { createSchema } from '../validation.js';
import { parseUploads } from '../imports.js';
import { demoTables } from '../demos.js';
import { refresh } from '../engine.js';

export function intakeRoutes(store: Store, aiEnabled: boolean): Router {
  const app = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.maxFileBytes, files: LIMITS.maxFiles, fields: 2, parts: 5 } });
  app.post('/api/imports', upload.array('files', LIMITS.maxFiles), async (request, response) => {
    const result = await parseUploads((request.files as Express.Multer.File[] | undefined) ?? []);
    const data = { id: `import_${randomUUID()}`, ...result }; await store.putImport({ ownerId: response.locals['uid'] as string, data }); response.status(201).json(data);
  });
  app.post('/api/demo', async (request, response) => {
    const { name } = z.object({ name: z.enum(['market', 'club']) }).strict().parse(request.body);
    const data = { id: `import_${randomUUID()}`, tables: demoTables(name), warnings: ['Built-in practice records. Choose the identity and relationship columns to begin.'] };
    await store.putImport({ ownerId: response.locals['uid'] as string, data }); response.status(201).json(data);
  });
  app.post('/api/investigations', async (request, response) => {
    const body = createSchema.parse(request.body); const ownerId = response.locals['uid'] as string; const imported = await store.getImport(body.importId);
    insist(imported && imported.ownerId === ownerId, 404, 'NOT_FOUND', 'Import not found.');
    insist(new Set(body.tableIds).size === body.tableIds.length, 400, 'INVALID_TABLES', 'Select distinct tables.');
    const tables = body.tableIds.map(tableId => { const table = imported.data.tables.find(item => item.id === tableId); insist(table, 400, 'INVALID_TABLE', 'Select tables from this import.'); return structuredClone(table); });
    for (const table of tables) insist(table.rows.length <= LIMITS.maxRows && table.columns.length <= LIMITS.maxColumns, 400, 'TABLE_LIMIT', 'Selected tables must fit 500 data rows and 20 columns.');
    const hasColumn = (tableId: string, columnId: string) => tables.some(table => table.id === tableId && table.columns.some(column => column.id === columnId));
    if (body.identity) insist(hasColumn(body.identity.tableId, body.identity.columnId), 400, 'INVALID_IDENTITY', 'Choose an identity column in a selected table.');
    if (body.join) insist(body.join.parentTableId !== body.join.childTableId && hasColumn(body.join.parentTableId, body.join.parentColumnId) && hasColumn(body.join.childTableId, body.join.childColumnId), 400, 'INVALID_JOIN', 'Choose parent and child columns from two different selected tables.');
    const data = refresh({ id: `investigation_${randomUUID()}`, title: body.title ?? 'The Maplewick casefile', revision: 0, tables, ...(body.identity ? { identity: body.identity } : {}), ...(body.join ? { join: body.join } : {}), cases: [], findings: [], history: [], stats: { totalRows: 0, activeRows: 0, changedRows: 0, openCases: 0, resolvedCases: 0, savedFindings: 0 }, aiStatus: aiEnabled ? 'available' : 'disabled' });
    await store.create({ ownerId, data, receipts: {}, pendingFindings: {}, reviewUndos: {} }); response.status(201).json(data);
  });
  return app;
}
