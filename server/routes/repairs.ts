import { Router } from 'express';
import type { Store } from '../store.js';
import { previewSchema, resolveSchema, undoSchema } from '../validation.js';
import { owned, checkRevision } from '../access.js';
import { applyChanges, hash, preview, refresh } from '../engine.js';
import { insist } from '../errors.js';

export function repairsRoutes(store: Store): Router {
  const app = Router();
  app.get('/api/investigations/:id', async (request, response) =>
    response.json(
      owned(await store.get(request.params['id']!), response.locals['uid'] as string).data,
    ),
  );
  app.post('/api/investigations/:id/preview', async (request, response) => {
    const body = previewSchema.parse(request.body);
    const item = owned(await store.get(request.params['id']!), response.locals['uid'] as string);
    checkRevision(item.data, body.expectedRevision);
    response.json(preview(item.data, body.action));
  });
  app.post('/api/investigations/:id/resolve', async (request, response) => {
    const body = resolveSchema.parse(request.body);
    const ownerId = response.locals['uid'] as string;
    const fingerprint = hash({ kind: 'resolve', ...body });
    const createdAt = new Date().toISOString();
    const item = await store.transact(request.params['id']!, (current) => {
      owned(current, ownerId);
      const receipt = current.receipts[body.actionId];
      if (receipt) {
        insist(
          receipt.fingerprint === fingerprint,
          409,
          'ACTION_ID_CONFLICT',
          'This action ID was already used for a different request.',
        );
        return current;
      }
      checkRevision(current.data, body.expectedRevision);
      const effect = preview(current.data, body.action);
      insist(
        effect.effectHash === body.effectHash,
        409,
        'PREVIEW_MISMATCH',
        'This confirmation does not match the preview. Preview again.',
      );
      if (body.caseId) {
        const caseFile = current.data.cases.find((item) => item.id === body.caseId);
        insist(
          caseFile &&
            caseFile.status !== 'resolved' &&
            caseFile.basedOnRevision === current.data.revision,
          409,
          'STALE_CASE',
          'This case has changed. Refresh before resolving it.',
        );
      }
      applyChanges(current.data, effect.changes);
      if (body.action.type === 'reviewCase') {
        const action = body.action;
        const caseFile = current.data.cases.find((item) => item.id === action.caseId)!;
        current.reviewUndos[body.actionId] = { caseId: caseFile.id, status: caseFile.status };
        caseFile.status = action.outcome === 'keep' ? 'kept' : 'deferred';
      }
      current.pendingFindings = {};
      current.data.revision++;
      current.data.history.push({
        id: body.actionId,
        label: effect.summary,
        changes: effect.changes,
        createdAt,
        revision: current.data.revision,
        undone: false,
        kind: 'resolve',
      });
      current.latestActionId = body.actionId;
      current.receipts[body.actionId] = { fingerprint, revision: current.data.revision };
      refresh(current.data);
      return current;
    });
    response.json({ investigation: item.data, actionId: body.actionId });
  });
  app.post('/api/investigations/:id/undo', async (request, response) => {
    const body = undoSchema.parse(request.body);
    const ownerId = response.locals['uid'] as string;
    const fingerprint = hash({ kind: 'undo', ...body });
    const createdAt = new Date().toISOString();
    const item = await store.transact(request.params['id']!, (current) => {
      owned(current, ownerId);
      const receipt = current.receipts[body.actionId];
      if (receipt) {
        insist(
          receipt.fingerprint === fingerprint,
          409,
          'ACTION_ID_CONFLICT',
          'This action ID was already used.',
        );
        return current;
      }
      checkRevision(current.data, body.expectedRevision);
      insist(
        current.latestActionId === body.latestActionId,
        409,
        'UNDO_CONFLICT',
        'Only the latest eligible action can be undone.',
      );
      const previous = current.data.history.find(
        (entry) => entry.id === body.latestActionId && entry.kind === 'resolve' && !entry.undone,
      );
      insist(previous, 409, 'NOTHING_TO_UNDO', 'There is no eligible action to undo.');
      applyChanges(current.data, previous.changes, true);
      previous.undone = true;
      const review = current.reviewUndos[previous.id];
      if (review) {
        const caseFile = current.data.cases.find((item) => item.id === review.caseId);
        if (caseFile) caseFile.status = review.status as 'open' | 'kept' | 'deferred' | 'resolved';
      }
      current.pendingFindings = {};
      current.data.revision++;
      current.data.history.push({
        id: body.actionId,
        label: `Undo: ${previous.label}`,
        changes: previous.changes.map((change) => ({
          ...change,
          before: change.after,
          after: change.before,
        })),
        createdAt,
        revision: current.data.revision,
        undone: false,
        kind: 'undo',
      });
      const eligible = [...current.data.history]
        .reverse()
        .find((entry) => entry.kind === 'resolve' && !entry.undone);
      if (eligible) current.latestActionId = eligible.id;
      else delete current.latestActionId;
      current.receipts[body.actionId] = { fingerprint, revision: current.data.revision };
      refresh(current.data);
      return current;
    });
    response.json({ investigation: item.data, actionId: body.actionId });
  });
  return app;
}
