import { Router } from 'express';
import type { Store } from '../store.js';
import { z } from 'zod';
import type { AiStatus, QueryOperation, QueryRequest } from '../../shared/contracts.js';
import { querySchema, id } from '../validation.js';
import { owned, checkRevision } from '../access.js';
import { insist } from '../errors.js';
import { runQuery, refresh } from '../engine.js';
import { boundedPlan, type GeminiPlanner } from '../gemini.js';

function fallbackOperation(prompt: string): QueryOperation | undefined {
  if (/duplicate|matching records|repeat/i.test(prompt)) return 'find_duplicates';
  if (/link|reference|relationship|orphan/i.test(prompt)) return 'trace_links';
  if (/group|count.+by|how many.+(each|per)|breakdown/i.test(prompt)) return 'group_count';
  if (/profile|summari[sz]e|overview|blank|missing|how many|total|record/i.test(prompt))
    return 'profile';
  return undefined;
}
export function inquiriesRoutes(store: Store, planner: GeminiPlanner | null): Router {
  const app = Router();
  app.post('/api/investigations/:id/query', async (request, response) => {
    const body = querySchema.parse(request.body);
    const ownerId = response.locals['uid'] as string;
    const current = owned(await store.get(request.params['id']!), ownerId);
    let plan: QueryRequest = body;
    let aiStatus: AiStatus = planner ? 'available' : 'disabled';
    if (!body.operation) {
      insist(
        body.mode === 'open' && body.prompt,
        422,
        'QUERY_REQUIRED',
        'Choose an operation or enter a supported question.',
      );
      if (planner) {
        try {
          const proposed = await boundedPlan(planner, current.data, body.prompt);
          const table = current.data.tables.find((table) => table.id === proposed.tableId);
          insist(
            table &&
              (!proposed.columnId ||
                table.columns.some((column) => column.id === proposed.columnId)),
            400,
            'INVALID_PLAN',
            'The proposed query references unavailable data.',
          );
          plan = { ...body, ...proposed };
        } catch {
          aiStatus = 'offline';
          plan = { ...body, operation: fallbackOperation(body.prompt) };
        }
      } else plan = { ...body, operation: fallbackOperation(body.prompt) };
    }
    // Plans contain identifiers only; the deterministic engine validates all references and computes every result.
    const result = runQuery(current.data, plan);
    result.aiStatus = aiStatus;
    if (result.finding) {
      const finding = result.finding;
      await store.transact(current.data.id, (latest) => {
        owned(latest, ownerId);
        checkRevision(latest.data, current.data.revision);
        latest.pendingFindings[finding.id] = finding;
        const keys = Object.keys(latest.pendingFindings);
        for (const key of keys.slice(0, Math.max(0, keys.length - 30)))
          delete latest.pendingFindings[key];
        return latest;
      });
    }
    response.json(result);
  });
  app.post('/api/investigations/:id/findings', async (request, response) => {
    const body = z.object({ findingId: id }).strict().parse(request.body);
    const ownerId = response.locals['uid'] as string;
    const item = await store.transact(request.params['id']!, (current) => {
      owned(current, ownerId);
      if (current.data.findings.some((finding) => finding.id === body.findingId)) return current;
      const finding = current.pendingFindings[body.findingId];
      insist(finding, 404, 'FINDING_NOT_FOUND', 'Run a query before saving its finding.');
      current.data.findings.push(finding);
      delete current.pendingFindings[body.findingId];
      current.data.revision++;
      refresh(current.data);
      return current;
    });
    response.json(item.data);
  });
  return app;
}
