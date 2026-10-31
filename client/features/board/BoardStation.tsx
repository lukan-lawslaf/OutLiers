import { ArrowRight, BookOpen, Check, MessageCircle, Microscope, ShieldCheck } from 'lucide-react';
import type {
  DataAction,
  Investigation,
  Mode,
  QueryRequest,
  QueryResult,
} from '../../../shared/contracts';
import { EmptyNote } from '../../components/feedback';
import CaseInspector from './CaseInspector';
import QueryDesk from './QueryDesk';
const modeInfo = {
  guided: { title: 'Guided', icon: BookOpen },
  open: { title: 'Open', icon: MessageCircle },
  discovery: { title: 'Discovery', icon: Microscope },
};
interface BoardStationProps {
  investigation: Investigation;
  busy: boolean;
  mode: Mode;
  selectedCaseId: string;
  result: QueryResult | null;
  onModeChange: (mode: Mode) => void;
  onSelectCase: (id: string) => void;
  onPreview: (action: DataAction, caseId?: string) => void;
  onQuery: (body: QueryRequest) => void;
  onSave: (id: string) => void;
  onArchive: () => void;
}
export default function BoardStation({
  investigation,
  busy,
  mode,
  selectedCaseId,
  result,
  onModeChange,
  onSelectCase,
  onPreview,
  onQuery,
  onSave,
  onArchive,
}: BoardStationProps) {
  const boardCount = investigation.stats.openCases;
  const activeCase =
    investigation.cases.find((file) => file.id === selectedCaseId) ??
    investigation.cases.find((file) => file.status === 'open') ??
    investigation.cases[0];
  return (
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
              <i key={i} className={i < investigation.stats.resolvedCases ? 'filled' : ''} />
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
              onClick={() => onModeChange(entry)}
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
                    onClick={() => onSelectCase(file.id)}
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
                  busy={busy}
                  onPreview={onPreview}
                />
              ) : null}
            </>
          ) : (
            <EmptyNote>
              No loose ends found. Explore your records in Open or Discovery mode to save a finding.
            </EmptyNote>
          )}
        </>
      ) : (
        <QueryDesk
          key={`${mode}-${investigation.id}`}
          mode={mode}
          investigation={investigation}
          busy={busy}
          result={result}
          onQuery={onQuery}
          onSave={onSave}
        />
      )}
      <div className="panel-footnote">
        <span>
          <ShieldCheck size={12} /> Original records preserved
        </span>
        <button className="text-button" onClick={() => onArchive()}>
          Visit the archive <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
