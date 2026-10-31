import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Leaf, Paperclip, Search } from 'lucide-react';
import type { Investigation, Station } from '../../shared/contracts';
import OfficeIllustration from '../components/OfficeIllustration';
import ClueBoard from '../features/board/ClueBoard';

const Office = lazy(() => import('../components/Office'));

/** Keep the renderer asleep when the office is behind the opening or offscreen. */
function useOfficeVisibility() {
  const ref = useRef<HTMLDivElement>(null);
  const [inViewport, setInViewport] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const element = ref.current;
    if (!element || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => setInViewport(!!entry?.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return { ref, visible: inViewport && pageVisible };
}

interface OfficeStageProps {
  station: Station;
  investigation: Investigation | null;
  reduced: boolean;
  flat: boolean;
  opening: boolean;
  onNavigate: (station: Station) => void;
  selectedCaseId: string;
  onSelectCase: (id: string) => void;
}

export default function OfficeStage({
  station,
  investigation,
  reduced,
  flat,
  opening,
  onNavigate,
  selectedCaseId,
  onSelectCase,
}: OfficeStageProps) {
  const { ref, visible } = useOfficeVisibility();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!opening && !flat && visible) setLoaded(true);
  }, [flat, opening, visible]);

  return (
    <section className={`office-stage office-stage-${station}`} aria-label="Maplewick office">
      <div className="office-lamplight" aria-hidden="true" />
      <div className="office-title">
        <span className="eyebrow">
          <span className="agency-status-dot" /> THE MAPLEWICK CASEFILES / AFTER HOURS
        </span>
        <h1>
          {station === 'desk' ? (
            <>
              Every record.
              <br />
              <em>A possible lead.</em>
            </>
          ) : station === 'board' ? (
            <>
              Follow the thread.
              <br />
              <em>Find the story.</em>
            </>
          ) : (
            <>
              Every lead.
              <br />
              <em>Carefully filed.</em>
            </>
          )}
        </h1>
        <p>
          {station === 'desk'
            ? 'A repeated name. A missing link. Something worth a closer look.'
            : station === 'board'
              ? 'Look closely. Every clue comes from your records.'
              : 'Every decision, discovery, and repaired record. Carefully accounted for.'}
        </p>
      </div>
      {station === 'board' && investigation ? (
        <ClueBoard
          investigation={investigation}
          selectedCaseId={selectedCaseId}
          onSelect={(id) => {
            onSelectCase(id);
            if (window.matchMedia('(max-width: 850px)').matches) {
              document
                .getElementById('case-panel')
                ?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
            }
          }}
        />
      ) : null}
      {station === 'desk' ? (
        <div className="investigator-note">
          <Search size={19} strokeWidth={1.4} />
          <span>
            Look for what
            <br />
            <em>doesn’t quite fit.</em>
          </span>
          <span className="note-pencil" aria-hidden="true" />
        </div>
      ) : null}
      <div className="scene-container" ref={ref}>
        {loaded && !flat ? (
          <Suspense
            fallback={
              <div className="office-loading">
                <Leaf size={30} />
                <span>Letting the afternoon light in…</span>
              </div>
            }
          >
            <Office
              station={station}
              reduced={reduced}
              active={visible && !opening}
              onNavigate={onNavigate}
            />
          </Suspense>
        ) : (
          <OfficeIllustration />
        )}
      </div>
      <div className="room-caption">
        <span className="compass" aria-hidden="true">
          ✦
        </span>
        <span>
          MAPLEWICK, SOMEWHERE QUIET
          <br />
          <small>Lamplight. Loose ends. Your next lead.</small>
        </span>
      </div>
      {investigation ? (
        <div className="desk-case-tag">
          <Paperclip size={14} />
          <span>{investigation.title}</span>
          <span className="case-tag-revision">rev. {investigation.revision}</span>
        </div>
      ) : null}
      <div className="room-navigation" role="group" aria-label="Explore the office">
        <button onClick={() => onNavigate('desk')} className={station === 'desk' ? 'active' : ''}>
          <span>01</span> The desk <ArrowUpRight size={12} />
        </button>
        <button onClick={() => onNavigate('board')} className={station === 'board' ? 'active' : ''}>
          <span>02</span> Evidence wall <ArrowUpRight size={12} />
        </button>
        <button
          onClick={() => onNavigate('archive')}
          className={station === 'archive' ? 'active' : ''}
        >
          <span>03</span> The archive <ArrowUpRight size={12} />
        </button>
      </div>
    </section>
  );
}
