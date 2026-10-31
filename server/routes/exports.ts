import { Router, type Express } from 'express';
import type { Store } from '../store.js';
import { z } from 'zod';
import { owned } from '../access.js';
import { id } from '../validation.js';
import { exportCsv, exportXlsx } from '../exports.js';

export function exportsRoutes(store: Store): Router {
  const app = Router();
  app.get('/api/investigations/:id/export', async (request, response) => {
    const item = owned(await store.get(request.params['id']!), response.locals['uid'] as string); const format = z.enum(['csv', 'xlsx', 'report']).parse(request.query['format'] ?? 'report');
    response.setHeader('Cache-Control', 'no-store');
    if (format === 'csv') { const tableId = id.parse(request.query['tableId'] ?? item.data.tables[0]!.id); response.attachment('clean-records.csv').type('text/csv').send(exportCsv(item.data, tableId)); }
    else if (format === 'xlsx') response.attachment('maplewick-casefile.xlsx').type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(await exportXlsx(item.data));
    else response.attachment('maplewick-report.json').type('application/json').send(JSON.stringify({ ...item.data, exportedAt: new Date().toISOString(), policy: 'Excluded rows omitted from clean CSV/XLSX. Original records remain immutable in this report.' }, null, 2));
  });
  return app;
}
