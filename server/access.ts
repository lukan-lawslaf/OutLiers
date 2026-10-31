import type { Investigation } from '../shared/contracts.js';
import type { StoredInvestigation } from './store.js';
import { insist } from './errors.js';

export function owned(item: StoredInvestigation | undefined, ownerId: string): StoredInvestigation {
  insist(item && item.ownerId === ownerId, 404, 'NOT_FOUND', 'Investigation not found.'); return item;
}
export function checkRevision(inv: Investigation, expected: number): void { insist(inv.revision === expected, 409, 'REVISION_CONFLICT', 'Records changed after this preview. Refresh and preview again.'); }
