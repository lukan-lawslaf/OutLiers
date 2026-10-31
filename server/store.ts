import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Finding, ImportResult, Investigation } from '../shared/contracts.js';
import { insist } from './errors.js';

export interface StoredImport {
  ownerId: string;
  data: ImportResult;
}

export interface Receipt {
  fingerprint: string;
  revision: number;
}

export interface StoredInvestigation {
  ownerId: string;
  data: Investigation;
  receipts: Record<string, Receipt>;
  pendingFindings: Record<string, Finding>;
  reviewUndos: Record<string, { caseId: string; status: string }>;
  latestActionId?: string;
}

export interface Store {
  close?(): Promise<void>;
  putImport(item: StoredImport): Promise<void>;
  getImport(id: string): Promise<StoredImport | undefined>;
  create(item: StoredInvestigation): Promise<void>;
  get(id: string): Promise<StoredInvestigation | undefined>;
  transact(
    id: string,
    update: (item: StoredInvestigation) => StoredInvestigation,
  ): Promise<StoredInvestigation>;
}

type ResourceKind = 'imports' | 'investigations';
type Resource = StoredImport | StoredInvestigation;
interface State {
  imports: Record<string, StoredImport>;
  investigations: Record<string, StoredInvestigation>;
}

/** Isolates callers' objects and serializes only operations on the same resource. */
export class MemoryStore implements Store {
  protected state: State = { imports: {}, investigations: {} };
  private queues = new Map<string, Promise<void>>();

  protected async persist(_kind: ResourceKind, _item: Resource): Promise<void> {
    // The memory adapter has no external persistence step.
  }

  private async serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const task = (this.queues.get(key) ?? Promise.resolve()).then(operation);
    const settled = task.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(key, settled);
    void settled.then(() => {
      if (this.queues.get(key) === settled) this.queues.delete(key);
    });
    return task;
  }

  async putImport(item: StoredImport): Promise<void> {
    const snapshot = structuredClone(item);
    await this.serialize(`imports:${snapshot.data.id}`, async () => {
      await this.persist('imports', snapshot);
      this.state.imports[snapshot.data.id] = snapshot;
    });
  }

  async getImport(id: string): Promise<StoredImport | undefined> {
    return structuredClone(this.state.imports[id]);
  }

  async create(item: StoredInvestigation): Promise<void> {
    const snapshot = structuredClone(item);
    await this.serialize(`investigations:${snapshot.data.id}`, async () => {
      insist(
        !this.state.investigations[snapshot.data.id],
        409,
        'ALREADY_EXISTS',
        'Investigation already exists.',
      );
      await this.persist('investigations', snapshot);
      this.state.investigations[snapshot.data.id] = snapshot;
    });
  }

  async get(id: string): Promise<StoredInvestigation | undefined> {
    return structuredClone(this.state.investigations[id]);
  }

  async transact(
    id: string,
    update: (item: StoredInvestigation) => StoredInvestigation,
  ): Promise<StoredInvestigation> {
    return this.serialize(`investigations:${id}`, async () => {
      const current = this.state.investigations[id];
      insist(current, 404, 'NOT_FOUND', 'Investigation not found.');
      const updated = update(structuredClone(current));
      insist(
        updated.data.id === id,
        409,
        'RESOURCE_ID_CONFLICT',
        'An investigation ID cannot be changed.',
      );
      const committed = structuredClone(updated);
      await this.persist('investigations', committed);
      this.state.investigations[id] = committed;
      return updated;
    });
  }
}

/** One atomic file replacement per resource; failures never publish in-memory changes. */
export class FileStore extends MemoryStore {
  constructor(private directory: string) {
    super();
  }

  async initialize(): Promise<this> {
    await Promise.all(
      ['imports', 'investigations'].map((kind) =>
        mkdir(path.join(this.directory, kind), { recursive: true }),
      ),
    );
    await this.migrateLegacyState();
    this.state = { imports: {}, investigations: {} };
    for (const kind of ['imports', 'investigations'] as const) {
      const names = await readdir(path.join(this.directory, kind));
      for (const name of names) {
        if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
        const item = JSON.parse(
          await readFile(path.join(this.directory, kind, name), 'utf8'),
        ) as Resource;
        if (kind === 'imports') this.state.imports[item.data.id] = item as StoredImport;
        else this.state.investigations[item.data.id] = item as StoredInvestigation;
      }
    }
    return this;
  }

  private filename(kind: ResourceKind, id: string): string {
    // Hashing also makes arbitrary IDs safe as Windows filenames and prevents path traversal.
    const name = createHash('sha256').update(id).digest('hex');
    return path.join(this.directory, kind, `${name}.json`);
  }

  private async migrateLegacyState(): Promise<void> {
    const legacyPath = path.join(this.directory, 'state.json');
    let legacy: State;
    try {
      legacy = JSON.parse(await readFile(legacyPath, 'utf8')) as State;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const kind of ['imports', 'investigations'] as const) {
      for (const item of Object.values(legacy[kind])) {
        try {
          await readFile(this.filename(kind, item.data.id));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          await this.persist(kind, item);
        }
      }
    }
    // Preserve a recovery copy; interrupted migrations can resume from state.json.
    await rename(legacyPath, path.join(this.directory, 'state.legacy.json'));
  }

  protected override async persist(kind: ResourceKind, item: Resource): Promise<void> {
    const destination = this.filename(kind, item.data.id);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(item), { mode: 0o600, flag: 'wx', flush: true });
      await rename(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}
