import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Leaf, Paperclip } from 'lucide-react';
import type { Investigation, Station } from '../../shared/contracts';
import OfficeIllustration from '../components/OfficeIllustration';

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
}

export default function OfficeStage({
  station,
  investigation,
  reduced,
  flat,
  opening,
  onNavigate,
}: OfficeStageProps) {
  const { ref, visible } = useOfficeVisibility();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!opening && !flat && visible) setLoaded(true);
  }, [flat, opening, visible]);

  return (
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
  );
}
