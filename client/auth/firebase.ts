import { getApps, initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import type { AppConfig } from '../../shared/contracts';

/** Loaded only after the server explicitly selects Firebase authentication. */
export async function connectFirebase(config: NonNullable<AppConfig['firebaseConfig']>) {
  const app = getApps()[0] ?? initializeApp(config);
  const auth = getAuth(app);
  if (!auth.currentUser) await signInAnonymously(auth);
  return async () => auth.currentUser?.getIdToken();
}
