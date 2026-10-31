import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, SkipForward } from 'lucide-react';

export default function Intro({ onDone }: { onDone: () => void }) {
  const [playing, setPlaying] = useState(false);
  const finished = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const finish = useCallback(() => { if (!finished.current) { finished.current = true; onDone(); } }, [onDone]);
  useEffect(() => {
    if (!playing) return;
    void video.current?.play().catch(finish);
    const timer = window.setTimeout(finish, 11000);
    return () => window.clearTimeout(timer);
  }, [playing, finish]);
  return <div className="opening" role="dialog" aria-modal="true" aria-label="Welcome to Maplewick">
    {playing ? <video ref={video} src="/media/intro.mp4" poster="/media/intro-poster.svg" muted playsInline onEnded={finish} onError={finish} /> : <div className="opening-letter">
      <span className="eyebrow">A small agency. A curious mind.</span>
      <div className="letter-emblem" aria-hidden="true"><span>M</span></div>
      <h1 id="opening-title">Every record<br />has a story.</h1>
      <p>Welcome to Maplewick.<br />Help the pieces find their place.</p>
      <button className="button primary" autoFocus onClick={() => setPlaying(true)}>Enter the agency <ArrowRight size={17} /></button>
    </div>}
    <button className="opening-skip" onClick={finish}>Skip opening <SkipForward size={15} /></button>
    <span className="opening-edition">THE MAPLEWICK CASEFILES · VOL. 01</span>
  </div>;
}
