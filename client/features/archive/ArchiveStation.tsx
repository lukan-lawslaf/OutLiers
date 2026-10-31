import { Archive, ArrowDownToLine, Check, ChevronDown, Paperclip, Undo2 } from 'lucide-react';
import type { Investigation } from '../../../shared/contracts';
import type { ExportFormat } from '../../api';
import Evidence from '../../components/Evidence';
import EvidenceTable from '../../components/EvidenceTable';
import { latestUndoableAction } from '../../domain/records';
interface ArchiveStationProps {
  investigation: Investigation;
  busy: boolean;
  selectedTableId: string;
  onTableChange: (id: string) => void;
  onUndo: () => void;
  onExport: (format: ExportFormat, tableId?: string) => void;
}
export default function ArchiveStation({
  investigation,
  busy,
  selectedTableId,
  onTableChange,
  onUndo,
  onExport,
}: ArchiveStationProps) {
  const currentTable =
    investigation.tables.find((table) => table.id === selectedTableId) ?? investigation.tables[0];
  const latest = latestUndoableAction(investigation.history);
  return (
    <div className="archive-content">
      <div className="section-heading compact">
        <span className="eyebrow">The case, carefully kept</span>
        <h2>A record of good work.</h2>
        <p>Review your decisions, revisit your records, and take the clearer picture with you.</p>
      </div>
      <div className="archive-stats">
        <div>
          <strong>{investigation.stats.activeRows}</strong>
          <span>active records</span>
        </div>
        <div>
          <strong>{investigation.stats.changedRows}</strong>
          <span>records repaired</span>
        </div>
        <div>
          <strong>{investigation.stats.savedFindings}</strong>
          <span>saved findings</span>
        </div>
      </div>
      <div className="archive-section">
        <div className="subheading">
          <h3>Your case history</h3>
          <span className="tiny-label">REVISION {investigation.revision}</span>
        </div>
        {investigation.history.length ? (
          <ol className="history-list">
            {[...investigation.history].reverse().map((entry) => (
              <li key={entry.id} className={entry.undone ? 'undone' : ''}>
                <span className="history-dot">
                  {entry.kind === 'undo' ? <Undo2 size={12} /> : <Check size={12} />}
                </span>
                <div>
                  <strong>{entry.label}</strong>
                  <small>
                    {entry.changes.length} {entry.changes.length === 1 ? 'change' : 'changes'} ·
                    revision {entry.revision}
                    {entry.undone ? ' · undone' : ''}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="field-help">
            A fresh file. Your confirmed decisions will be recorded here.
          </p>
        )}
        <button className="button secondary" disabled={busy || !latest} onClick={onUndo}>
          <Undo2 size={15} /> Undo latest action
        </button>
      </div>
      {investigation.findings.length ? (
        <div className="archive-section">
          <h3>Pinned findings</h3>
          {investigation.findings.map((finding) => (
            <details className="saved-finding" key={finding.id}>
              <summary>
                <Paperclip size={15} />
                <strong>{finding.title}</strong>
                <ChevronDown size={14} />
              </summary>
              <p>{finding.description}</p>
              <Evidence refs={finding.evidence} tables={investigation.tables} />
            </details>
          ))}
        </div>
      ) : null}
      <div className="archive-section">
        <div className="subheading">
          <h3>The working records</h3>
          <span className="tiny-label">ORIGINALS PRESERVED</span>
        </div>
        <label className="field-label">
          Archive table
          <select
            value={currentTable?.id ?? ''}
            onChange={(event) => onTableChange(event.target.value)}
          >
            {investigation.tables.map((table) => (
              <option key={table.id} value={table.id}>
                {table.name}
              </option>
            ))}
          </select>
        </label>
        {currentTable ? <EvidenceTable key={currentTable.id} table={currentTable} all /> : null}
      </div>
      <div className="export-note">
        <span className="export-stamp" aria-hidden="true">
          <Archive size={26} strokeWidth={1.3} />
        </span>
        <h3>Take your case home.</h3>
        <p>Export committed records and your investigation report. Previews are never included.</p>
        <div className="export-actions">
          <button className="button primary" disabled={busy} onClick={() => onExport('xlsx')}>
            <ArrowDownToLine size={15} /> Download Excel workbook
          </button>
          <button className="text-button" disabled={busy} onClick={() => onExport('report')}>
            Download case report <ArrowDownToLine size={13} />
          </button>
          <button
            className="text-button"
            disabled={busy || !currentTable}
            onClick={() => onExport('csv', currentTable?.id)}
          >
            Download CSV <ArrowDownToLine size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
