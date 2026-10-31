import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { z } from 'zod';
import { LIMITS, type AiStatus, type AppConfig, type Investigation, type QueryOperation, type QueryRequest } from '../shared/contracts.js';
import { AppError, insist } from './errors.js';
import { applyChanges, hash, preview, refresh, runQuery } from './engine.js';
import { parseUploads } from './imports.js';
import { demoTables } from './demos.js';
import { FileStore, type Store, type StoredInvestigation } from './store.js';
import { FirestoreStore } from './firestore-store.js';
import { PostgresStore } from './postgres-store.js';
import { boundedPlan, makeGeminiPlanner, type GeminiPlanner } from './gemini.js';
import { exportCsv, exportXlsx } from './exports.js';

const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const revision = z.number().int().nonnegative();
const rowIds = z.array(id).min(1).max(LIMITS.maxRows);
const cell = z.union([z.string().max(LIMITS.maxCellLength), z.number().finite(), z.boolean(), z.null()]);
const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('excludeRows'), tableId: id, rowIds }).strict(),
  z.object({ type: z.literal('canonicalizeAliases'), tableId: id, columnId: id, rowIds, value: z.string().min(1).max(LIMITS.maxCellLength) }).strict(),
  z.object({ type: z.literal('repairLinks'), tableId: id, columnId: id, rowIds, value: cell }).strict(),
  z.object({ type: z.literal('reviewCase'), caseId: id, outcome: z.enum(['keep', 'defer']) }).strict(),
]);
const previewSchema = z.object({ expectedRevision: revision, action: actionSchema }).strict();
const resolveSchema = previewSchema.extend({ actionId: id, effectHash: z.string().regex(/^[a-f0-9]{64}$/), caseId: id.optional() }).strict();
const undoSchema = z.object({ expectedRevision: revision, actionId: id, latestActionId: id }).strict();
const createSchema = z.object({ importId: id, tableIds: z.array(id).min(1).max(2), title: z.string().min(1).max(120).optional(), identity: z.object({ tableId: id, columnId: id }).strict().optional(), join: z.object({ parentTableId: id, parentColumnId: id, childTableId: id, childColumnId: id }).strict().optional() }).strict();
const querySchema = z.object({ mode: z.enum(['open', 'discovery']), prompt: z.string().trim().min(1).max(600).optional(), operation: z.enum(['profile', 'group_count', 'find_duplicates', 'trace_links']).optional(), tableId: id.optional(), columnId: id.optional() }).strict();

