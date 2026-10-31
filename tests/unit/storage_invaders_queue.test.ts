import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ActionQueue } from '../../client/src/queue/ActionQueue.js';
import { DemoProvider } from '../../client/src/providers/DemoProvider.js';
import type { FileMeta } from '../../shared/schemas.js';

describe('ActionQueue with Undo & Non-Blocking Trashing', () => {
  const sampleFile: FileMeta = {
    id: 'f-test-99',
    name: 'Obsolete_Installer.msi',
    mimeType: 'application/x-msi',
    size: 50 * 1024 * 1024, // 50 MB
  };

  let provider: DemoProvider;
  let queue: ActionQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    provider = new DemoProvider([sampleFile]);
    queue = new ActionQueue(provider, {}, 5000);
  });

  it('queues a file in pending state without immediate trashing', async () => {
    queue.queueTrash(sampleFile);

    const pending = queue.getPendingList();
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe(sampleFile.id);
    expect(pending[0].status).toBe('pending');
    expect(queue.getConfirmedBytes()).toBe(0);

    const candidates = await provider.listCandidates();
    expect(candidates.some((c) => c.id === sampleFile.id)).toBe(true);
  });

  it('successfully undoes a pending trash within the 5-second window', async () => {
    queue.queueTrash(sampleFile);

    // Fast forward 2 seconds (within window)
    vi.advanceTimersByTime(2000);

    const undoSuccess = queue.undo(sampleFile.id);
    expect(undoSuccess).toBe(true);
    expect(queue.getPendingList().length).toBe(0);

    // Advance past original 5s
    vi.advanceTimersByTime(4000);

    expect(queue.getConfirmedBytes()).toBe(0);
    const candidates = await provider.listCandidates();
    expect(candidates.some((c) => c.id === sampleFile.id)).toBe(true);
  });

  it('commits to provider and confirms freed bytes after 5-second window expires', async () => {
    const onConfirmedFreed = vi.fn();
    queue = new ActionQueue(provider, { onConfirmedFreed }, 5000);

    queue.queueTrash(sampleFile);
    expect(queue.getConfirmedBytes()).toBe(0);

    // Advance past 5s window
    await vi.advanceTimersByTimeAsync(5100);

    expect(queue.getConfirmedBytes()).toBe(sampleFile.size);
    expect(onConfirmedFreed).toHaveBeenCalledWith(sampleFile.size, sampleFile.size);

    const candidates = await provider.listCandidates();
    expect(candidates.some((c) => c.id === sampleFile.id)).toBe(false);

    const trashBay = queue.getTrashBay();
    expect(trashBay.length).toBe(1);
    expect(trashBay[0].file.id).toBe(sampleFile.id);
  });

  it('restores a committed file from the Trash Bay', async () => {
    queue.queueTrash(sampleFile);
    await vi.advanceTimersByTimeAsync(5100);

    expect(queue.getConfirmedBytes()).toBe(sampleFile.size);

    const restored = await queue.restore(sampleFile.id);
    expect(restored).toBe(true);
    expect(queue.getConfirmedBytes()).toBe(0);

    const candidates = await provider.listCandidates();
    expect(candidates.some((c) => c.id === sampleFile.id)).toBe(true);
  });
});
