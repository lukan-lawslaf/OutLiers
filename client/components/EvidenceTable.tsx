import { useState } from 'react';
import { ChevronLeft, ChevronRight, Table2 } from 'lucide-react';
import type { DataTable, EvidenceRef } from '../../shared/contracts';

export function cellText(value: unknown): string {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

export default function EvidenceTable({
  table,
  evidence,
  all = false,
}: {
  table: DataTable;
  evidence?: EvidenceRef;
  all?: boolean;
}) {
  const [page, setPage] = useState(0);
  const rows = all ? table.rows : table.rows.filter((row) => evidence?.rowIds.includes(row.id));
  const columns =
    all || !evidence?.columnIds.length
      ? table.columns
      : table.columns.filter((column) => evidence.columnIds.includes(column.id));
  const visibleColumns = columns.length ? columns : table.columns;
  const pageCount = Math.max(1, Math.ceil(rows.length / 8));
  const current = Math.min(page, pageCount - 1);
  return (
    <div className="evidence-table-wrap">
      <div className="table-caption">
        <span>
          <Table2 size={13} /> {table.name}
        </span>
        <span>
          {rows.length} {rows.length === 1 ? 'record' : 'records'}
        </span>
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={`${table.name} records`}>
        <table>
          <caption className="sr-only">
            {all ? 'Working records' : 'Evidence records'} from {table.name}
          </caption>
          <thead>
            <tr>
              <th scope="col">Record</th>
              {visibleColumns.map((column) => (
                <th scope="col" key={column.id}>
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(current * 8, current * 8 + 8).map((row) => (
              <tr key={row.id} className={row.excluded ? 'excluded-row' : ''}>
                <th scope="row">
                  {table.rows.indexOf(row) + 1}
                  {row.excluded ? <span className="sr-only"> excluded</span> : null}
                </th>
                {visibleColumns.map((column) => (
                  <td key={column.id}>{cellText(row.values[column.id])}</td>
                ))}
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={visibleColumns.length + 1}>No matching records.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {pageCount > 1 ? (
        <div className="pagination">
          <button
            className="icon-button"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
            aria-label={`Previous ${table.name} records`}
          >
            <ChevronLeft size={15} />
          </button>
          <span>
            Page {current + 1} of {pageCount}
          </span>
          <button
            className="icon-button"
            disabled={current === pageCount - 1}
            onClick={() => setPage(current + 1)}
            aria-label={`Next ${table.name} records`}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
