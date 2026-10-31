import type { FileMeta, TrashResult } from '../../../shared/schemas.js';
import type { FileProvider } from '../../../shared/types.js';

export interface PendingAction {
  id: string;
  file: FileMeta;
  timestamp: number;
  timerId: ReturnType<typeof setTimeout>;
  status: 'pending' | 'committing' | 'confirmed' | 'failed' | 'undone';
}

export interface TrashedRecord {
  file: FileMeta;
  trashedAt: number;
  bytesFreed: number;
}

export interface ActionQueueEvents {
  onPendingUpdate?: (pending: PendingAction[]) => void;
  onConfirmedFreed?: (totalBytes: number, addedBytes: number) => void;
  onTrashBayUpdate?: (trashBay: TrashedRecord[]) => void;
  onError?: (message: string) => void;
}

export class ActionQueue {
  private provider: FileProvider;
  private events: ActionQueueEvents;
  private pendingMap: Map<string, PendingAction> = new Map();
  private trashBayList: TrashedRecord[] = [];
  private totalConfirmedBytes = 0;
  private undoWindowMs = 5000;

  constructor(provider: FileProvider, events: ActionQueueEvents = {}, undoWindowMs = 5000) {
    this.provider = provider;
    this.events = events;
    this.undoWindowMs = undoWindowMs;
  }

  public setProvider(provider: FileProvider): void {
    this.provider = provider;
  }

  public getConfirmedBytes(): number {
    return this.totalConfirmedBytes;
  }

  public getTrashBay(): TrashedRecord[] {
    return [...this.trashBayList];
  }

  public getPendingList(): PendingAction[] {
    return Array.from(this.pendingMap.values()).filter((p) => p.status === 'pending');
  }

  public queueTrash(file: FileMeta): void {
    if (this.pendingMap.has(file.id)) return;

    const timerId = setTimeout(() => {
      this.executeCommit([file.id]);
    }, this.undoWindowMs);

    const pending: PendingAction = {
      id: file.id,
      file,
      timestamp: Date.now(),
      timerId,
      status: 'pending',
    };

    this.pendingMap.set(file.id, pending);
    this.emitPendingUpdate();
  }

  public undo(id: string): boolean {
    const action = this.pendingMap.get(id);
    if (!action || action.status !== 'pending') return false;

    clearTimeout(action.timerId);
    action.status = 'undone';
    this.pendingMap.delete(id);
    this.emitPendingUpdate();
    return true;
  }

  public async restore(id: string): Promise<boolean> {
    const recordIndex = this.trashBayList.findIndex((r) => r.file.id === id);
    if (recordIndex === -1) return false;

    const record = this.trashBayList[recordIndex];
    try {
      const results = await this.provider.restore([id]);
      const res = results[0];
      if (res && res.success) {
        this.trashBayList.splice(recordIndex, 1);
        this.totalConfirmedBytes = Math.max(0, this.totalConfirmedBytes - record.bytesFreed);
        this.events.onConfirmedFreed?.(this.totalConfirmedBytes, -record.bytesFreed);
        this.events.onTrashBayUpdate?.(this.trashBayList);
        return true;
      } else {
        this.events.onError?.(res?.error || 'Failed to restore file');
        return false;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error during restore';
      this.events.onError?.(msg);
      return false;
    }
  }

  public async restoreAll(): Promise<number> {
    const ids = this.trashBayList.map((r) => r.file.id);
    if (ids.length === 0) return 0;

    let restoredCount = 0;
    for (const id of ids) {
      const success = await this.restore(id);
      if (success) restoredCount++;
    }
    return restoredCount;
  }

  private async executeCommit(ids: string[]): Promise<void> {
    const actionsToCommit = ids
      .map((id) => this.pendingMap.get(id))
      .filter((a): a is PendingAction => !!a && a.status === 'pending');

    if (actionsToCommit.length === 0) return;

    for (const action of actionsToCommit) {
      action.status = 'committing';
    }
    this.emitPendingUpdate();

    try {
      const results: TrashResult[] = await this.provider.trash(actionsToCommit.map((a) => a.id));
      for (const res of results) {
        const action = this.pendingMap.get(res.id);
        if (!action) continue;

        if (res.success) {
          action.status = 'confirmed';
          const bytes = res.bytesFreed ?? action.file.size;
          this.totalConfirmedBytes += bytes;
          this.trashBayList.push({
            file: action.file,
            trashedAt: Date.now(),
            bytesFreed: bytes,
          });
          this.events.onConfirmedFreed?.(this.totalConfirmedBytes, bytes);
        } else {
          action.status = 'failed';
          this.events.onError?.(`Failed to trash ${action.file.name}: ${res.error || 'Unknown error'}`);
        }
        this.pendingMap.delete(res.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error committing trash action';
      this.events.onError?.(msg);
      for (const action of actionsToCommit) {
        action.status = 'failed';
        this.pendingMap.delete(action.id);
      }
    }

    this.emitPendingUpdate();
    this.events.onTrashBayUpdate?.(this.trashBayList);
  }

  private emitPendingUpdate(): void {
    this.events.onPendingUpdate?.(this.getPendingList());
  }
}
