import type { DataTable, EvidenceRef } from '../../shared/contracts';
import EvidenceTable from './EvidenceTable';

export default function Evidence({ refs, tables }: { refs: EvidenceRef[]; tables: DataTable[] }) {
  return (
    <div className="evidence-stack">
      {refs.map((ref, index) => {
        const table = tables.find((entry) => entry.id === ref.tableId);
        return table ? (
          <div key={`${ref.tableId}-${index}`} className="evidence-exhibit">
            <div className="exhibit-label">
              <span>EXHIBIT {String(index + 1).padStart(2, '0')}</span>
              <span>FROM YOUR RECORDS</span>
            </div>
            <p className="evidence-explanation">{ref.explanation}</p>
            <EvidenceTable table={table} evidence={ref} />
          </div>
        ) : null;
      })}
    </div>
  );
}
