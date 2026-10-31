import { Leaf } from 'lucide-react';
import type { Station } from '../../shared/contracts';
import { stationInfo } from './stations';
interface StationNavProps {
  station: Station;
  boardCount: number;
  disabled: boolean;
  navigate: (station: Station) => void;
}
export default function StationNav({ station, boardCount, disabled, navigate }: StationNavProps) {
  return (
    <footer className="agency-footer" inert={disabled}>
      <span className="footer-note">
        <Leaf size={13} /> A little order. A little wonder.
      </span>
      <nav className="station-nav" aria-label="Office stations">
        {(Object.keys(stationInfo) as Station[]).map((entry, index) => {
          const Icon = stationInfo[entry].icon;
          return (
            <button
              key={entry}
              className={station === entry ? 'active' : ''}
              aria-current={station === entry ? 'page' : undefined}
              onClick={() => navigate(entry)}
            >
              <span className="station-icon">
                <Icon size={18} strokeWidth={1.6} />
              </span>
              <span>
                <strong>{stationInfo[entry].label}</strong>
                <small>{stationInfo[entry].subtitle}</small>
              </span>
              <kbd>{index + 1}</kbd>
              {entry === 'board' && boardCount > 0 ? (
                <span className="nav-count">{boardCount}</span>
              ) : null}
            </button>
          );
        })}
      </nav>
      <span className="footer-edition">
        A QUIETER KIND
        <br />
        OF DETECTIVE GAME
      </span>
    </footer>
  );
}