export interface AppOptions {
  store?: Store;
  auth?: (request: Request) => string | Promise<string>;
  gemini?: GeminiPlanner | null;
  dataDir?: string;
  serveClient?: boolean;
}
function owned(item: StoredInvestigation | undefined, ownerId: string): StoredInvestigation {
  insist(item && item.ownerId === ownerId, 404, 'NOT_FOUND', 'Investigation not found.'); return item;
}
function checkRevision(inv: Investigation, expected: number): void { insist(inv.revision === expected, 409, 'REVISION_CONFLICT', 'Records changed after this preview. Refresh and preview again.'); }
function fallbackOperation(prompt: string): QueryOperation | undefined {
  if (/duplicate|matching records|repeat/i.test(prompt)) return 'find_duplicates';
  if (/link|reference|relationship|orphan/i.test(prompt)) return 'trace_links';
  if (/group|count.+by|how many.+(each|per)|breakdown/i.test(prompt)) return 'group_count';
  if (/profile|summari[sz]e|overview|blank|missing|how many|total|record/i.test(prompt)) return 'profile';
  return undefined;
}
export async function createApp(options: AppOptions = {}): Promise<Express> {
  const app = express(); app.disable('x-powered-by');
  const cloud = Boolean(process.env['K_SERVICE'] || process.env['RENDER']);
  const firebaseMode = process.env['AUTH_MODE'] === 'firebase';
  const sessionMode = process.env['AUTH_MODE'] === 'session';
  const persistence = process.env['PERSISTENCE_MODE'] ?? process.env['PERSISTENCE'] ?? 'file';
  const firestoreMode = persistence === 'firestore'; const postgresMode = persistence === 'postgres';
  insist(!cloud || firebaseMode || sessionMode || options.auth, 500, 'AUTH_CONFIGURATION', 'Hosted deployment requires AUTH_MODE=session or firebase.');
  insist(!cloud || firestoreMode || postgresMode || options.store || process.env['ALLOW_EPHEMERAL_DEMO'] === 'true', 500, 'STORE_CONFIGURATION', 'Hosted deployment requires durable Postgres or Firestore persistence.');
  if ((firebaseMode || firestoreMode) && !getApps().length) initializeApp({ credential: applicationDefault(), ...(process.env['FIREBASE_PROJECT_ID'] ? { projectId: process.env['FIREBASE_PROJECT_ID'] } : {}) });
  const directory = options.dataDir ?? process.env['DATA_DIR'] ?? path.resolve('.data');
  if (postgresMode && !options.store) insist(process.env['DATABASE_URL'], 500, 'STORE_CONFIGURATION', 'Postgres persistence requires DATABASE_URL.');
  const store: Store = options.store ?? (postgresMode ? await new PostgresStore(process.env['DATABASE_URL']!).initialize() : firestoreMode ? new FirestoreStore() : await new FileStore(directory).initialize());
  app.locals['close'] = async () => { await store.close?.(); };
  const planner = options.gemini === undefined ? (process.env['GEMINI_API_KEY'] ? makeGeminiPlanner(process.env['GEMINI_API_KEY']) : null) : options.gemini;
  let secret: Buffer;
  if (options.auth || firebaseMode) secret = randomBytes(32);
  else if (sessionMode) { insist(process.env['SESSION_SECRET'] && process.env['SESSION_SECRET'].length >= 32, 500, 'AUTH_CONFIGURATION', 'Hosted sessions require a persistent SESSION_SECRET of at least 32 characters.'); secret = Buffer.from(process.env['SESSION_SECRET']); }
  else {
    await mkdir(directory, { recursive: true });
    const secretPath = path.join(directory, 'session.key');
    try { secret = await readFile(secretPath); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; const generated = randomBytes(32); try { await writeFile(secretPath, generated, { flag: 'wx', mode: 0o600 }); secret = generated; } catch { secret = await readFile(secretPath); } }
  }
  const firebaseApiKey = process.env['FIREBASE_API_KEY'] ?? process.env['FIREBASE_WEB_API_KEY'];
  const config: AppConfig = { authMode: firebaseMode ? 'firebase' : sessionMode ? 'session' : 'local', persistence: postgresMode ? 'postgres' : firestoreMode ? 'firestore' : 'file', aiEnabled: Boolean(planner), ...(firebaseMode && firebaseApiKey ? { firebaseConfig: { apiKey: firebaseApiKey, authDomain: process.env['FIREBASE_AUTH_DOMAIN'] ?? `${process.env['FIREBASE_PROJECT_ID']}.firebaseapp.com`, projectId: process.env['FIREBASE_PROJECT_ID'] ?? '', appId: process.env['FIREBASE_APP_ID'] ?? '' } } : {}) };
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '256kb' })); app.use(cookieParser());
  app.get('/api/health', (_request, response) => response.json({ ok: true }));
  app.get('/api/config', (_request, response) => response.json(config));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMIT', message: 'Please wait a moment before continuing.' } } }));
  app.use('/api', async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        const origin = request.header('origin');
        if (origin) { let originHost = ''; try { originHost = new URL(origin).host; } catch { /* rejected below */ } const allowedOrigins = (process.env['CLIENT_ORIGIN'] ?? '').split(',').map(value => value.trim()); insist(originHost === request.header('host') || allowedOrigins.includes(origin), 403, 'ORIGIN_REJECTED', 'This request came from an untrusted origin.'); }
      }
      let uid: string;
      if (options.auth) uid = await options.auth(request);
      else if (firebaseMode) {
        const token = request.header('authorization')?.match(/^Bearer (.+)$/)?.[1]; insist(token, 401, 'UNAUTHENTICATED', 'Sign in before opening an investigation.');
        try { uid = (await getAuth().verifyIdToken(token)).uid; } catch { throw new AppError(401, 'UNAUTHENTICATED', 'Your sign-in has expired. Please sign in again.'); }
      } else {
        const signed = typeof request.cookies['dd_session'] === 'string' ? request.cookies['dd_session'] as string : '';
        const [candidate = '', signature = ''] = signed.split('.'); const expected = createHmac('sha256', secret).update(candidate).digest('hex');
        const valid = /^[a-f0-9]{64}$/.test(candidate) && signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
        uid = valid ? candidate : randomBytes(32).toString('hex');
        if (!valid) response.cookie('dd_session', `${uid}.${createHmac('sha256', secret).update(uid).digest('hex')}`, { httpOnly: true, sameSite: 'strict', secure: cloud || process.env['NODE_ENV'] === 'production', maxAge: 30 * 24 * 60 * 60 * 1000, path: '/' });
      }
      insist(uid && uid.length <= 256, 401, 'UNAUTHENTICATED', 'A valid identity is required.'); response.locals['uid'] = uid; next();
    } catch (error) { next(error); }
  });
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
    const data = refresh({ id: `investigation_${randomUUID()}`, title: body.title ?? 'The Maplewick casefile', revision: 0, tables, ...(body.identity ? { identity: body.identity } : {}), ...(body.join ? { join: body.join } : {}), cases: [], findings: [], history: [], stats: { totalRows: 0, activeRows: 0, changedRows: 0, openCases: 0, resolvedCases: 0, savedFindings: 0 }, aiStatus: planner ? 'available' : 'disabled' });
    await store.create({ ownerId, data, receipts: {}, pendingFindings: {}, reviewUndos: {} }); response.status(201).json(data);
  });
  app.get('/api/investigations/:id', async (request, response) => response.json(owned(await store.get(request.params['id']!), response.locals['uid'] as string).data));
  app.post('/api/investigations/:id/preview', async (request, response) => {
    const body = previewSchema.parse(request.body); const item = owned(await store.get(request.params['id']!), response.locals['uid'] as string); checkRevision(item.data, body.expectedRevision); response.json(preview(item.data, body.action));
  });
  app.post('/api/investigations/:id/resolve', async (request, response) => {
    const body = resolveSchema.parse(request.body); const ownerId = response.locals['uid'] as string; const fingerprint = hash({ kind: 'resolve', ...body }); const createdAt = new Date().toISOString();
    const item = await store.transact(request.params['id']!, current => {
      owned(current, ownerId); const receipt = current.receipts[body.actionId]; if (receipt) { insist(receipt.fingerprint === fingerprint, 409, 'ACTION_ID_CONFLICT', 'This action ID was already used for a different request.'); return current; }
      checkRevision(current.data, body.expectedRevision); const effect = preview(current.data, body.action); insist(effect.effectHash === body.effectHash, 409, 'PREVIEW_MISMATCH', 'This confirmation does not match the preview. Preview again.');
      if (body.caseId) { const caseFile = current.data.cases.find(item => item.id === body.caseId); insist(caseFile && caseFile.status !== 'resolved' && caseFile.basedOnRevision === current.data.revision, 409, 'STALE_CASE', 'This case has changed. Refresh before resolving it.'); }
      applyChanges(current.data, effect.changes);
      if (body.action.type === 'reviewCase') { const action = body.action; const caseFile = current.data.cases.find(item => item.id === action.caseId)!; current.reviewUndos[body.actionId] = { caseId: caseFile.id, status: caseFile.status }; caseFile.status = action.outcome === 'keep' ? 'kept' : 'deferred'; }
      current.pendingFindings = {}; current.data.revision++; current.data.history.push({ id: body.actionId, label: effect.summary, changes: effect.changes, createdAt, revision: current.data.revision, undone: false, kind: 'resolve' }); current.latestActionId = body.actionId;
      current.receipts[body.actionId] = { fingerprint, revision: current.data.revision }; refresh(current.data); return current;
    }); response.json({ investigation: item.data, actionId: body.actionId });
  });
  app.post('/api/investigations/:id/undo', async (request, response) => {
    const body = undoSchema.parse(request.body); const ownerId = response.locals['uid'] as string; const fingerprint = hash({ kind: 'undo', ...body }); const createdAt = new Date().toISOString();
    const item = await store.transact(request.params['id']!, current => {
      owned(current, ownerId); const receipt = current.receipts[body.actionId]; if (receipt) { insist(receipt.fingerprint === fingerprint, 409, 'ACTION_ID_CONFLICT', 'This action ID was already used.'); return current; }
      checkRevision(current.data, body.expectedRevision); insist(current.latestActionId === body.latestActionId, 409, 'UNDO_CONFLICT', 'Only the latest eligible action can be undone.');
      const previous = current.data.history.find(entry => entry.id === body.latestActionId && entry.kind === 'resolve' && !entry.undone); insist(previous, 409, 'NOTHING_TO_UNDO', 'There is no eligible action to undo.');
      applyChanges(current.data, previous.changes, true); previous.undone = true;
      const review = current.reviewUndos[previous.id]; if (review) { const caseFile = current.data.cases.find(item => item.id === review.caseId); if (caseFile) caseFile.status = review.status as 'open' | 'kept' | 'deferred' | 'resolved'; }
      current.pendingFindings = {}; current.data.revision++; current.data.history.push({ id: body.actionId, label: `Undo: ${previous.label}`, changes: previous.changes.map(change => ({ ...change, before: change.after, after: change.before })), createdAt, revision: current.data.revision, undone: false, kind: 'undo' });
      const eligible = [...current.data.history].reverse().find(entry => entry.kind === 'resolve' && !entry.undone); if (eligible) current.latestActionId = eligible.id; else delete current.latestActionId;
      current.receipts[body.actionId] = { fingerprint, revision: current.data.revision }; refresh(current.data); return current;
    }); response.json({ investigation: item.data, actionId: body.actionId });
  });
  app.post('/api/investigations/:id/query', async (request, response) => {
    const body = querySchema.parse(request.body); const ownerId = response.locals['uid'] as string; const current = owned(await store.get(request.params['id']!), ownerId); let plan: QueryRequest = body; let aiStatus: AiStatus = planner ? 'available' : 'disabled';
    if (!body.operation) {
      insist(body.mode === 'open' && body.prompt, 422, 'QUERY_REQUIRED', 'Choose an operation or enter a supported question.');
      if (planner) {
        try { const proposed = await boundedPlan(planner, current.data, body.prompt); const table = current.data.tables.find(table => table.id === proposed.tableId); insist(table && (!proposed.columnId || table.columns.some(column => column.id === proposed.columnId)), 400, 'INVALID_PLAN', 'The proposed query references unavailable data.'); plan = { ...body, ...proposed }; }
        catch { aiStatus = 'offline'; plan = { ...body, operation: fallbackOperation(body.prompt) }; }
      } else plan = { ...body, operation: fallbackOperation(body.prompt) };
    }
    // Plans contain identifiers only; the deterministic engine validates all references and computes every result.
    const result = runQuery(current.data, plan); result.aiStatus = aiStatus;
    if (result.finding) {
      const finding = result.finding;
      await store.transact(current.data.id, latest => { owned(latest, ownerId); checkRevision(latest.data, current.data.revision); latest.pendingFindings[finding.id] = finding; const keys = Object.keys(latest.pendingFindings); for (const key of keys.slice(0, Math.max(0, keys.length - 30))) delete latest.pendingFindings[key]; return latest; });
    }
    response.json(result);
  });
  app.post('/api/investigations/:id/findings', async (request, response) => {
    const body = z.object({ findingId: id }).strict().parse(request.body); const ownerId = response.locals['uid'] as string;
    const item = await store.transact(request.params['id']!, current => { owned(current, ownerId); if (current.data.findings.some(finding => finding.id === body.findingId)) return current; const finding = current.pendingFindings[body.findingId]; insist(finding, 404, 'FINDING_NOT_FOUND', 'Run a query before saving its finding.'); current.data.findings.push(finding); delete current.pendingFindings[body.findingId]; current.data.revision++; refresh(current.data); return current; }); response.json(item.data);
  });
  app.get('/api/investigations/:id/export', async (request, response) => {
    const item = owned(await store.get(request.params['id']!), response.locals['uid'] as string); const format = z.enum(['csv', 'xlsx', 'report']).parse(request.query['format'] ?? 'report');
    response.setHeader('Cache-Control', 'no-store');
    if (format === 'csv') { const tableId = id.parse(request.query['tableId'] ?? item.data.tables[0]!.id); response.attachment('clean-records.csv').type('text/csv').send(exportCsv(item.data, tableId)); }
    else if (format === 'xlsx') response.attachment('maplewick-casefile.xlsx').type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(await exportXlsx(item.data));
    else response.attachment('maplewick-report.json').type('application/json').send(JSON.stringify({ ...item.data, exportedAt: new Date().toISOString(), policy: 'Excluded rows omitted from clean CSV/XLSX. Original records remain immutable in this report.' }, null, 2));
  });
  app.use('/api', (_request, _response, next) => next(new AppError(404, 'NOT_FOUND', 'API route not found.')));
  if (options.serveClient ?? process.env['NODE_ENV'] === 'production') { const client = path.resolve('dist/client'); app.use(express.static(client)); app.get('/{*path}', (_request, response) => response.sendFile(path.join(client, 'index.html'))); }
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof AppError) response.status(error.status).json({ error: { code: error.code, message: error.message } });
    else if (error instanceof z.ZodError) response.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'The request has invalid or unsupported fields.' } });
    else if (error instanceof multer.MulterError) response.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: { code: error.code, message: 'Upload one or two CSV/XLSX files, each at most 2 MB.' } });
    else if ((error as { type?: string })?.type === 'entity.too.large') response.status(413).json({ error: { code: 'REQUEST_LIMIT', message: 'This request is too large.' } });
    else response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'The operation could not be saved. Your previous records remain unchanged.' } });
  });
  return app;
}
