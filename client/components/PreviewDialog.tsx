import { useEffect, useRef } from 'react';
import { ArrowLeft, Check, ShieldCheck, X } from 'lucide-react';
import type { Investigation } from '../../shared/contracts';
import type { PendingPreview } from '../hooks/useInvestigation';
import { cellText } from './EvidenceTable';
import { Spinner } from './feedback';

export default function PreviewDialog({
  pending,
  investigation,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  pending: PendingPreview;
  investigation: Investigation;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  const review = pending.data.action.type === 'reviewCase';
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="preview-dialog paper"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) onClose();
          if (event.key !== 'Tab') return;
          const elements = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), [href], input, select, textarea, [tabindex="0"]',
            ) ?? [],
          );
          const first = elements[0],
            last = elements.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <button
          className="icon-button dialog-close"
          aria-label="Close preview"
          disabled={busy}
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <span className="eyebrow">A careful detective checks twice</span>
        <h2 id="preview-title">Review this change.</h2>
        <p className="preview-summary">{pending.data.summary}</p>
        <div className="preview-badge">
          <ShieldCheck size={16} />
          <span>
            {review
              ? 'Your decision will be saved. No records will change.'
              : 'This is a preview. Your records have not changed.'}
          </span>
        </div>
        {pending.data.changes.length ? (
          <div
            className="table-scroll preview-table"
            tabIndex={0}
            role="region"
            aria-label="Proposed changes"
          >
            <table>
              <caption className="sr-only">Proposed before and after values</caption>
              <thead>
                <tr>
                  <th>Record</th>
                  <th>Field</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {pending.data.changes.map((change, i) => {
                  const table = investigation.tables.find((entry) => entry.id === change.tableId);
                  const rowNumber =
                    (table?.rows.findIndex((row) => row.id === change.rowId) ?? -1) + 1;
                  const name =
                    change.kind === 'excluded'
                      ? 'Included in clean data'
                      : (table?.columns.find((column) => column.id === change.columnId)?.name ??
                        change.columnId);
                  return (
                    <tr key={`${change.rowId}-${change.columnId}-${i}`}>
                      <th scope="row">
                        {table?.name} · {rowNumber}
                      </th>
                      <td>{name}</td>
                      <td className="before-value">
                        {change.kind === 'excluded'
                          ? change.before
                            ? 'Excluded'
                            : 'Included'
                          : cellText(change.before)}
                      </td>
                      <td className="after-value">
                        {change.kind === 'excluded'
                          ? change.after
                            ? 'Excluded'
                            : 'Included'
                          : cellText(change.after)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {pending.data.warnings.map((warning) => (
          <p className="notice" key={warning}>
            {warning}
          </p>
        ))}
        {error ? (
          <p className="error-message" role="alert">
            {error}
          </p>
        ) : null}
        <div className="dialog-actions">
          <button className="button secondary" disabled={busy} onClick={onClose}>
            <ArrowLeft size={15} /> Back to evidence
          </button>
          <button className="button primary" disabled={busy} onClick={onConfirm}>
            {busy ? <Spinner /> : <Check size={16} />} Confirm change
          </button>
        </div>
        <p className="integrity-note">
          Revision {pending.data.revision} · Originals preserved · Latest action can be undone
        </p>
      </div>
    </div>
  );
}
