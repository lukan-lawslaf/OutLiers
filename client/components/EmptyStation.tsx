import { Archive, ArrowRight, Search } from 'lucide-react';

export default function EmptyStation({
  archive,
  onDesk,
}: {
  archive?: boolean;
  onDesk: () => void;
}) {
  const Icon = archive ? Archive : Search;
  return (
    <div className="no-case">
      <span className="empty-emblem">
        <Icon size={36} strokeWidth={1.2} />
      </span>
      <span className="eyebrow">
        {archive ? 'Room for something good' : 'A fresh piece of cork'}
      </span>
      <h2>
        {archive ? (
          <>
            Your story
            <br />
            will be kept here.
          </>
        ) : (
          <>
            Every mystery
            <br />
            starts with a record.
          </>
        )}
      </h2>
      <p>
        {archive
          ? 'Open a case at the desk. Every decision and discovery will have a place in the archive.'
          : 'Bring a file to the desk or open a practice case. Your clues will appear right here.'}
      </p>
      <button className="button primary" onClick={onDesk}>
        {archive ? 'Start a case' : 'Go to the desk'} <ArrowRight size={16} />
      </button>
    </div>
  );
}
