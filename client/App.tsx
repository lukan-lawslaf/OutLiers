import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  Archive,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  FileSpreadsheet,
  Fingerprint,
  FolderOpen,
  GitBranch,
  Leaf,
  Link2,
  LoaderCircle,
  MessageCircle,
  Microscope,
  Paperclip,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SkipForward,
  Undo2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  LIMITS,
  type AppConfig,
  type CaseFile,
  type Cell,
  type CreateInvestigationRequest,
  type DataAction,
  type DataTable,
  type EvidenceRef,
  type ImportResult,
  type Investigation,
  type Mode,
  type PreviewResponse,
  type QueryOperation,
  type QueryResult,
  type Station,
} from '../shared/contracts';
import { api, connect, RequestError } from './api';
import EvidenceTable, { cellText } from './components/EvidenceTable';
import Intro from './components/Intro';

const Office = lazy(() => import('./components/Office'));
const stationInfo = {
  desk: { label: 'Desk', subtitle: 'Start a case', icon: FolderOpen },
  board: { label: 'Evidence board', subtitle: 'Follow the clues', icon: GitBranch },
  archive: { label: 'Archive', subtitle: 'Your work, kept safe', icon: Archive },
};
const modeInfo = {
  guided: { title: 'Guided', icon: BookOpen },
  open: { title: 'Open', icon: MessageCircle },
  discovery: { title: 'Discovery', icon: Microscope },
};
const kindInfo = {
  duplicate: { label: 'Repeated records', icon: Fingerprint },
  alias: { label: 'Names & aliases', icon: Paperclip },
  relationship: { label: 'Missing connections', icon: Link2 },
};
const operations: { id: QueryOperation; label: string; note: string }[] = [
  { id: 'profile', label: 'Profile a table', note: 'Get to know your records' },
  { id: 'group_count', label: 'Count by category', note: 'See what belongs together' },
  { id: 'find_duplicates', label: 'Find repeated values', note: 'Look for familiar faces' },
  { id: 'trace_links', label: 'Trace table connections', note: 'Follow a reference' },
];
function storageGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Private browsing may disable local storage. */
  }
}
function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Something interrupted the investigation. Please try again.';
}
function playChime() {
  try {
    const audio = new AudioContext();
    const gain = audio.createGain();
    gain.connect(audio.destination);
    gain.gain.setValueAtTime(0.045, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.6);
    [523.25, 659.25].forEach((frequency, i) => {
      const oscillator = audio.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(audio.currentTime + i * 0.1);
      oscillator.stop(audio.currentTime + 0.6);
    });
    setTimeout(() => void audio.close(), 800);
  } catch {
    /* Sound is an optional flourish. */
  }
}
function Spinner() {
  return <LoaderCircle className="spin" size={16} aria-hidden="true" />;
}
function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div className="empty-note">
      <Paperclip size={22} />
      <p>{children}</p>
    </div>
  );
}

function Evidence({ refs, tables }: { refs: EvidenceRef[]; tables: DataTable[] }) {
  return (
    <div className="evidence-stack">
      {refs.map((ref, index) => {
        const table = tables.find((entry) => entry.id === ref.tableId);
        return table ? (
          <div key={`${ref.tableId}-${index}`}>
            <p className="evidence-explanation">{ref.explanation}</p>
            <EvidenceTable table={table} evidence={ref} />
          </div>
        ) : null;
      })}
    </div>
  );
}

