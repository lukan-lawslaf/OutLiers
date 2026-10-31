import { useCallback, useEffect, useState } from 'react';
import { Check, Leaf, X } from 'lucide-react';
import type { Mode, Station } from '../shared/contracts';
import EmptyStation from './components/EmptyStation';
import Intro from './components/Intro';
import PreviewDialog from './components/PreviewDialog';
import { Spinner } from './components/feedback';
import ArchiveStation from './features/archive/ArchiveStation';
import BoardStation from './features/board/BoardStation';
import DeskStation from './features/desk/DeskStation';
import { useInvestigation } from './hooks/useInvestigation';
import { useCaseFeedback, useOfficePreferences } from './hooks/useOfficePreferences';
import AppHeader from './layout/AppHeader';
import OfficeStage from './layout/OfficeStage';
import StationNav from './layout/StationNav';
import { stationInfo } from './layout/stations';

export default function App() {
  const [station, setStation] = useState<Station>('desk');
  const [mode, setMode] = useState<Mode>('guided');
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [archiveTable, setArchiveTable] = useState('');
  const preferences = useOfficePreferences();
  const feedback = useCaseFeedback(preferences.sound);
  const openBoard = useCallback(() => {
    setStation('board');
    setSelectedCaseId('');
  }, []);
  const casework = useInvestigation({ onOpen: openBoard, onNotice: feedback.notify });
  const { clearError, investigation, imported, pending, config, booting, error, busy } = casework;
  const { reduced, flat, showIntro, finishIntro } = preferences;
  const isBusy = !!busy;
  const modalOpen = showIntro || !!pending;
  const navigate = useCallback(
    (next: Station) => {
      setStation(next);
      clearError();
    },
    [clearError],
  );

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        modalOpen ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (target instanceof HTMLElement &&
          target.closest('input, textarea, select, [contenteditable="true"]'))
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
  }, [modalOpen, navigate]);

  return (
    <div className={`app ${reduced ? 'reduced-motion' : ''} ${flat ? 'flat-mode' : ''}`}>
      <a className="skip-link" href="#case-panel" tabIndex={modalOpen ? -1 : undefined}>
        Skip to case controls
      </a>
      <div className="paper-grain" aria-hidden="true" />
      <AppHeader
        config={config}
        booting={booting}
        disabled={modalOpen}
        preferences={preferences}
        onDesk={() => navigate('desk')}
      />
      <main className="agency-main" aria-busy={isBusy} inert={modalOpen}>
        <OfficeStage
          station={station}
          investigation={investigation}
          reduced={reduced}
          flat={flat}
          opening={showIntro}
          onNavigate={navigate}
        />
        <section
          id="case-panel"
          className={`case-panel paper station-${station}`}
          tabIndex={-1}
          aria-label={`${stationInfo[station].label} case controls`}
        >
          <div className="panel-running-head">
            <span>MAPLEWICK RECORDS AGENCY</span>
            <span>{stationInfo[station].chapter}</span>
          </div>
          {error && !pending ? (
            <div className="error-message" role="alert">
              <span>{error}</span>
              <button className="icon-button" onClick={clearError} aria-label="Dismiss error">
                <X size={15} />
              </button>
              {!config && !booting ? (
                <button className="text-button" onClick={casework.reconnect}>
                  Reconnect
                </button>
              ) : null}
            </div>
          ) : null}
          {booting ? (
            <div className="busy-strip" role="status">
              <Spinner /> Connecting to the records room. Free hosting may need a minute to wake up.
            </div>
          ) : busy ? (
            <div className="busy-strip" role="status">
              <Spinner /> {busy}…
            </div>
          ) : null}
          {station === 'desk' ? (
            <DeskStation
              investigation={investigation}
              imported={imported}
              ready={!!config && !booting}
              busy={isBusy}
              onImport={casework.importFiles}
              onDemo={casework.openDemo}
              onCreate={casework.create}
              onBack={casework.discardImport}
              onResume={() => navigate('board')}
            />
          ) : null}
          {station === 'board' ? (
            investigation ? (
              <BoardStation
                investigation={investigation}
                busy={isBusy}
                mode={mode}
                selectedCaseId={selectedCaseId}
                result={casework.queryResult}
                onModeChange={setMode}
                onSelectCase={setSelectedCaseId}
                onPreview={casework.preview}
                onQuery={casework.query}
                onSave={casework.saveFinding}
                onArchive={() => navigate('archive')}
              />
            ) : (
              <EmptyStation onDesk={() => navigate('desk')} />
            )
          ) : null}
          {station === 'archive' ? (
            investigation ? (
              <ArchiveStation
                investigation={investigation}
                busy={isBusy}
                selectedTableId={archiveTable}
                onTableChange={setArchiveTable}
                onUndo={casework.undo}
                onExport={casework.exportRecords}
              />
            ) : (
              <EmptyStation archive onDesk={() => navigate('desk')} />
            )
          ) : null}
          <div className="paper-bottom">
            <span>WITH CARE & CURIOSITY</span>
            <Leaf size={13} />
            <span>MAPLEWICK · VOL. 01</span>
          </div>
        </section>
      </main>
      <StationNav
        station={station}
        boardCount={investigation?.stats.openCases ?? 0}
        disabled={modalOpen}
        navigate={navigate}
      />
      <div className="sr-only" role="status" aria-live="polite">
        {feedback.announcement}
      </div>
      {feedback.toast ? (
        <div className="toast" role="status">
          <span className="toast-check">
            <Check size={18} />
          </span>
          <span>{feedback.toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={feedback.dismiss}
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
          onClose={casework.closePreview}
          onConfirm={casework.confirm}
        />
      ) : null}
      {showIntro ? <Intro onDone={finishIntro} /> : null}
    </div>
  );
}
