import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, FileSpreadsheet, Fingerprint, Link2, Search } from 'lucide-react';
import type { CreateInvestigationRequest, ImportResult } from '../../../shared/contracts';
import { Spinner } from '../../components/feedback';

export default function ImportSetup({ data, busy, onCreate, onBack }: { data: ImportResult; busy: boolean; onCreate: (body: CreateInvestigationRequest) => void; onBack: () => void }) {
  const [selected, setSelected] = useState(data.tables.length <= 2 ? data.tables.map((table) => table.id) : []);
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
    onCreate({ importId: data.id, tableIds: selected, title: title.trim() || 'The Maplewick case',
      ...(identity && identityColumn && identity.columns.some((column) => column.id === identityColumn) ? { identity: { tableId: identity.id, columnId: identityColumn } } : {}),
      ...(linked && parent && child ? { join: { parentTableId: parent.id, parentColumnId: parentColumn, childTableId: child.id, childColumnId: childColumn } } : {}),
    });
  };
  return <form className="setup-form" onSubmit={submit}>
    <button type="button" className="text-button" onClick={onBack}><ArrowLeft size={14} /> Choose different records</button>
    <div className="section-heading"><span className="eyebrow">Arrange the case file</span><h2>A place for every piece.</h2><p>Choose your tables, then tell us which names and connections to investigate.</p></div>
    <label className="field-label">Case title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} /></label>
    <fieldset><legend>Selected tables <span className="optional">{selected.length}/2</span></legend><div className="table-options">{data.tables.map((table) => <label className={`table-option ${selected.includes(table.id) ? 'selected' : ''}`} key={table.id}>
      <input type="checkbox" checked={selected.includes(table.id)} disabled={!selected.includes(table.id) && selected.length >= 2} onChange={(event) => { setSelected(event.target.checked ? [...selected, table.id] : selected.filter((id) => id !== table.id)); setIdentityColumn(''); setParentColumn(''); setChildColumn(''); }} />
      <FileSpreadsheet size={22} /><span><strong>{table.name}</strong><small>{table.rows.length} records · {table.columns.length} columns</small></span>
    </label>)}</div></fieldset>
    {data.warnings.length ? <div className="notice">{data.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
    <fieldset><legend><Fingerprint size={14} /> Names & aliases <span className="optional">optional</span></legend><p className="field-help">Select a name column to spot spelling variations. You decide which names belong together.</p><div className="form-grid">
      <label className="field-label">Identity table<select value={identity?.id ?? ''} onChange={(event) => { setIdentityTable(event.target.value); setIdentityColumn(''); }}>{tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</select></label>
      <label className="field-label">Identity column<select value={identityColumn} onChange={(event) => setIdentityColumn(event.target.value)}><option value="">No name matching</option>{identity?.columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>
    </div></fieldset>
    <fieldset><legend><Link2 size={14} /> Table connections <span className="optional">optional</span></legend><label className="check-label"><input type="checkbox" checked={linked && tables.length === 2} disabled={tables.length !== 2} onChange={(event) => setLinked(event.target.checked)} /> Connect two tables</label>
      <p className="field-help">A parent key identifies a record; a child reference points to it. Select two tables to connect them.</p>
      {linked && tables.length === 2 ? <div className="join-fields"><div className="form-grid"><label className="field-label">Parent table<select value={parent?.id ?? ''} onChange={(event) => { setParentId(event.target.value); setParentColumn(''); setChildColumn(''); }}>{tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</select></label><label className="field-label">Parent key<select value={parentColumn} onChange={(event) => setParentColumn(event.target.value)} required><option value="">Select a column</option>{parent?.columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label></div><div className="join-arrow"><Link2 size={16} /><span>connects to</span></div><div className="form-grid"><label className="field-label">Child table<select value={child?.id ?? ''} aria-readonly="true" onChange={() => undefined}>{child ? <option value={child.id}>{child.name}</option> : null}</select></label><label className="field-label">Child reference<select value={childColumn} onChange={(event) => setChildColumn(event.target.value)} required><option value="">Select a column</option>{child?.columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label></div></div> : null}
    </fieldset>
    <button className="button primary full" disabled={busy || !selected.length || (linked && tables.length === 2 && (!parentColumn || !childColumn))}>{busy ? <Spinner /> : <Search size={17} />} Begin investigation <ArrowRight size={16} /></button>
  </form>;
}
