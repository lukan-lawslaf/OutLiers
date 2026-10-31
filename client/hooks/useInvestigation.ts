import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AppConfig,
  CreateInvestigationRequest,
  DataAction,
  ImportResult,
  Investigation,
  PreviewResponse,
  QueryRequest,
  QueryResult,
} from '../../shared/contracts';
import { api, connect, RequestError, type ExportFormat } from '../api';
import { latestUndoableAction, validateUpload } from '../domain/records';
import { storageGet, storageKeys, storageSet } from '../utils/storage';

export interface PendingPreview {
  data: PreviewResponse;
  caseId?: string;
  actionId: string;
}

interface InvestigationEvents {
  onOpen: () => void;
  onNotice: (message: string) => void;
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Something interrupted the investigation. Please try again.';
}

/** Owns the server-confirmed case, request serialization, and idempotent mutation retries. */
export function useInvestigation({ onOpen, onNotice }: InvestigationEvents) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [booting, setBooting] = useState(true);
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [pending, setPending] = useState<PendingPreview | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const current = useRef<Investigation | null>(null);
  const inFlight = useRef(false);
  const undoRetry = useRef<{ revision: number; actionId: string } | null>(null);

  const commit = useCallback((next: Investigation, clearQuery = true) => {
    current.current = next;
    setInvestigation(next);
    storageSet(storageKeys.investigation, next.id);
    if (clearQuery) setQueryResult(null);
  }, []);

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const nextConfig = await connect();
        if (!active) return;
        setConfig(nextConfig);
        const id = storageGet(storageKeys.investigation);
        if (!id) return;
        try {
          const previous = await api.get(id);
          if (active) {
            commit(previous);
            onOpen();
          }
        } catch (reason) {
          if (reason instanceof RequestError && [401, 404].includes(reason.status)) {
            storageSet(storageKeys.investigation, '');
          } else if (active) {
            setError(errorText(reason));
          }
        }
      } catch (reason) {
        if (active) setError(errorText(reason));
      } finally {
        if (active) setBooting(false);
      }
    }
    void restore();
    return () => {
      active = false;
    };
  }, [commit, onOpen]);

  const run = useCallback(
    async (label: string, work: () => Promise<void>) => {
      // A ref closes the gap before React renders the disabled controls.
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(label);
      setError('');
      try {
        await work();
      } catch (reason) {
        if (reason instanceof RequestError && reason.status === 409 && current.current) {
          try {
            commit(await api.get(current.current.id));
            setPending(null);
            setError(
              'The case changed since this preview. The evidence has been refreshed; please review it again.',
            );
          } catch {
            setError(errorText(reason));
          }
        } else {
          setError(errorText(reason));
        }
      } finally {
        inFlight.current = false;
        setBusy('');
      }
    },
    [commit],
  );

  const importFiles = useCallback(
    (files: File[]) => {
      if (!files.length || inFlight.current) return;
      const problem = validateUpload(files);
      if (problem) {
        setError(problem);
        return;
      }
      void run('Reading your records', async () => setImported(await api.import(files)));
    },
    [run],
  );

  const openDemo = useCallback(
    (name: 'market' | 'club') => {
      void run(`Opening the ${name === 'market' ? 'market' : 'club'} records`, async () => {
        setImported(await api.demo(name));
      });
    },
    [run],
  );

  const create = useCallback(
    (body: CreateInvestigationRequest) => {
      void run('Preparing your case', async () => {
        commit(await api.create(body));
        setImported(null);
        setPending(null);
        onOpen();
        onNotice('Your case is open. Let’s follow the first thread.');
      });
    },
    [commit, onNotice, onOpen, run],
  );

  const preview = useCallback(
    (action: DataAction, caseId?: string) => {
      const active = current.current;
      if (!active) return;
      void run('Preparing your preview', async () => {
        const data = await api.preview(active.id, { expectedRevision: active.revision, action });
        setPending({ data, caseId, actionId: crypto.randomUUID() });
      });
    },
    [run],
  );

  const confirm = useCallback(() => {
    const active = current.current;
    if (!active || !pending) return;
    void run('Saving your decision', async () => {
      const response = await api.resolve(active.id, {
        expectedRevision: pending.data.revision,
        action: pending.data.action,
        actionId: pending.actionId,
        effectHash: pending.data.effectHash,
        ...(pending.caseId ? { caseId: pending.caseId } : {}),
      });
      commit(response.investigation);
      setPending(null);
      onNotice(
        pending.data.action.type === 'reviewCase'
          ? 'Decision filed. A thoughtful choice.'
          : 'A little clearer. Your repair is saved.',
      );
    });
  }, [commit, onNotice, pending, run]);

  const undo = useCallback(() => {
    const active = current.current;
    const latest = active && latestUndoableAction(active.history);
    if (!active || !latest) return;
    void run('Reopening the last action', async () => {
      if (undoRetry.current?.revision !== active.revision) {
        undoRetry.current = { revision: active.revision, actionId: crypto.randomUUID() };
      }
      const response = await api.undo(active.id, {
        expectedRevision: active.revision,
        latestActionId: latest.id,
        actionId: undoRetry.current.actionId,
      });
      commit(response.investigation);
      undoRetry.current = null;
      onNotice('The last action has been undone. Your history is preserved.');
    });
  }, [commit, onNotice, run]);

  const query = useCallback(
    (body: QueryRequest) => {
      const active = current.current;
      if (!active) return;
      void run('Following your question', async () =>
        setQueryResult(await api.query(active.id, body)),
      );
    },
    [run],
  );

  const saveFinding = useCallback(
    (id: string) => {
      const active = current.current;
      if (!active) return;
      void run('Filing your finding', async () => {
        commit(await api.saveFinding(active.id, id), false);
        onNotice('A new finding, safely pinned to your case.');
      });
    },
    [commit, onNotice, run],
  );

  const exportRecords = useCallback(
    (format: ExportFormat, tableId?: string) => {
      const active = current.current;
      if (!active) return;
      const label = { csv: 'CSV', xlsx: 'workbook', report: 'report' }[format];
      void run(`Preparing your ${label}`, async () => {
        await api.export(active.id, format, tableId);
        if (format === 'xlsx') onNotice('Your workbook is ready to take home.');
      });
    },
    [onNotice, run],
  );

  const reconnect = useCallback(() => {
    void run('Reconnecting', async () => setConfig(await connect()));
  }, [run]);

  return {
    config,
    booting,
    investigation,
    imported,
    pending,
    queryResult,
    busy,
    error,
    importFiles,
    openDemo,
    create,
    preview,
    confirm,
    undo,
    query,
    saveFinding,
    exportRecords,
    reconnect,
    clearError: useCallback(() => setError(''), []),
    discardImport: useCallback(() => setImported(null), []),
    closePreview: useCallback(() => {
      setPending(null);
      setError('');
    }, []),
  };
}
