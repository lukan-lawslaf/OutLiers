import { Fingerprint } from 'lucide-react';
import type { Investigation } from '../../shared/contracts';

export default function DossierIdentity({
  investigation,
}: {
  investigation: Investigation | null;
}) {
  return (
    <div className="dossier-identity">
      <div className="dossier-reference">
        <Fingerprint size={27} strokeWidth={1.3} aria-hidden="true" />
        <span>
          <small>MAPLEWICK / AGENCY DOSSIER</small>
          <strong>
            {investigation
              ? `FILE ${investigation.id.slice(-6).toUpperCase()}`
              : 'AWAITING YOUR FIRST LEAD'}
          </strong>
        </span>
      </div>
      <span className={`case-stamp ${investigation ? 'is-open' : ''}`}>
        <span>{investigation ? 'CASE OPEN' : 'NEW CASE'}</span>
        <small>{investigation ? 'FOLLOW THE EVIDENCE' : 'FOR YOUR ATTENTION'}</small>
      </span>
    </div>
  );
}
