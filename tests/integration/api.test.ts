import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Request } from 'express';
import { parse as parseCsv } from 'csv-parse/sync';
import type {
  CaseFile,
  Change,
  ImportResult,
  Investigation,
  PreviewResponse,
  QueryResult,
  ResolveResponse,
} from '../../shared/contracts.js';
import { createApp } from '../../server/app.js';
import { MemoryStore, type StoredInvestigation } from '../../server/store.js';

class FailAfterUpdateStore extends MemoryStore {
  failNextCommit = false;

  override async transact(
    id: string,
    update: (item: StoredInvestigation) => StoredInvestigation,
  ): Promise<StoredInvestigation> {
    if (!this.failNextCommit) return super.transact(id, update);
    this.failNextCommit = false;
    const draft = await this.get(id);
    if (!draft) throw new Error('Investigation not found.');
    update(draft);
    throw new Error('Simulated durable commit failure.');
  }
}

type TestApp = Awaited<ReturnType<typeof createApp>>;

const userHeader = 'x-test-user';
const temporaryDirectories: string[] = [];

function sessionCookie(response: request.Response): string | undefined {
  const setCookie = response.headers['set-cookie'];
  const value = Array.isArray(setCookie)
    ? setCookie.find((cookie) => cookie.startsWith('dd_session='))
    : setCookie?.startsWith('dd_session=')
      ? setCookie
      : undefined;
  return value?.split(';')[0];
}

function expectSuccess(status: number) {
  expect(status, `expected 2xx response, got ${status}`).toBeGreaterThanOrEqual(200);
  expect(status, `expected 2xx response, got ${status}`).toBeLessThan(300);
}

function expectClientError(status: number) {
  expect(status, `expected client error, got ${status}`).toBeGreaterThanOrEqual(400);
  expect(status, `expected client error, got ${status}`).toBeLessThan(500);
}

async function makeInvestigation(app: TestApp, user = 'alice', name: 'market' | 'club' = 'market') {
  const importResponse = await request(app).post('/api/demo').set(userHeader, user).send({ name });
  expectSuccess(importResponse.status);

  const imported = importResponse.body as ImportResult;
  expect(imported.id).toBeTruthy();
  expect(imported.tables.length).toBeGreaterThan(0);
  const tableIds = imported.tables.slice(0, 2).map((table) => table.id);

  const createResponse = await request(app)
    .post('/api/investigations')
    .set(userHeader, user)
    .send({ importId: imported.id, tableIds, title: `API test ${name}` });
  expectSuccess(createResponse.status);

  return {
    importId: imported.id,
    investigation: createResponse.body as Investigation,
  };
}

function actionableCase(investigation: Investigation): CaseFile {
  const found = investigation.cases.find(
    (item) => item.action && item.action.type !== 'reviewCase',
  );
  expect(found, 'demo should include at least one repair case').toBeDefined();
  return found!;
}

function rowForChange(investigation: Investigation, change: Change) {
  const table = investigation.tables.find((item) => item.id === change.tableId);
  expect(table, `table ${change.tableId} should exist`).toBeDefined();
  const row = table!.rows.find((item) => item.id === change.rowId);
  expect(row, `row ${change.rowId} should exist`).toBeDefined();
  return row!;
}

