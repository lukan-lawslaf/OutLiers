import { Check, Fingerprint, Link2, Paperclip } from 'lucide-react';
import type { CaseFile, Investigation } from '../../../shared/contracts';

const appearances = {
  duplicate: { icon: Fingerprint, label: 'Repeated records' },
  alias: { icon: Paperclip, label: 'Names & aliases' },
  relationship: { icon: Link2, label: 'Missing connections' },
};

function evidenceCount(file: CaseFile): number {
  return new Set(
    file.evidence.flatMap((evidence) => evidence.rowIds.map((id) => `${evidence.tableId}:${id}`)),
  ).size;
}

export default function ClueBoard({
  investigation,
  selectedCaseId,
  onSelect,
}: {
  investigation: Investigation;
  selectedCaseId: string;
  onSelect: (id: string) => void;
}) {
  const visible = investigation.cases.slice(0, 6);
  const active =
    investigation.cases.find((file) => file.id === selectedCaseId) ??
    investigation.cases.find((file) => file.status === 'open') ??
    investigation.cases[0];

  return (
    <div className="scene-clueboard" aria-label="Pinned investigation clues">
      <div className="pinboard-heading">
        <span>THE EVIDENCE WALL</span>
        <span>{investigation.cases.length} CASE FILES</span>
      </div>
      <div className="pinboard-surface">
        {visible.length > 1 ? (
          <svg
            className="evidence-threads"
            viewBox="0 0 500 450"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d={visible
                .map(
                  (_, index) =>
                    `${index ? 'L' : 'M'}${index % 2 ? 375 : 125} ${75 + Math.floor(index / 2) * 145}`,
                )
                .join(' ')}
            />
          </svg>
        ) : null}
        {visible.length ? (
          <div className="pinned-clues">
            {visible.map((file, index) => {
              const { icon: Icon, label } = appearances[file.kind];
              const filed = file.status === 'resolved' || file.status === 'kept';
              const count = evidenceCount(file);
              return (
                <button
                  key={file.id}
                  className={`pinned-clue ${active?.id === file.id ? 'selected' : ''} ${file.status}`}
                  onClick={() => onSelect(file.id)}
                  aria-pressed={active?.id === file.id}
                >
                  <span className="evidence-pin" aria-hidden="true" />
                  <span className="pinned-clue-top">
                    <span>CLUE {String(index + 1).padStart(2, '0')}</span>
                    {filed ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      <Icon size={14} aria-hidden="true" />
                    )}
                  </span>
                  <strong>{file.title}</strong>
                  <span className="pinned-clue-kind">{label}</span>
                  <span className="pinned-clue-bottom">
                    {count} {count === 1 ? 'record' : 'records'}{' '}
                    <span>{file.status === 'open' ? 'UNSOLVED' : file.status.toUpperCase()}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="pinboard-empty">
            <Paperclip size={32} />
            <strong>No loose ends found.</strong>
            <span>Ask a question to find your next thread.</span>
          </div>
        )}
      </div>
      <div className="pinboard-caption">
        <Paperclip size={12} />
        <span>
          {investigation.cases.length > 6
            ? 'First six clues shown. Every case file is in the dossier.'
            : 'Choose a pinned clue. Inspect its records in the dossier.'}
        </span>
      </div>
    </div>
  );
}
