import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Finding, ImportResult, Investigation } from '../shared/contracts.js';
import { insist } from './errors.js';

export interface StoredImport { ownerId: string; data: ImportResult }
export interface Receipt { fingerprint: string; revision: number }
export interface StoredInvestigation { ownerId: string; data: Investigation; receipts: Record<string, Receipt>; pendingFindings: Record<string, Finding>; reviewUndos: Record<string, { caseId: string; status: string }>; latestActionId?: string }
export interface Store {
  close?(): Promise<void>;
  putImport(item: StoredImport): Promise<void>;
  getImport(id: string): Promise<StoredImport | undefined>;
  create(item: StoredInvestigation): Promise<void>;
  get(id: string): Promise<StoredInvestigation | undefined>;
  transact(id: string, update: (item: StoredInvestigation) => StoredInvestigation): Promise<StoredInvestigation>;
}
interface State { imports: Record<string, StoredImport>; investigations: Record<string, StoredInvestigation> }
export class MemoryStore implements Store {
  protected state: State = { imports: {}, investigations: {} };
  private queue: Promise<unknown> = Promise.resolve();
  protected async persist(_state: State): Promise<void> { /* In-memory adapter for isolated tests. */ }
  protected async change<T>(operation: (draft: State) => T): Promise<T> {
    const task = this.queue.then(async () => { const draft = structuredClone(this.state); const result = operation(draft); await this.persist(draft); this.state = draft; return structuredClone(result); });
    this.queue = task.catch(() => undefined); return task;
  }
  async putImport(item: StoredImport): Promise<void> { await this.change(draft => { draft.imports[item.data.id] = structuredClone(item); }); }
  async getImport(id: string): Promise<StoredImport | undefined> { return structuredClone(this.state.imports[id]); }
  async create(item: StoredInvestigation): Promise<void> { await this.change(draft => { insist(!draft.investigations[item.data.id], 409, 'ALREADY_EXISTS', 'Investigation already exists.'); draft.investigations[item.data.id] = structuredClone(item); }); }
  async get(id: string): Promise<StoredInvestigation | undefined> { return structuredClone(this.state.investigations[id]); }
  async transact(id: string, update: (item: StoredInvestigation) => StoredInvestigation): Promise<StoredInvestigation> {
    return this.change(draft => { const current = draft.investigations[id]; insist(current, 404, 'NOT_FOUND', 'Investigation not found.'); const updated = update(structuredClone(current)); draft.investigations[id] = updated; return updated; });
  }
}
export class FileStore extends MemoryStore {
  constructor(private directory: string) { super(); }
  async initialize(): Promise<this> {
    await mkdir(this.directory, { recursive: true });
    try { this.state = JSON.parse(await readFile(path.join(this.directory, 'state.json'), 'utf8')) as State; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    return this;
  }
  protected override async persist(state: State): Promise<void> {
    const temporary = path.join(this.directory, `state-${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    await rename(temporary, path.join(this.directory, 'state.json'));
  }
}
