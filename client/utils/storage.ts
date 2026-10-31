export const storageKeys = {
  investigation: 'maplewick.case.v1',
  motion: 'maplewick.motion.v1',
  office: 'maplewick.office.v1',
  intro: 'maplewick.intro.v1',
} as const;

export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The game remains playable when private browsing disables local storage.
  }
}
