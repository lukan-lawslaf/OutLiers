import { useState } from 'react';
import {
  ArrowRight,
  CheckCheck,
  Fingerprint,
  Link2,
  Paperclip,
  ShieldCheck,
  SkipForward,
} from 'lucide-react';
import {
  type CaseFile,
  type Cell,
  type DataAction,
  type Investigation,
  LIMITS,
} from '../../../shared/contracts';
import Evidence from '../../components/Evidence';
import { cellText } from '../../components/EvidenceTable';

const kindInfo = {
  duplicate: { label: 'Repeated records', icon: Fingerprint },
  alias: { label: 'Names & aliases', icon: Paperclip },
  relationship: { label: 'Missing connections', icon: Link2 },
};

export default function CaseInspector({
  file,
  investigation,
  busy,
  onPreview,
}: {
  file: CaseFile;
  investigation: Investigation;
  busy: boolean;
  onPreview: (action: DataAction, caseId?: string) => void;
}) {
  const options = [file.action, ...(file.alternatives ?? [])].filter(
    (action): action is DataAction => !!action,
  );
  const [option, setOption] = useState(0);
  const action = options[option];
  const [value, setValue] = useState(action && 'value' in action ? String(action.value ?? '') : '');
  const [linkValue, setLinkValue] = useState<Cell | undefined>(
    action && 'value' in action ? action.value : undefined,
  );
  const parent = investigation.tables.find(
    (table) => table.id === investigation.join?.parentTableId,
  );
  const key = investigation.join?.parentColumnId;
  const linkTargets =
    parent && key
      ? [
          ...new Map(
            parent.rows
              .filter((row) => !row.excluded && row.values[key] !== null && row.values[key] !== '')
              .map((row) => [JSON.stringify(row.values[key]), row.values[key]]),
          ).values(),
        ]
      : [];
  const chosenAction =
    action?.type === 'canonicalizeAliases'
      ? { ...action, value: value.trim() }
      : action?.type === 'repairLinks'
        ? { ...action, value: linkValue ?? action.value }
        : action;
  const Icon = kindInfo[file.kind].icon;
  return (
    <article className="case-inspector">
      <div className="clue-meta">
        <span>
          <Icon size={14} /> {kindInfo[file.kind].label}
        </span>
        <span className={`status ${file.status}`}>
          {file.status === 'open' ? 'Unsolved' : file.status}
        </span>
      </div>
      <h3>{file.title}</h3>
      <p className="case-description">{file.description}</p>
      <Evidence refs={file.evidence} tables={investigation.tables} />
      {file.status === 'open' || file.status === 'deferred' ? (
        <>
          {options.length > 1 ? (
            <label className="field-label action-choice">
              Repair approach
              <select
                value={option}
                onChange={(event) => {
                  const index = Number(event.target.value);
                  setOption(index);
                  const next = options[index];
                  if (next && 'value' in next) {
                    setValue(String(next.value ?? ''));
                    setLinkValue(next.value);
                  }
                }}
              >
                {options.map((entry, index) => (
                  <option value={index} key={index}>
                    {entry.type === 'excludeRows'
                      ? `Exclude ${entry.rowIds.length} repeated ${entry.rowIds.length === 1 ? 'record' : 'records'}`
                      : 'value' in entry
                        ? `Use ${cellText(entry.value)}`
                        : 'Review this case'}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {action?.type === 'canonicalizeAliases' ? (
            <label className="field-label action-choice">
              Preferred spelling
              <input
                value={value}
                maxLength={LIMITS.maxCellLength}
                onChange={(event) => setValue(event.target.value)}
              />
              <small>This spelling will be used only for the records shown in the preview.</small>
            </label>
          ) : null}
          {action?.type === 'repairLinks' ? (
            <label className="field-label action-choice">
              Connect to existing parent
              <select
                value={JSON.stringify(linkValue ?? action.value)}
                onChange={(event) => setLinkValue(JSON.parse(event.target.value) as Cell)}
              >
                {linkTargets.map((target) => (
                  <option key={JSON.stringify(target)} value={JSON.stringify(target)}>
                    {cellText(target)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="case-actions">
            <button
              className="button primary"
              disabled={
                busy ||
                !chosenAction ||
                (chosenAction.type === 'canonicalizeAliases' && !chosenAction.value)
              }
              onClick={() => chosenAction && onPreview(chosenAction, file.id)}
            >
              Preview repair <ArrowRight size={15} />
            </button>
            <div className="secondary-actions">
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  onPreview({ type: 'reviewCase', caseId: file.id, outcome: 'keep' }, file.id)
                }
              >
                <ShieldCheck size={14} /> Keep as is
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  onPreview({ type: 'reviewCase', caseId: file.id, outcome: 'defer' }, file.id)
                }
              >
                <SkipForward size={14} /> Defer case
              </button>
            </div>
          </div>
          <p className="integrity-note">
            <ShieldCheck size={12} /> You’ll review every change. Originals stay safe.
          </p>
        </>
      ) : (
        <div className="case-filed">
          <CheckCheck size={19} />
          <span>
            {file.status === 'resolved'
              ? 'Repair saved to your case history.'
              : 'Your decision is saved.'}
          </span>
        </div>
      )}
    </article>
  );
}
