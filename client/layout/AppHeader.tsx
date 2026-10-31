import { Search, Settings2, Volume2, VolumeX } from 'lucide-react';
import type { AppConfig } from '../../shared/contracts';
import type { OfficePreferences } from '../hooks/useOfficePreferences';
interface AppHeaderProps {
  config: AppConfig | null;
  booting: boolean;
  disabled: boolean;
  preferences: OfficePreferences;
  onDesk: () => void;
}
export default function AppHeader({
  config,
  booting,
  disabled,
  preferences,
  onDesk,
}: AppHeaderProps) {
  const { sound, reduced, flat, setReduced, setFlat, toggleSound } = preferences;
  return (
    <header className="masthead" inert={disabled}>
      <a
        className="brand"
        href="#"
        onClick={(event) => {
          event.preventDefault();
          onDesk();
        }}
        title="Go to the desk"
      >
        <span className="brand-seal">
          <Search size={25} strokeWidth={1.6} />
        </span>
        <span>
          <strong>Maplewick</strong>
          <small>RECORDS AGENCY</small>
        </span>
      </a>
      <div className="masthead-center">
        <span className="edition-line" />
        <span>THE DATA DETECTIVE CASEFILES</span>
        <span className="edition-line" />
      </div>
      <div className="header-tools">
        <span className="agency-open">
          <i /> {booting ? 'Opening the agency' : 'The agency is open'}
        </span>
        <button
          className="icon-button"
          onClick={toggleSound}
          aria-label={sound ? 'Mute sound' : 'Enable sound'}
          aria-pressed={sound}
        >
          {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
        </button>
        <details className="settings">
          <summary className="icon-button" aria-label="Office settings">
            <Settings2 size={17} />
          </summary>
          <div className="settings-popover">
            <strong>Make yourself comfortable.</strong>
            <label className="check-label">
              <input
                type="checkbox"
                checked={reduced}
                onChange={(event) => setReduced(event.target.checked)}
              />{' '}
              Reduce motion
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={flat}
                onChange={(event) => setFlat(event.target.checked)}
              />{' '}
              Use illustrated office
            </label>
            <small>Keyboard: 1 desk · 2 board · 3 archive</small>
            <span className="storage-label">
              {config?.authMode === 'firebase'
                ? 'Private cloud case · Firebase'
                : config?.authMode === 'session'
                  ? 'Hosted session · PostgreSQL'
                  : 'Local development session · file storage'}
            </span>
          </div>
        </details>
      </div>
    </header>
  );
}
