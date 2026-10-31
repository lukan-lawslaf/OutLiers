import { describe, expect, it } from 'vitest';
import { DemoProvider } from '../../client/src/providers/DemoProvider.js';

describe('DemoProvider Contract Compliance', () => {
  it('loads seeded sandbox files with realistic diversity', async () => {
    const provider = new DemoProvider();
    const candidates = await provider.listCandidates();

    expect(candidates.length).toBeGreaterThanOrEqual(25);
    const hasKeep = candidates.some((f) => f.name.toLowerCase().includes('resume') || f.name.toLowerCase().includes('tax'));
    const hasInstaller = candidates.some((f) => f.name.endsWith('.exe') || f.name.endsWith('.msi'));

    expect(hasKeep).toBe(true);
    expect(hasInstaller).toBe(true);
  });

  it('correctly executes trash and restore operations', async () => {
    const provider = new DemoProvider();
    const candidatesBefore = await provider.listCandidates();
    const target = candidatesBefore[0];

    const trashResult = await provider.trash([target.id]);
    expect(trashResult.length).toBe(1);
    expect(trashResult[0].success).toBe(true);
    expect(trashResult[0].bytesFreed).toBe(target.size);

    const candidatesAfterTrash = await provider.listCandidates();
    expect(candidatesAfterTrash.some((f) => f.id === target.id)).toBe(false);

    const restoreResult = await provider.restore([target.id]);
    expect(restoreResult.length).toBe(1);
    expect(restoreResult[0].success).toBe(true);

    const candidatesAfterRestore = await provider.listCandidates();
    expect(candidatesAfterRestore.some((f) => f.id === target.id)).toBe(true);
  });
});
