import { useState, type FormEvent } from 'react';
import { CircleHelp, Paperclip, Search } from 'lucide-react';
import type { Investigation, QueryOperation, QueryResult } from '../../../shared/contracts';
import Evidence from '../../components/Evidence';
import { Spinner } from '../../components/feedback';

const operations: { id: QueryOperation; label: string; note: string }[] = [
  { id: 'profile', label: 'Profile a table', note: 'Get to know your records' }, { id: 'group_count', label: 'Count by category', note: 'See what belongs together' },
  { id: 'find_duplicates', label: 'Find repeated values', note: 'Look for familiar faces' }, { id: 'trace_links', label: 'Trace table connections', note: 'Follow a reference' },
];

export default function QueryDesk({ mode, investigation, busy, result, onQuery, onSave }: { mode: 'open' | 'discovery'; investigation: Investigation; busy: boolean; result: QueryResult | null; onQuery: (body: { mode: 'open' | 'discovery'; prompt?: string; operation?: QueryOperation; tableId?: string; columnId?: string }) => void; onSave: (id: string) => void }) {
  const [prompt, setPrompt] = useState('');
  const [operation, setOperation] = useState<QueryOperation>('profile');
  const [tableId, setTableId] = useState(investigation.tables[0]?.id ?? '');
  const [columnId, setColumnId] = useState('');
  const table = investigation.tables.find((entry) => entry.id === tableId);
  const submit = (event: FormEvent) => { event.preventDefault(); onQuery({ mode, ...(mode === 'open' ? { prompt } : { operation }), tableId, ...(columnId ? { columnId } : {}) }); };
  return <div className="query-desk"><form onSubmit={submit}>
    <div className="section-heading compact"><span className="eyebrow">{mode === 'open' ? 'A question worth asking' : 'Your magnifying glass'}</span><h3>{mode === 'open' ? 'Ask the records.' : 'Find your own thread.'}</h3><p>{mode === 'open' ? 'Ask about a profile, category counts, repeated values, or table connections.' : 'Choose a real operation. The evidence comes straight from your active records.'}</p></div>
    {mode === 'open' ? <label className="field-label">Your question<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Which names appear more than once?" rows={3} required maxLength={500} /></label> : <label className="field-label">Investigation operation<select value={operation} onChange={(event) => setOperation(event.target.value as QueryOperation)}>{operations.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>}
    <div className="form-grid"><label className="field-label">Query table<select value={tableId} onChange={(event) => { setTableId(event.target.value); setColumnId(''); }}>{investigation.tables.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><label className="field-label">Query column<select value={columnId} onChange={(event) => setColumnId(event.target.value)}><option value="">All columns / automatic</option>{table?.columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label></div>
    <button className="button primary" disabled={busy}>{busy ? <Spinner /> : <Search size={16} />} {mode === 'open' ? 'Ask the records' : 'Investigate'}</button>
  </form>{result ? <div className="query-result"><div className="result-heading"><span className="eyebrow">What the records tell us</span><span className="tiny-label">{result.aiStatus === 'available' ? 'AI-assisted · verified operation' : 'Deterministic analysis'}</span></div><p className="query-answer">{result.answer}</p>{result.groups?.length ? <div className="group-results">{result.groups.map((group, i) => <div key={`${group.label}-${i}`}><span>{group.label}</span><strong>{group.count}</strong></div>)}</div> : null}<Evidence refs={result.evidence} tables={investigation.tables} />{result.finding ? <button className="button secondary" disabled={busy || investigation.findings.some((finding) => finding.id === result.finding?.id)} onClick={() => result.finding && onSave(result.finding.id)}><Paperclip size={15} /> {investigation.findings.some((finding) => finding.id === result.finding?.id) ? 'Finding saved' : 'Save finding'}</button> : null}</div> : <p className="integrity-note"><CircleHelp size={13} /> Questions explore records; they never change them.</p>}</div>;
}