describe('investigation API integrity', () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await createApp({
      store: new MemoryStore(),
      auth: async (req: Request) => req.header(userHeader) ?? 'test-user',
      gemini: null,
      serveClient: false,
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('keeps preview read-only, requires its exact effect hash, and applies a retry once', async () => {
    const { investigation: initial } = await makeInvestigation(app);
    const repairCase = actionableCase(initial);
    const action = repairCase.action!;

    const previewResponse = await request(app)
      .post(`/api/investigations/${initial.id}/preview`)
      .set(userHeader, 'alice')
      .send({ expectedRevision: initial.revision, action });
    expectSuccess(previewResponse.status);
    const preview = previewResponse.body as PreviewResponse;
    expect(preview.revision).toBe(initial.revision);
    expect(preview.effectHash).toBeTruthy();
    expect(preview.changes.length).toBeGreaterThan(0);

    const afterPreview = await request(app)
      .get(`/api/investigations/${initial.id}`)
      .set(userHeader, 'alice');
    expectSuccess(afterPreview.status);
    expect(afterPreview.body).toEqual(initial);

    const resolveBody = {
      expectedRevision: initial.revision,
      action,
      actionId: 'test-resolve-001',
      effectHash: preview.effectHash,
      caseId: repairCase.id,
    };
    const [resolvedResponse, parallelRetryResponse] = await Promise.all([
      request(app)
        .post(`/api/investigations/${initial.id}/resolve`)
        .set(userHeader, 'alice')
        .send(resolveBody),
      request(app)
        .post(`/api/investigations/${initial.id}/resolve`)
        .set(userHeader, 'alice')
        .send(resolveBody),
    ]);
    expectSuccess(resolvedResponse.status);
    expectSuccess(parallelRetryResponse.status);
    const resolved = resolvedResponse.body as ResolveResponse;
    expect(resolved.actionId).toBe(resolveBody.actionId);
    expect(resolved.investigation.revision).toBe(initial.revision + 1);
    const parallelRetry = parallelRetryResponse.body as ResolveResponse;
    expect(parallelRetry.investigation.revision).toBe(resolved.investigation.revision);
    expect(parallelRetry.investigation.history).toHaveLength(resolved.investigation.history.length);

    for (const change of preview.changes) {
      const originalRow = rowForChange(initial, change);
      const committedRow = rowForChange(resolved.investigation, change);
      expect(committedRow.original).toEqual(originalRow.original);
    }

    const conflictingRetry = await request(app)
      .post(`/api/investigations/${initial.id}/resolve`)
      .set(userHeader, 'alice')
      .send({ ...resolveBody, effectHash: 'a'.repeat(64) });
    expectClientError(conflictingRetry.status);

    const unchanged = await request(app)
      .get(`/api/investigations/${initial.id}`)
      .set(userHeader, 'alice');
    expectSuccess(unchanged.status);
    expect(unchanged.body).toEqual(resolved.investigation);
  });

  it('rejects a changed effect hash and stale revision without changing saved state', async () => {
    const { investigation: initial } = await makeInvestigation(app);
    const repairCase = actionableCase(initial);
    const action = repairCase.action!;
    const previewResponse = await request(app)
      .post(`/api/investigations/${initial.id}/preview`)
      .set(userHeader, 'alice')
      .send({ expectedRevision: initial.revision, action });
    expectSuccess(previewResponse.status);
    const preview = previewResponse.body as PreviewResponse;

    const badHashResponse = await request(app)
      .post(`/api/investigations/${initial.id}/resolve`)
      .set(userHeader, 'alice')
      .send({
        expectedRevision: initial.revision,
        action,
        actionId: 'test-bad-hash',
        effectHash: `${preview.effectHash}-tampered`,
        caseId: repairCase.id,
      });
    expectClientError(badHashResponse.status);

    const validResolve = await request(app)
      .post(`/api/investigations/${initial.id}/resolve`)
      .set(userHeader, 'alice')
      .send({
        expectedRevision: initial.revision,
        action,
        actionId: 'test-stale-revision',
        effectHash: preview.effectHash,
        caseId: repairCase.id,
      });
    expectSuccess(validResolve.status);
    const committed = validResolve.body as ResolveResponse;

    const staleResponse = await request(app)
      .post(`/api/investigations/${initial.id}/resolve`)
      .set(userHeader, 'alice')
      .send({
        expectedRevision: initial.revision,
        action,
        actionId: 'test-stale-new-action',
        effectHash: preview.effectHash,
        caseId: repairCase.id,
      });
    expectClientError(staleResponse.status);

    const current = await request(app)
      .get(`/api/investigations/${initial.id}`)
      .set(userHeader, 'alice');
    expectSuccess(current.status);
    expect(current.body).toEqual(committed.investigation);
  });

  it('only undoes the latest resolution and restores the prior working values', async () => {
    const { investigation: initial } = await makeInvestigation(app);
    const repairCase = actionableCase(initial);
    const previewResponse = await request(app)
      .post(`/api/investigations/${initial.id}/preview`)
      .set(userHeader, 'alice')
      .send({ expectedRevision: initial.revision, action: repairCase.action });
    expectSuccess(previewResponse.status);
    const preview = previewResponse.body as PreviewResponse;
    const actionId = 'test-undo-resolve';
    const resolveResponse = await request(app)
      .post(`/api/investigations/${initial.id}/resolve`)
      .set(userHeader, 'alice')
      .send({
        expectedRevision: initial.revision,
        action: repairCase.action,
        actionId,
        effectHash: preview.effectHash,
        caseId: repairCase.id,
      });
    expectSuccess(resolveResponse.status);
    const resolved = (resolveResponse.body as ResolveResponse).investigation;

    const wrongLatest = await request(app)
      .post(`/api/investigations/${initial.id}/undo`)
      .set(userHeader, 'alice')
      .send({
        expectedRevision: resolved.revision,
        actionId: 'undo-wrong-latest',
        latestActionId: 'not-latest',
      });
    expectClientError(wrongLatest.status);

    const undoResponse = await request(app)
      .post(`/api/investigations/${initial.id}/undo`)
      .set(userHeader, 'alice')
      .send({
        expectedRevision: resolved.revision,
        actionId: 'test-undo-latest',
        latestActionId: actionId,
      });
    expectSuccess(undoResponse.status);
    const undone = (undoResponse.body as ResolveResponse).investigation;
    expect(undone.revision).toBe(resolved.revision + 1);
    expect(undone.history.some((entry) => entry.kind === 'undo')).toBe(true);
    expect(undone.history.find((entry) => entry.id === actionId)?.undone).toBe(true);

    for (const change of preview.changes) {
      const restoredRow = rowForChange(undone, change);
      if (change.kind === 'excluded') {
        expect(restoredRow.excluded).toBe(change.before);
      } else if (change.columnId) {
        expect(restoredRow.values[change.columnId]).toBe(change.before);
      }
    }

    const workbookResponse = await request(app)
      .get(`/api/investigations/${initial.id}/export`)
      .query({ format: 'xlsx' })
      .set(userHeader, 'alice')
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expectSuccess(workbookResponse.status);
    expect(workbookResponse.headers['content-disposition']).toContain('maplewick-casefile.xlsx');
    const workbook = new ExcelJS.Workbook();
    const workbookBytes = new Uint8Array(workbookResponse.body as Uint8Array);
    const workbookBuffer = new ArrayBuffer(workbookBytes.byteLength);
    new Uint8Array(workbookBuffer).set(workbookBytes);
    await workbook.xlsx.load(workbookBuffer);
    const history = workbook.getWorksheet('Change log');
    expect(history?.getRow(1).values).toEqual([
      undefined,
      'Action ID',
      'Label',
      'Revision',
      'Kind',
      'Undone',
      'Part',
      'Changes JSON',
    ]);
    expect(history?.getRow(2).getCell(1).value).toBe(actionId);
    expect(history?.getRow(2).getCell(5).value).toBe(true);
    expect(history?.getRow(3).getCell(4).value).toBe('undo');
  });

  it('does not expose a user investigation to a different authenticated user', async () => {
    const { importId, investigation } = await makeInvestigation(app, 'owner');
    const repairCase = actionableCase(investigation);
    const ownerPreviewResponse = await request(app)
      .post(`/api/investigations/${investigation.id}/preview`)
      .set(userHeader, 'owner')
      .send({ expectedRevision: investigation.revision, action: repairCase.action });
    expectSuccess(ownerPreviewResponse.status);
    const ownerPreview = ownerPreviewResponse.body as PreviewResponse;

    const readResponse = await request(app)
      .get(`/api/investigations/${investigation.id}`)
      .set(userHeader, 'other-user');
    expectClientError(readResponse.status);

    const previewResponse = await request(app)
      .post(`/api/investigations/${investigation.id}/preview`)
      .set(userHeader, 'other-user')
      .send({
        expectedRevision: investigation.revision,
        action: actionableCase(investigation).action,
      });
    expectClientError(previewResponse.status);

    const resolveResponse = await request(app)
      .post(`/api/investigations/${investigation.id}/resolve`)
      .set(userHeader, 'other-user')
      .send({
        expectedRevision: investigation.revision,
        action: ownerPreview.action,
        actionId: 'foreign-user-action',
        effectHash: ownerPreview.effectHash,
        caseId: repairCase.id,
      });
    expectClientError(resolveResponse.status);

    const exportResponse = await request(app)
      .get(`/api/investigations/${investigation.id}/export`)
      .query({ format: 'report' })
      .set(userHeader, 'other-user');
    expectClientError(exportResponse.status);

    const createFromForeignImport = await request(app)
      .post('/api/investigations')
      .set(userHeader, 'other-user')
      .send({ importId, tableIds: investigation.tables.map((table) => table.id) });
    expectClientError(createFromForeignImport.status);
  });

  it('validates bounded query operations, returns evidence references, and saves only returned findings', async () => {
    const { investigation: initial } = await makeInvestigation(app);
    const table = initial.tables[0]!;

    const queryResponse = await request(app)
      .post(`/api/investigations/${initial.id}/query`)
      .set(userHeader, 'alice')
      .send({ mode: 'discovery', operation: 'find_duplicates', tableId: table.id });
    expectSuccess(queryResponse.status);
    const result = queryResponse.body as QueryResult;
    expect(result.finding?.id).toBeTruthy();
    expect(result.finding?.evidence.length).toBeGreaterThan(0);
    expect(result.aiStatus).toBe('disabled');

    for (const reference of result.evidence) {
      const evidenceTable = initial.tables.find((item) => item.id === reference.tableId);
      expect(evidenceTable).toBeDefined();
      expect(reference.rowIds.length).toBeGreaterThan(0);
      for (const rowId of reference.rowIds) {
        expect(evidenceTable?.rows.some((row) => row.id === rowId && !row.excluded)).toBe(true);
      }
      for (const columnId of reference.columnIds) {
        expect(evidenceTable?.columns.some((column) => column.id === columnId)).toBe(true);
      }
    }

    const afterQuery = await request(app)
      .get(`/api/investigations/${initial.id}`)
      .set(userHeader, 'alice');
    expectSuccess(afterQuery.status);
    expect(afterQuery.body).toEqual(initial);

    const unsupported = await request(app)
      .post(`/api/investigations/${initial.id}/query`)
      .set(userHeader, 'alice')
      .send({ mode: 'open', prompt: 'Calculate medians using arbitrary SQL code.' });
    expectClientError(unsupported.status);

    const savedResponse = await request(app)
      .post(`/api/investigations/${initial.id}/findings`)
      .set(userHeader, 'alice')
      .send({ findingId: result.finding!.id });
    expectSuccess(savedResponse.status);
    const saved = savedResponse.body as Investigation;
    expect(saved.findings).toHaveLength(1);
    expect(saved.stats.savedFindings).toBe(1);
    expect(saved.revision).toBe(initial.revision + 1);

    const repeatedSave = await request(app)
      .post(`/api/investigations/${initial.id}/findings`)
      .set(userHeader, 'alice')
      .send({ findingId: result.finding!.id });
    expectSuccess(repeatedSave.status);
    expect(repeatedSave.body).toEqual(saved);

    const forgedFinding = await request(app)
      .post(`/api/investigations/${initial.id}/findings`)
      .set(userHeader, 'alice')
      .send({ findingId: 'finding_not_created_by_a_query' });
    expectClientError(forgedFinding.status);
  });

  it('falls back to deterministic analysis when a mocked Gemini plan is malformed', async () => {
    const malformedApp = await createApp({
      store: new MemoryStore(),
      auth: async (req: Request) => req.header(userHeader) ?? 'test-user',
      gemini: async () => ({ operation: 'execute_sql', tableId: 'not_a_real_table' }) as never,
      serveClient: false,
    });
    const { investigation } = await makeInvestigation(malformedApp);

    const response = await request(malformedApp)
      .post(`/api/investigations/${investigation.id}/query`)
      .set(userHeader, 'alice')
      .send({ mode: 'open', prompt: 'How many records are in total?' });
    expectSuccess(response.status);
    const result = response.body as QueryResult;
    expect(result.aiStatus).toBe('offline');
    expect(result.answer).toContain('active records');
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('falls back to deterministic analysis when Gemini exceeds the ten-second timeout', async () => {
    const timeoutApp = await createApp({
      store: new MemoryStore(),
      auth: async (req: Request) => req.header(userHeader) ?? 'test-user',
      gemini: async () => new Promise<never>(() => undefined),
      serveClient: false,
    });
    const { investigation } = await makeInvestigation(timeoutApp);

    const response = await request(timeoutApp)
      .post(`/api/investigations/${investigation.id}/query`)
      .set(userHeader, 'alice')
      .send({ mode: 'open', prompt: 'How many records are in total?' });
    expectSuccess(response.status);
    const result = response.body as QueryResult;
    expect(result.aiStatus).toBe('offline');
    expect(result.answer).toContain('active records');
  });

  it('leaves state untouched when durable commit fails, then allows a safe retry', async () => {
    const store = new FailAfterUpdateStore();
    const transactionApp = await createApp({
      store,
      auth: async (req: Request) => req.header(userHeader) ?? 'test-user',
      gemini: null,
      serveClient: false,
    });
    const { investigation: initial } = await makeInvestigation(transactionApp);
    const repairCase = actionableCase(initial);
    const previewResponse = await request(transactionApp)
      .post(`/api/investigations/${initial.id}/preview`)
      .set(userHeader, 'alice')
      .send({ expectedRevision: initial.revision, action: repairCase.action });
    expectSuccess(previewResponse.status);
    const preview = previewResponse.body as PreviewResponse;
    const resolveBody = {
      expectedRevision: initial.revision,
      action: repairCase.action,
      actionId: 'retry-after-store-failure',
      effectHash: preview.effectHash,
      caseId: repairCase.id,
    };

    store.failNextCommit = true;
    const failedResponse = await request(transactionApp)
      .post(`/api/investigations/${initial.id}/resolve`)
      .set(userHeader, 'alice')
      .send(resolveBody);
    expect(failedResponse.status).toBe(500);
    expect(failedResponse.body).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });

    const afterFailure = await request(transactionApp)
      .get(`/api/investigations/${initial.id}`)
      .set(userHeader, 'alice');
    expectSuccess(afterFailure.status);
    expect(afterFailure.body).toEqual(initial);

    const retryResponse = await request(transactionApp)
      .post(`/api/investigations/${initial.id}/resolve`)
      .set(userHeader, 'alice')
      .send(resolveBody);
    expectSuccess(retryResponse.status);
    expect((retryResponse.body as ResolveResponse).investigation.revision).toBe(
      initial.revision + 1,
    );
  });

  it('preserves oversized CSV imports but rejects selecting them into an investigation', async () => {
    const csvLines = [
      'id,value',
      ...Array.from({ length: 501 }, (_, index) => `${index + 1},row-${index + 1}`),
    ];
    const response = await request(app)
      .post('/api/imports')
      .set(userHeader, 'alice')
      .attach('files', Buffer.from(csvLines.join('\n'), 'utf8'), {
        filename: 'too-many-rows.csv',
        contentType: 'text/csv',
      });
    expectSuccess(response.status);
    const imported = response.body as ImportResult;
    expect(imported.tables[0]?.rows).toHaveLength(501);

    const createResponse = await request(app)
      .post('/api/investigations')
      .set(userHeader, 'alice')
      .send({ importId: imported.id, tableIds: [imported.tables[0]!.id] });
    expectClientError(createResponse.status);
  });

  it('imports linked XLSX sheets and repairs confirmed alias and parent-reference cases', async () => {
    const workbook = new ExcelJS.Workbook();
    const customers = workbook.addWorksheet('Customers');
    customers.addRows([
      ['customer_id', 'customer_name'],
      ['C01', 'Hazel Finch'],
      ['C02', 'Milo Moss'],
      ['C03', 'Milo_Moss'],
      ['C04', 'Nora Pine'],
    ]);
    const orders = workbook.addWorksheet('Orders');
    orders.addRows([
      ['order_id', 'customer_id', 'total'],
      ['O01', 'C01', 24],
      ['O02', 'c02', 18],
      ['O03', 'C99', 12],
    ]);
    const contents = Buffer.from(await workbook.xlsx.writeBuffer());
    const uploadResponse = await request(app)
      .post('/api/imports')
      .set(userHeader, 'alice')
      .attach('files', contents, {
        filename: 'market.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    expectSuccess(uploadResponse.status);
    const imported = uploadResponse.body as ImportResult;
    expect(imported.tables.map((table) => table.name)).toEqual(['Customers', 'Orders']);
    expect(imported.tables[0]?.rows[1]?.original).toEqual({ col_0: 'C02', col_1: 'Milo Moss' });

    const customerTable = imported.tables[0]!;
    const orderTable = imported.tables[1]!;
    const createResponse = await request(app)
      .post('/api/investigations')
      .set(userHeader, 'alice')
      .send({
        importId: imported.id,
        tableIds: [customerTable.id, orderTable.id],
        identity: { tableId: customerTable.id, columnId: 'col_1' },
        join: {
          parentTableId: customerTable.id,
          parentColumnId: 'col_0',
          childTableId: orderTable.id,
          childColumnId: 'col_1',
        },
      });
    expectSuccess(createResponse.status);
    let investigation = createResponse.body as Investigation;

    const linkCase = investigation.cases.find(
      (item) =>
        item.kind === 'relationship' &&
        item.action?.type === 'repairLinks' &&
        item.action.value === 'C02',
    );
    expect(linkCase).toBeDefined();
    const linkPreviewResponse = await request(app)
      .post(`/api/investigations/${investigation.id}/preview`)
      .set(userHeader, 'alice')
      .send({ expectedRevision: investigation.revision, action: linkCase!.action });
    expectSuccess(linkPreviewResponse.status);
    const linkPreview = linkPreviewResponse.body as PreviewResponse;
    const linkResolve = await request(app)
      .post(`/api/investigations/${investigation.id}/resolve`)
      .set(userHeader, 'alice')
      .send({
        expectedRevision: investigation.revision,
        action: linkPreview.action,
        actionId: 'xlsx-link-repair',
        effectHash: linkPreview.effectHash,
        caseId: linkCase!.id,
      });
    expectSuccess(linkResolve.status);
    investigation = (linkResolve.body as ResolveResponse).investigation;
    const repairedOrder = investigation.tables
      .find((table) => table.id === orderTable.id)!
      .rows.find((row) => row.id === 'row_2')!;
    expect(repairedOrder.values.col_1).toBe('C02');
    expect(repairedOrder.original.col_1).toBe('c02');

    const aliasCase = investigation.cases.find(
      (item) => item.kind === 'alias' && item.action?.type === 'canonicalizeAliases',
    );
    expect(aliasCase).toBeDefined();
    const aliasPreviewResponse = await request(app)
      .post(`/api/investigations/${investigation.id}/preview`)
      .set(userHeader, 'alice')
      .send({ expectedRevision: investigation.revision, action: aliasCase!.action });
    expectSuccess(aliasPreviewResponse.status);
    const aliasPreview = aliasPreviewResponse.body as PreviewResponse;
    const aliasResolve = await request(app)
      .post(`/api/investigations/${investigation.id}/resolve`)
      .set(userHeader, 'alice')
      .send({
        expectedRevision: investigation.revision,
        action: aliasPreview.action,
        actionId: 'xlsx-alias-repair',
        effectHash: aliasPreview.effectHash,
        caseId: aliasCase!.id,
      });
    expectSuccess(aliasResolve.status);
    investigation = (aliasResolve.body as ResolveResponse).investigation;
    const aliasRow = investigation.tables
      .find((table) => table.id === customerTable.id)!
      .rows.find((row) => row.id === 'row_3')!;
    expect(aliasRow.values.col_1).toBe('Milo Moss');
    expect(aliasRow.original.col_1).toBe('Milo_Moss');
  });

  it('exports only active committed rows and escapes spreadsheet formula prefixes in CSV', async () => {
    const uploadResponse = await request(app)
      .post('/api/imports')
      .set(userHeader, 'alice')
      .attach(
        'files',
        Buffer.from('id,value\n1,=1+1\n2,@SUM(A1:A2)\n3,-1+2\n4,keep until resolved', 'utf8'),
        {
          filename: 'formula-like-values.csv',
          contentType: 'text/csv',
        },
      );
    expectSuccess(uploadResponse.status);
    const imported = uploadResponse.body as ImportResult;
    const table = imported.tables[0]!;
    const createResponse = await request(app)
      .post('/api/investigations')
      .set(userHeader, 'alice')
      .send({ importId: imported.id, tableIds: [table.id], title: 'Export safety fixture' });
    expectSuccess(createResponse.status);
    const investigation = createResponse.body as Investigation;

    const previewResponse = await request(app)
      .post(`/api/investigations/${investigation.id}/preview`)
      .set(userHeader, 'alice')
      .send({
        expectedRevision: investigation.revision,
        action: { type: 'excludeRows', tableId: table.id, rowIds: ['row_4'] },
      });
    expectSuccess(previewResponse.status);
    const preview = previewResponse.body as PreviewResponse;
    const resolveResponse = await request(app)
      .post(`/api/investigations/${investigation.id}/resolve`)
      .set(userHeader, 'alice')
      .send({
        expectedRevision: investigation.revision,
        action: preview.action,
        actionId: 'export-exclude',
        effectHash: preview.effectHash,
      });
    expectSuccess(resolveResponse.status);

    const exportResponse = await request(app)
      .get(`/api/investigations/${investigation.id}/export`)
      .query({ format: 'csv', tableId: table.id })
      .set(userHeader, 'alice');
    expectSuccess(exportResponse.status);
    const exportedRows = parseCsv(exportResponse.text, { bom: true }) as string[][];
    expect(exportedRows).toEqual([
      ['id', 'value'],
      ['1', "'=1+1"],
      ['2', "'@SUM(A1:A2)"],
      ['3', "'-1+2"],
    ]);
  });

  it('sets production hosted-session cookie protections without setting auth cookies on config reads', async () => {
    vi.stubEnv('AUTH_MODE', 'session');
    vi.stubEnv('PERSISTENCE_MODE', 'file');
    vi.stubEnv('SESSION_SECRET', 'testing-session-secret-with-more-than-32-characters');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('K_SERVICE', '');
    const sessionApp = await createApp({
      store: new MemoryStore(),
      gemini: null,
      serveClient: false,
    });

    const configResponse = await request(sessionApp).get('/api/config');
    expectSuccess(configResponse.status);
    expect(configResponse.headers['set-cookie']).toBeUndefined();

    const demoResponse = await request(sessionApp).post('/api/demo').send({ name: 'club' });
    expectSuccess(demoResponse.status);
    const setCookie = demoResponse.headers['set-cookie'];
    const cookie = Array.isArray(setCookie)
      ? setCookie.find((value) => value.startsWith('dd_session='))
      : setCookie?.startsWith('dd_session=')
        ? setCookie
        : undefined;
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/dd_session=[a-f0-9]{64}\.[a-f0-9]{64}/);
    expect(cookie).toMatch(/; HttpOnly/i);
    expect(cookie).toMatch(/; Secure/i);
    expect(cookie).toMatch(/; SameSite=Strict/i);
    expect(cookie).toMatch(/; Path=\//i);
    expect(cookie).toMatch(/; Max-Age=2592000/i);
  });

  it('treats a Unicode session signature as invalid input instead of throwing on unequal byte lengths', async () => {
    vi.stubEnv('AUTH_MODE', 'session');
    vi.stubEnv('PERSISTENCE_MODE', 'file');
    vi.stubEnv('SESSION_SECRET', 'testing-session-secret-with-more-than-32-characters');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('K_SERVICE', '');
    vi.stubEnv('RENDER', '');
    const sessionApp = await createApp({
      store: new MemoryStore(),
      gemini: null,
      serveClient: false,
    });
    const malformedCookie = `dd_session=${'a'.repeat(64)}.${'é'.repeat(64)}`;

    const response = await request(sessionApp)
      .post('/api/demo')
      .set('Cookie', malformedCookie)
      .send({ name: 'club' });
    expectSuccess(response.status);
    expect(sessionCookie(response)).toMatch(/^dd_session=[a-f0-9]{64}\.[a-f0-9]{64}$/);
  });

  it('restores a file-backed investigation after a server restart using its local session cookie', async () => {
    vi.stubEnv('AUTH_MODE', 'local');
    vi.stubEnv('PERSISTENCE_MODE', 'file');
    vi.stubEnv('PERSISTENCE', 'file');
    vi.stubEnv('K_SERVICE', '');
    vi.stubEnv('RENDER', '');
    vi.stubEnv('NODE_ENV', 'test');
    const dataDirectory = await mkdtemp(path.join(tmpdir(), 'maplewick-restart-test-'));
    temporaryDirectories.push(dataDirectory);
    const firstApp = await createApp({ dataDir: dataDirectory, gemini: null, serveClient: false });

    const demoResponse = await request(firstApp).post('/api/demo').send({ name: 'market' });
    expectSuccess(demoResponse.status);
    const imported = demoResponse.body as ImportResult;
    const cookie = sessionCookie(demoResponse);
    expect(cookie).toMatch(/^dd_session=/);

    const createResponse = await request(firstApp)
      .post('/api/investigations')
      .set('Cookie', cookie!)
      .send({
        importId: imported.id,
        tableIds: imported.tables.map((table) => table.id),
        title: 'Persistent case',
      });
    expectSuccess(createResponse.status);
    const saved = createResponse.body as Investigation;

    const secondApp = await createApp({ dataDir: dataDirectory, gemini: null, serveClient: false });
    const restored = await request(secondApp)
      .get(`/api/investigations/${saved.id}`)
      .set('Cookie', cookie!);
    expectSuccess(restored.status);
    expect(restored.body).toEqual(saved);
  });
});
