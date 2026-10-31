import { z } from 'zod';
import { LIMITS } from '../shared/contracts.js';

export const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
const revision = z.number().int().nonnegative();
const rowIds = z.array(id).min(1).max(LIMITS.maxRows);
const cell = z.union([
  z.string().max(LIMITS.maxCellLength),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('excludeRows'), tableId: id, rowIds }).strict(),
  z
    .object({
      type: z.literal('canonicalizeAliases'),
      tableId: id,
      columnId: id,
      rowIds,
      value: z.string().min(1).max(LIMITS.maxCellLength),
    })
    .strict(),
  z
    .object({ type: z.literal('repairLinks'), tableId: id, columnId: id, rowIds, value: cell })
    .strict(),
  z
    .object({ type: z.literal('reviewCase'), caseId: id, outcome: z.enum(['keep', 'defer']) })
    .strict(),
]);
export const previewSchema = z
  .object({ expectedRevision: revision, action: actionSchema })
  .strict();
export const resolveSchema = previewSchema
  .extend({ actionId: id, effectHash: z.string().regex(/^[a-f0-9]{64}$/), caseId: id.optional() })
  .strict();
export const undoSchema = z
  .object({ expectedRevision: revision, actionId: id, latestActionId: id })
  .strict();
export const createSchema = z
  .object({
    importId: id,
    tableIds: z.array(id).min(1).max(2),
    title: z.string().min(1).max(120).optional(),
    identity: z.object({ tableId: id, columnId: id }).strict().optional(),
    join: z
      .object({ parentTableId: id, parentColumnId: id, childTableId: id, childColumnId: id })
      .strict()
      .optional(),
  })
  .strict();
export const querySchema = z
  .object({
    mode: z.enum(['open', 'discovery']),
    prompt: z.string().trim().min(1).max(600).optional(),
    operation: z.enum(['profile', 'group_count', 'find_duplicates', 'trace_links']).optional(),
    tableId: id.optional(),
    columnId: id.optional(),
  })
  .strict();
