import { Archive, FolderOpen, GitBranch } from 'lucide-react';

export const stationInfo = {
  desk: { label: 'Desk', subtitle: 'Start a case', chapter: '01 / THE DESK', icon: FolderOpen },
  board: {
    label: 'Evidence board',
    subtitle: 'Follow the clues',
    chapter: '02 / THE EVIDENCE',
    icon: GitBranch,
  },
  archive: {
    label: 'Archive',
    subtitle: 'Your work, kept safe',
    chapter: '03 / THE ARCHIVE',
    icon: Archive,
  },
} as const;