function ImportSetup({
  data,
  busy,
  onCreate,
  onBack,
}: {
  data: ImportResult;
  busy: boolean;
  onCreate: (body: CreateInvestigationRequest) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState(
    data.tables.length <= 2 ? data.tables.map((table) => table.id) : [],
  );
  const [title, setTitle] = useState('The Maplewick case');
  const [identityTable, setIdentityTable] = useState(data.tables[0]?.id ?? '');
  const [identityColumn, setIdentityColumn] = useState('');
  const [linked, setLinked] = useState(false);
  const [parentId, setParentId] = useState(data.tables[0]?.id ?? '');
  const [parentColumn, setParentColumn] = useState('');
  const [childColumn, setChildColumn] = useState('');
  const tables = data.tables.filter((table) => selected.includes(table.id));
  const identity = tables.find((table) => table.id === identityTable) ?? tables[0];
  const parent = tables.find((table) => table.id === parentId) ?? tables[0];
  const child = tables.find((table) => table.id !== parent?.id);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onCreate({
      importId: data.id,
      tableIds: selected,
      title: title.trim() || 'The Maplewick case',
      ...(identity &&
      identityColumn &&
      identity.columns.some((column) => column.id === identityColumn)
        ? { identity: { tableId: identity.id, columnId: identityColumn } }
        : {}),
      ...(linked && parent && child
        ? {
            join: {
              parentTableId: parent.id,
              parentColumnId: parentColumn,
              childTableId: child.id,
              childColumnId: childColumn,
            },
          }
        : {}),
    });
  };
  return (
    <form className="setup-form" onSubmit={submit}>
      <button type="button" className="text-button" onClick={onBack}>
        <ArrowLeft size={14} /> Choose different records
      </button>
      <div className="section-heading">
        <span className="eyebrow">Arrange the case file</span>
        <h2>A place for every piece.</h2>
        <p>Choose your tables, then tell us which names and connections to investigate.</p>
      </div>
      <label className="field-label">
        Case title
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} />
      </label>
      <fieldset>
        <legend>
          Selected tables <span className="optional">{selected.length}/2</span>
        </legend>
        <div className="table-options">
          {data.tables.map((table) => (
            <label
              className={`table-option ${selected.includes(table.id) ? 'selected' : ''}`}
              key={table.id}
            >
              <input
                type="checkbox"
                checked={selected.includes(table.id)}
                disabled={!selected.includes(table.id) && selected.length >= 2}
                onChange={(event) => {
                  setSelected(
                    event.target.checked
                      ? [...selected, table.id]
                      : selected.filter((id) => id !== table.id),
                  );
                  setIdentityColumn('');
                  setParentColumn('');
                  setChildColumn('');
                }}
              />
              <FileSpreadsheet size={22} />
              <span>
                <strong>{table.name}</strong>
                <small>
                  {table.rows.length} records · {table.columns.length} columns
                </small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {data.warnings.length ? (
        <div className="notice">
          {data.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
      <fieldset>
        <legend>
          <Fingerprint size={14} /> Names & aliases <span className="optional">optional</span>
        </legend>
        <p className="field-help">
          Select a name column to spot spelling variations. You decide which names belong together.
        </p>
        <div className="form-grid">
          <label className="field-label">
            Identity table
            <select
              value={identity?.id ?? ''}
              onChange={(event) => {
                setIdentityTable(event.target.value);
                setIdentityColumn('');
              }}
            >
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Identity column
            <select
              value={identityColumn}
              onChange={(event) => setIdentityColumn(event.target.value)}
            >
              <option value="">No name matching</option>
              {identity?.columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>
          <Link2 size={14} /> Table connections <span className="optional">optional</span>
        </legend>
        <label className="check-label">
          <input
            type="checkbox"
            checked={linked && tables.length === 2}
            disabled={tables.length !== 2}
            onChange={(event) => setLinked(event.target.checked)}
          />{' '}
          Connect two tables
        </label>
        <p className="field-help">
          A parent key identifies a record; a child reference points to it. Select two tables to
          connect them.
        </p>
        {linked && tables.length === 2 ? (
          <div className="join-fields">
            <div className="form-grid">
              <label className="field-label">
                Parent table
                <select
                  value={parent?.id ?? ''}
                  onChange={(event) => {
                    setParentId(event.target.value);
                    setParentColumn('');
                    setChildColumn('');
                  }}
                >
                  {tables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Parent key
                <select
                  value={parentColumn}
                  onChange={(event) => setParentColumn(event.target.value)}
                  required
                >
                  <option value="">Select a column</option>
                  {parent?.columns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="join-arrow">
              <Link2 size={16} />
              <span>connects to</span>
            </div>
            <div className="form-grid">
              <label className="field-label">
                Child table
                <select value={child?.id ?? ''} aria-readonly="true" onChange={() => undefined}>
                  {child ? <option value={child.id}>{child.name}</option> : null}
                </select>
              </label>
              <label className="field-label">
                Child reference
                <select
                  value={childColumn}
                  onChange={(event) => setChildColumn(event.target.value)}
                  required
                >
                  <option value="">Select a column</option>
                  {child?.columns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ) : null}
      </fieldset>
      <button
        className="button primary full"
        disabled={
          busy ||
          !selected.length ||
          (linked && tables.length === 2 && (!parentColumn || !childColumn))
        }
      >
        {busy ? <Spinner /> : <Search size={17} />} Begin investigation <ArrowRight size={16} />
      </button>
    </form>
  );
}

function CaseInspector({
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

function QueryDesk({
  mode,
  investigation,
  busy,
  result,
  onQuery,
  onSave,
}: {
  mode: 'open' | 'discovery';
  investigation: Investigation;
  busy: boolean;
  result: QueryResult | null;
  onQuery: (body: {
    mode: 'open' | 'discovery';
    prompt?: string;
    operation?: QueryOperation;
    tableId?: string;
    columnId?: string;
  }) => void;
  onSave: (id: string) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [operation, setOperation] = useState<QueryOperation>('profile');
  const [tableId, setTableId] = useState(investigation.tables[0]?.id ?? '');
  const [columnId, setColumnId] = useState('');
  const table = investigation.tables.find((entry) => entry.id === tableId);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onQuery({
      mode,
      ...(mode === 'open' ? { prompt } : { operation }),
      tableId,
      ...(columnId ? { columnId } : {}),
    });
  };
  return (
    <div className="query-desk">
      <form onSubmit={submit}>
        <div className="section-heading compact">
          <span className="eyebrow">
            {mode === 'open' ? 'A question worth asking' : 'Your magnifying glass'}
          </span>
          <h3>{mode === 'open' ? 'Ask the records.' : 'Find your own thread.'}</h3>
          <p>
            {mode === 'open'
              ? 'Ask about a profile, category counts, repeated values, or table connections.'
              : 'Choose a real operation. The evidence comes straight from your active records.'}
          </p>
        </div>
        {mode === 'open' ? (
          <label className="field-label">
            Your question
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Which names appear more than once?"
              rows={3}
              required
              maxLength={500}
            />
          </label>
        ) : (
          <label className="field-label">
            Investigation operation
            <select
              value={operation}
              onChange={(event) => setOperation(event.target.value as QueryOperation)}
            >
              {operations.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="form-grid">
          <label className="field-label">
            Query table
            <select
              value={tableId}
              onChange={(event) => {
                setTableId(event.target.value);
                setColumnId('');
              }}
            >
              {investigation.tables.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Query column
            <select value={columnId} onChange={(event) => setColumnId(event.target.value)}>
              <option value="">All columns / automatic</option>
              {table?.columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="button primary" disabled={busy}>
          {busy ? <Spinner /> : <Search size={16} />}{' '}
          {mode === 'open' ? 'Ask the records' : 'Investigate'}
        </button>
      </form>
      {result ? (
        <div className="query-result">
          <div className="result-heading">
            <span className="eyebrow">What the records tell us</span>
            <span className="tiny-label">
              {result.aiStatus === 'available'
                ? 'AI-assisted · verified operation'
                : 'Deterministic analysis'}
            </span>
          </div>
          <p className="query-answer">{result.answer}</p>
          {result.groups?.length ? (
            <div className="group-results">
              {result.groups.map((group, i) => (
                <div key={`${group.label}-${i}`}>
                  <span>{group.label}</span>
                  <strong>{group.count}</strong>
                </div>
              ))}
            </div>
          ) : null}
          <Evidence refs={result.evidence} tables={investigation.tables} />
          {result.finding ? (
            <button
              className="button secondary"
              disabled={
                busy || investigation.findings.some((finding) => finding.id === result.finding?.id)
              }
              onClick={() => result.finding && onSave(result.finding.id)}
            >
              <Paperclip size={15} />{' '}
              {investigation.findings.some((finding) => finding.id === result.finding?.id)
                ? 'Finding saved'
                : 'Save finding'}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="integrity-note">
          <CircleHelp size={13} /> Questions explore records; they never change them.
        </p>
      )}
    </div>
  );
}

interface PendingPreview {
  data: PreviewResponse;
  caseId?: string;
  actionId: string;
}
function PreviewDialog({
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

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [booting, setBooting] = useState(true);
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [station, setStation] = useState<Station>('desk');
  const [mode, setMode] = useState<Mode>('guided');
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [pending, setPending] = useState<PendingPreview | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [toast, setToast] = useState('');
  const [sound, setSound] = useState(false);
  const [reduced, setReduced] = useState(
    () =>
      storageGet('maplewick.motion.v1') === 'reduced' ||
      (storageGet('maplewick.motion.v1') !== 'full' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  );
  const [flat, setFlat] = useState(() => storageGet('maplewick.office.v1') === 'flat');
  const [showIntro, setShowIntro] = useState(
    () =>
      !storageGet('maplewick.intro.v1') &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [archiveTable, setArchiveTable] = useState('');
  const uploadInput = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const undoRetry = useRef<{ revision: number; id: string } | null>(null);
  const finishIntro = useCallback(() => {
    storageSet('maplewick.intro.v1', 'seen');
    setShowIntro(false);
  }, []);
  const navigate = useCallback((next: Station) => {
    setStation(next);
    setError('');
  }, []);
  useEffect(() => {
    let active = true;
    void connect()
      .then(async (next) => {
        if (!active) return;
        setConfig(next);
        const id = storageGet('maplewick.case.v1');
        if (id) {
          try {
            const saved = await api.get(id);
            if (active) {
              setInvestigation(saved);
              setStation('board');
            }
          } catch {
            /* An expired local session starts a new case. */
          }
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(errorText(reason));
      })
      .finally(() => {
        if (active) setBooting(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (reduced && showIntro) finishIntro();
  }, [reduced, showIntro, finishIntro]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        pending ||
        showIntro ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        target.matches('input, textarea, select, [contenteditable="true"]')
      )
        return;
      const next = ({ '1': 'desk', '2': 'board', '3': 'archive' } as Record<string, Station>)[
        event.key
      ];
      if (next) {
        event.preventDefault();
        navigate(next);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [navigate, pending, showIntro]);
  const saved = (next: Investigation) => {
    setInvestigation(next);
    storageSet('maplewick.case.v1', next.id);
    setResult(null);
  };
  const celebrate = (message: string) => {
    setAnnouncement(message);
    setToast(message);
    if (sound) playChime();
  };
  const run = async (label: string, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(label);
    setError('');
    try {
      await work();
    } catch (reason) {
      if (reason instanceof RequestError && reason.status === 409 && investigation) {
        try {
          saved(await api.get(investigation.id));
          setPending(null);
          setError(
            'The case changed since this preview. The evidence has been refreshed; please review it again.',
          );
        } catch {
          setError(errorText(reason));
        }
      } else setError(errorText(reason));
    } finally {
      setBusy('');
    }
  };
  const importFiles = (files: File[]) => {
    if (!files.length) return;
    if (files.length > LIMITS.maxFiles) {
      setError('Choose at most two CSV or Excel files.');
      return;
    }
    if (files.some((file) => !/\.(csv|xlsx)$/i.test(file.name))) {
      setError('The agency accepts .csv and .xlsx files.');
      return;
    }
    if (files.some((file) => file.size > LIMITS.maxFileBytes)) {
      setError('Each file must be 2 MB or smaller.');
      return;
    }
    void run('Reading your records', async () => {
      setImported(await api.import(files));
    });
  };
  const begin = (body: CreateInvestigationRequest) =>
    void run('Preparing your case', async () => {
      const next = await api.create(body);
      saved(next);
      setImported(null);
      setSelectedCaseId('');
      navigate('board');
      celebrate('Your case is open. Let’s follow the first thread.');
    });
  const preview = (action: DataAction, caseId?: string) => {
    if (!investigation) return;
    void run('Preparing your preview', async () => {
      const data = await api.preview(investigation.id, {
        expectedRevision: investigation.revision,
        action,
      });
      setPending({ data, caseId, actionId: crypto.randomUUID() });
    });
  };
  const confirm = () => {
    if (!investigation || !pending) return;
    void run('Saving your decision', async () => {
      const response = await api.resolve(investigation.id, {
        expectedRevision: pending.data.revision,
        action: pending.data.action,
        actionId: pending.actionId,
        effectHash: pending.data.effectHash,
        ...(pending.caseId ? { caseId: pending.caseId } : {}),
      });
      saved(response.investigation);
      setPending(null);
      celebrate(
        pending.data.action.type === 'reviewCase'
          ? 'Decision filed. A thoughtful choice.'
          : 'A little clearer. Your repair is saved.',
      );
    });
  };
  const latest = investigation?.history
    .filter((entry) => entry.kind === 'resolve' && !entry.undone)
    .at(-1);
  const undo = () => {
    if (!investigation || !latest) return;
    void run('Reopening the last action', async () => {
      if (undoRetry.current?.revision !== investigation.revision)
        undoRetry.current = { revision: investigation.revision, id: crypto.randomUUID() };
      const response = await api.undo(investigation.id, {
        expectedRevision: investigation.revision,
        latestActionId: latest.id,
        actionId: undoRetry.current.id,
      });
      saved(response.investigation);
      undoRetry.current = null;
      celebrate('The last action has been undone. Your history is preserved.');
    });
  };
  const activeCase =
    investigation?.cases.find((file) => file.id === selectedCaseId) ??
    investigation?.cases.find((file) => file.status === 'open') ??
    investigation?.cases[0];
  const currentTable =
    investigation?.tables.find((table) => table.id === archiveTable) ?? investigation?.tables[0];
  const isBusy = !!busy;
  const boardCount = investigation?.stats.openCases ?? 0;

  return (
    <div className={`app ${reduced ? 'reduced-motion' : ''} ${flat ? 'flat-mode' : ''}`}>
      <a className="skip-link" href="#case-panel">
        Skip to case controls
      </a>
      <div className="paper-grain" aria-hidden="true" />
      <header className="masthead" inert={showIntro || !!pending}>
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            navigate('desk');
          }}
          aria-label="Maplewick Records Agency, go to desk"
        >
          <span className="brand-seal">
            <Search size={25} strokeWidth={1.6} />
          </span>
          <span>
            <strong>Maplewick</strong>
            <small>RECORDS AGENCY</small>
          </span>
        </a>
        <div className="masthead-center">
          <span className="edition-line" />
          <span>THE DATA DETECTIVE CASEFILES</span>
          <span className="edition-line" />
        </div>
        <div className="header-tools">
          <span className="agency-open">
            <i /> {booting ? 'Opening the agency' : 'The agency is open'}
          </span>
          <button
            className="icon-button"
            onClick={() => setSound(!sound)}
            aria-label={sound ? 'Mute sound' : 'Enable sound'}
            aria-pressed={sound}
          >
            {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <details className="settings">
            <summary className="icon-button" aria-label="Office settings">
              <Settings2 size={17} />
            </summary>
            <div className="settings-popover">
              <strong>Make yourself comfortable.</strong>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={reduced}
                  onChange={(event) => {
                    setReduced(event.target.checked);
                    storageSet('maplewick.motion.v1', event.target.checked ? 'reduced' : 'full');
                  }}
                />{' '}
                Reduce motion
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={flat}
                  onChange={(event) => {
                    setFlat(event.target.checked);
                    storageSet('maplewick.office.v1', event.target.checked ? 'flat' : '3d');
                  }}
                />{' '}
                Use illustrated office
              </label>
              <small>Keyboard: 1 desk · 2 board · 3 archive</small>
              <span className="storage-label">
                {config?.authMode === 'firebase'
                  ? 'Private cloud case · Firebase'
                  : config?.authMode === 'session'
                    ? 'Hosted session · PostgreSQL'
                    : 'Local development session · file storage'}
              </span>
            </div>
          </details>
        </div>
      </header>

      <main className="agency-main" aria-busy={isBusy} inert={showIntro || !!pending}>
        <section className="office-stage" aria-label="Maplewick office">
          <div className="office-title">
            <span className="eyebrow">Welcome to your little corner of clarity</span>
            <h1>
              {station === 'desk' ? (
                <>
                  Good records.
                  <br />
                  <em>Great stories.</em>
                </>
              ) : station === 'board' ? (
                <>
                  A loose thread.
                  <br />
                  <em>A clearer picture.</em>
                </>
              ) : (
                <>
                  Carefully solved.
                  <br />
                  <em>Safely filed.</em>
                </>
              )}
            </h1>
            <p>
              {station === 'desk'
                ? 'Put the kettle on. There’s a case waiting for you.'
                : station === 'board'
                  ? 'Look closely. Every clue comes from your records.'
                  : 'Every decision has a story. Here’s yours.'}
            </p>
          </div>
          <div className="scene-container">
            <Suspense
              fallback={
                <div className="office-loading">
                  <Leaf size={30} />
                  <span>Letting the afternoon light in…</span>
                </div>
              }
            >
              <Office station={station} reduced={reduced} flat={flat} onNavigate={navigate} />
            </Suspense>
          </div>
          <div className="room-caption">
            <span className="compass" aria-hidden="true">
              ✦
            </span>
            <span>
              MAPLEWICK, SOMEWHERE QUIET
              <br />
              <small>Afternoon light. A fresh perspective.</small>
            </span>
          </div>
          {investigation ? (
            <div className="desk-case-tag">
              <Paperclip size={14} />
              <span>{investigation.title}</span>
              <span className="case-tag-revision">rev. {investigation.revision}</span>
            </div>
          ) : null}
        </section>

        <section
          id="case-panel"
          ref={panelRef}
          className={`case-panel paper station-${station}`}
          tabIndex={-1}
          aria-label={`${stationInfo[station].label} case controls`}
        >
          <div className="panel-running-head">
            <span>MAPLEWICK RECORDS AGENCY</span>
            <span>
              {station === 'desk'
                ? '01 / THE DESK'
                : station === 'board'
                  ? '02 / THE EVIDENCE'
                  : '03 / THE ARCHIVE'}
            </span>
          </div>
          {error && !pending ? (
            <div className="error-message" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => setError('')}
                aria-label="Dismiss error"
              >
                <X size={15} />
              </button>
              {!config && !booting ? (
                <button
                  className="text-button"
                  onClick={() =>
                    void run('Reconnecting', async () => {
                      setConfig(await connect());
                    })
                  }
                >
                  Reconnect
                </button>
              ) : null}
            </div>
          ) : null}
          {busy ? (
            <div className="busy-strip" role="status">
              <Spinner /> {busy}…
            </div>
          ) : null}

          {station === 'desk' ? (
            imported ? (
              <ImportSetup
                key={imported.id}
                data={imported}
                busy={isBusy}
                onCreate={begin}
                onBack={() => setImported(null)}
              />
            ) : (
              <div className="desk-content">
                <div className="letter-header">
                  <span className="tiny-label">AN INVITATION TO BE CURIOUS</span>
                  <span className="postmark" aria-hidden="true">
                    M<br />
                    <small>EST. 2026</small>
                  </span>
                </div>
                <div className="section-heading">
                  <span className="eyebrow">Your next case starts here</span>
                  <h2>
                    Some things just
                    <br />
                    need a closer look.
                  </h2>
                  <p>
                    A repeated name. A missing connection. A record that doesn’t quite belong. Bring
                    your data; we’ll help you untangle it.
                  </p>
                </div>
                <div
                  className="upload-zone"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (config && !busy) importFiles(Array.from(event.dataTransfer.files));
                  }}
                >
                  <div className="upload-illustration">
                    <FileSpreadsheet size={33} strokeWidth={1.3} />
                    <span>
                      <Plus size={13} />
                    </span>
                  </div>
                  <strong>Leave your records on the desk.</strong>
                  <p>CSV or Excel · up to 2 tables · 500 rows each</p>
                  <input
                    ref={uploadInput}
                    className="sr-only"
                    type="file"
                    accept=".csv,.xlsx"
                    multiple
                    aria-label="Import CSV or Excel files"
                    disabled={!config || isBusy}
                    onChange={(event) => {
                      importFiles(Array.from(event.target.files ?? []));
                      event.target.value = '';
                    }}
                  />
                  <button
                    className="button primary"
                    disabled={!config || isBusy}
                    onClick={() => uploadInput.current?.click()}
                  >
                    <Upload size={16} /> Bring your own data
                  </button>
                  <small>20 columns per table · 2 MB per file</small>
                </div>
                <div className="or-divider">
                  <span /> OR OPEN A PRACTICE CASE <span />
                </div>
                <div className="demo-cases">
                  <button
                    className="demo-card"
                    disabled={!config || isBusy}
                    onClick={() =>
                      void run('Opening the market records', async () =>
                        setImported(await api.demo('market')),
                      )
                    }
                    aria-label="Open Maplewick Market"
                  >
                    <span className="demo-drawing market" aria-hidden="true">
                      ✿
                    </span>
                    <span>
                      <small>CASE NO. 001</small>
                      <strong>The corner market</strong>
                      <span>Customers, orders & familiar names</span>
                    </span>
                    <ArrowRight size={18} />
                  </button>
                  <button
                    className="demo-card"
                    disabled={!config || isBusy}
                    onClick={() =>
                      void run('Opening the club records', async () =>
                        setImported(await api.demo('club')),
                      )
                    }
                    aria-label="Open community club"
                  >
                    <span className="demo-drawing club" aria-hidden="true">
                      <Leaf size={28} strokeWidth={1.3} />
                    </span>
                    <span>
                      <small>CASE NO. 002</small>
                      <strong>The community club</strong>
                      <span>Members, sign-ups & loose ends</span>
                    </span>
                    <ArrowRight size={18} />
                  </button>
                </div>
                {investigation ? (
                  <button
                    className="button secondary full resume-button"
                    onClick={() => navigate('board')}
                  >
                    <FolderOpen size={16} /> Return to {investigation.title}
                    <ArrowRight size={15} />
                  </button>
                ) : null}
                <p className="desk-footnote">
                  <ShieldCheck size={14} /> Your original records always remain untouched.
                </p>
              </div>
            )
          ) : null}

          {station === 'board' ? (
            investigation ? (
              <div className="board-content">
                <div className="section-heading compact">
                  <span className="eyebrow">{investigation.title}</span>
                  <h2>Follow the loose threads.</h2>
                  <p>Thoughtful decisions. Clearer records. One clue at a time.</p>
                </div>
                <div className="case-progress">
                  <span>
                    <strong>{investigation.stats.resolvedCases}</strong> cases resolved
                  </span>
                  <span>
                    {boardCount} still open{' '}
                    <span className="progress-dots" aria-hidden="true">
                      {Array.from({ length: Math.min(8, investigation.cases.length) }, (_, i) => (
                        <i
                          key={i}
                          className={i < investigation.stats.resolvedCases ? 'filled' : ''}
                        />
                      ))}
                    </span>
                  </span>
                </div>
                <div className="mode-switch" role="group" aria-label="Investigation mode">
                  {(Object.keys(modeInfo) as Mode[]).map((entry) => {
                    const Icon = modeInfo[entry].icon;
                    return (
                      <button
                        key={entry}
                        className={mode === entry ? 'active' : ''}
                        aria-pressed={mode === entry}
                        onClick={() => setMode(entry)}
                      >
                        <Icon size={14} />
                        {modeInfo[entry].title}
                      </button>
                    );
                  })}
                </div>
                {mode === 'guided' ? (
                  <>
                    {investigation.cases.length ? (
                      <>
                        <div className="clue-index" role="group" aria-label="Case files">
                          {investigation.cases.map((file, index) => (
                            <button
                              key={file.id}
                              className={`clue-tab ${activeCase?.id === file.id ? 'active' : ''} ${file.status}`}
                              onClick={() => setSelectedCaseId(file.id)}
                              aria-pressed={activeCase?.id === file.id}
                            >
                              <span className="clue-number">
                                {file.status === 'resolved' || file.status === 'kept' ? (
                                  <Check size={13} />
                                ) : (
                                  String(index + 1).padStart(2, '0')
                                )}
                              </span>
                              <span>{file.title}</span>
                              <span className="clue-dot" />
                            </button>
                          ))}
                        </div>
                        {activeCase ? (
                          <CaseInspector
                            key={`${activeCase.id}-${investigation.revision}`}
                            file={activeCase}
                            investigation={investigation}
                            busy={isBusy}
                            onPreview={preview}
                          />
                        ) : null}
                      </>
                    ) : (
                      <EmptyNote>
                        No loose ends found. Explore your records in Open or Discovery mode to save
                        a finding.
                      </EmptyNote>
                    )}
                  </>
                ) : (
                  <QueryDesk
                    key={`${mode}-${investigation.id}`}
                    mode={mode}
                    investigation={investigation}
                    busy={isBusy}
                    result={result}
                    onQuery={(body) =>
                      void run('Following your question', async () =>
                        setResult(await api.query(investigation.id, body)),
                      )
                    }
                    onSave={(id) =>
                      void run('Filing your finding', async () => {
                        const next = await api.saveFinding(investigation.id, id);
                        setInvestigation(next);
                        celebrate('A new finding, safely pinned to your case.');
                      })
                    }
                  />
                )}
                <div className="panel-footnote">
                  <span>
                    <ShieldCheck size={12} /> Original records preserved
                  </span>
                  <button className="text-button" onClick={() => navigate('archive')}>
                    Visit the archive <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="no-case">
                <span className="empty-emblem">
                  <Search size={35} strokeWidth={1.2} />
                </span>
                <span className="eyebrow">A fresh piece of cork</span>
                <h2>
                  Every mystery
                  <br />
                  starts with a record.
                </h2>
                <p>
                  Bring a file to the desk or open a practice case. Your clues will appear right
                  here.
                </p>
                <button className="button primary" onClick={() => navigate('desk')}>
                  Go to the desk <ArrowRight size={16} />
                </button>
              </div>
            )
          ) : null}

          {station === 'archive' ? (
            investigation ? (
              <div className="archive-content">
                <div className="section-heading compact">
                  <span className="eyebrow">The case, carefully kept</span>
                  <h2>A record of good work.</h2>
                  <p>
                    Review your decisions, revisit your records, and take the clearer picture with
                    you.
                  </p>
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
                              {entry.changes.length}{' '}
                              {entry.changes.length === 1 ? 'change' : 'changes'} · revision{' '}
                              {entry.revision}
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
                  <button className="button secondary" disabled={isBusy || !latest} onClick={undo}>
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
                      onChange={(event) => setArchiveTable(event.target.value)}
                    >
                      {investigation.tables.map((table) => (
                        <option key={table.id} value={table.id}>
                          {table.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {currentTable ? (
                    <EvidenceTable key={currentTable.id} table={currentTable} all />
                  ) : null}
                </div>
                <div className="export-note">
                  <span className="export-stamp" aria-hidden="true">
                    <Archive size={26} strokeWidth={1.3} />
                  </span>
                  <h3>Take your case home.</h3>
                  <p>
                    Export committed records and your investigation report. Previews are never
                    included.
                  </p>
                  <div className="export-actions">
                    <button
                      className="button primary"
                      disabled={isBusy}
                      onClick={() =>
                        void run('Preparing your workbook', async () => {
                          await api.export(investigation.id, 'xlsx');
                          celebrate('Your workbook is ready to take home.');
                        })
                      }
                    >
                      <ArrowDownToLine size={15} /> Download Excel workbook
                    </button>
                    <button
                      className="text-button"
                      disabled={isBusy}
                      onClick={() =>
                        void run('Preparing your report', async () =>
                          api.export(investigation.id, 'report'),
                        )
                      }
                    >
                      Download case report <ArrowDownToLine size={13} />
                    </button>
                    <button
                      className="text-button"
                      disabled={isBusy || !currentTable}
                      onClick={() =>
                        void run('Preparing your CSV', async () =>
                          api.export(investigation.id, 'csv', currentTable?.id),
                        )
                      }
                    >
                      Download CSV <ArrowDownToLine size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="no-case">
                <span className="empty-emblem">
                  <Archive size={36} strokeWidth={1.2} />
                </span>
                <span className="eyebrow">Room for something good</span>
                <h2>
                  Your story
                  <br />
                  will be kept here.
                </h2>
                <p>
                  Open a case at the desk. Every decision and discovery will have a place in the
                  archive.
                </p>
                <button className="button primary" onClick={() => navigate('desk')}>
                  Start a case <ArrowRight size={16} />
                </button>
              </div>
            )
          ) : null}
          <div className="paper-bottom">
            <span>WITH CARE & CURIOSITY</span>
            <Leaf size={13} />
            <span>MAPLEWICK · VOL. 01</span>
          </div>
        </section>
      </main>

      <footer className="agency-footer" inert={showIntro || !!pending}>
        <span className="footer-note">
          <Leaf size={13} /> A little order. A little wonder.
        </span>
        <nav className="station-nav" aria-label="Office stations">
          {(Object.keys(stationInfo) as Station[]).map((entry, index) => {
            const Icon = stationInfo[entry].icon;
            return (
              <button
                key={entry}
                className={station === entry ? 'active' : ''}
                aria-label={stationInfo[entry].label}
                aria-current={station === entry ? 'page' : undefined}
                onClick={() => navigate(entry)}
              >
                <span className="station-icon">
                  <Icon size={18} strokeWidth={1.6} />
                </span>
                <span>
                  <strong>{stationInfo[entry].label}</strong>
                  <small>{stationInfo[entry].subtitle}</small>
                </span>
                <kbd>{index + 1}</kbd>
                {entry === 'board' && boardCount > 0 ? (
                  <span className="nav-count">{boardCount}</span>
                ) : null}
              </button>
            );
          })}
        </nav>
        <span className="footer-edition">
          A QUIETER KIND
          <br />
          OF DETECTIVE GAME
        </span>
      </footer>
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
      {toast ? (
        <div className="toast" role="status">
          <span className="toast-check">
            <Check size={18} />
          </span>
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast('')}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
      {pending && investigation ? (
        <PreviewDialog
          pending={pending}
          investigation={investigation}
          busy={isBusy}
          error={error}
          onClose={() => {
            setPending(null);
            setError('');
          }}
          onConfirm={confirm}
        />
      ) : null}
      {showIntro ? <Intro onDone={finishIntro} /> : null}
    </div>
  );
}
