import { useRef } from 'react';
import {
  ArrowRight,
  FileSpreadsheet,
  FolderOpen,
  Leaf,
  Plus,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import type {
  CreateInvestigationRequest,
  ImportResult,
  Investigation,
} from '../../../shared/contracts';
import ImportSetup from './ImportSetup';
interface DeskStationProps {
  investigation: Investigation | null;
  imported: ImportResult | null;
  ready: boolean;
  busy: boolean;
  onImport: (files: File[]) => void;
  onDemo: (name: 'market' | 'club') => void;
  onCreate: (body: CreateInvestigationRequest) => void;
  onBack: () => void;
  onResume: () => void;
}
export default function DeskStation({
  investigation,
  imported,
  ready,
  busy,
  onImport,
  onDemo,
  onCreate,
  onBack,
  onResume,
}: DeskStationProps) {
  const uploadInput = useRef<HTMLInputElement>(null);
  if (imported)
    return (
      <ImportSetup
        key={imported.id}
        data={imported}
        busy={busy}
        onCreate={onCreate}
        onBack={onBack}
      />
    );
  return (
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
          A repeated name. A missing connection. A record that doesn’t quite belong. Bring your
          data; we’ll help you untangle it.
        </p>
      </div>
      <div
        className="upload-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (ready && !busy) onImport(Array.from(event.dataTransfer.files));
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
          disabled={!ready || busy}
          onChange={(event) => {
            onImport(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
        <button
          className="button primary"
          disabled={!ready || busy}
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
        <button className="demo-card" disabled={!ready || busy} onClick={() => onDemo('market')}>
          <span className="demo-drawing market" aria-hidden="true">
            ✿
          </span>
          <span>
            <small>CASE NO. 001</small>
            <strong>Open Maplewick Market</strong>
            <span>Customers, orders & familiar names</span>
          </span>
          <ArrowRight size={18} />
        </button>
        <button className="demo-card" disabled={!ready || busy} onClick={() => onDemo('club')}>
          <span className="demo-drawing club" aria-hidden="true">
            <Leaf size={28} strokeWidth={1.3} />
          </span>
          <span>
            <small>CASE NO. 002</small>
            <strong>Open community club</strong>
            <span>Members, sign-ups & loose ends</span>
          </span>
          <ArrowRight size={18} />
        </button>
      </div>
      {investigation ? (
        <button className="button secondary full resume-button" onClick={() => onResume()}>
          <FolderOpen size={16} /> Return to {investigation.title}
          <ArrowRight size={15} />
        </button>
      ) : null}
      <p className="desk-footnote">
        <ShieldCheck size={14} /> Your original records always remain untouched.
      </p>
    </div>
  );
}
