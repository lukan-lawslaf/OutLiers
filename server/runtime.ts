import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AppConfig } from '../shared/contracts.js';
import { insist } from './errors.js';
import { identityMiddleware, type IdentityOverride } from './identity.js';
import { FileStore, type Store } from './store.js';
import type { GeminiPlanner } from './gemini.js';

export interface AppOptions {
  store?: Store;
  auth?: IdentityOverride;
  gemini?: GeminiPlanner | null;
  dataDir?: string;
  serveClient?: boolean;
}

async function localSecret(directory: string): Promise<Buffer> {
  await mkdir(directory, { recursive: true });
  const filename = path.join(directory, 'session.key');
  try {
    return await readFile(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const secret = randomBytes(32);
    try {
      await writeFile(filename, secret, { flag: 'wx', mode: 0o600, flush: true });
      return secret;
    } catch {
      return readFile(filename);
    }
  }
}

export async function initializeRuntime(options: AppOptions) {
  const cloud = Boolean(process.env['K_SERVICE'] || process.env['RENDER']);
  const authMode = process.env['AUTH_MODE'] ?? 'local';
  const persistence = process.env['PERSISTENCE_MODE'] ?? process.env['PERSISTENCE'] ?? 'file';
  const directory = options.dataDir ?? process.env['DATA_DIR'] ?? path.resolve('.data');
  const firebase = authMode === 'firebase';
  const projectId = process.env['FIREBASE_PROJECT_ID'] ?? process.env['GOOGLE_CLOUD_PROJECT'];
  insist(
    ['local', 'session', 'firebase'].includes(authMode),
    500,
    'AUTH_CONFIGURATION',
    'AUTH_MODE must be local, session, or firebase.',
  );
  insist(
    ['file', 'postgres', 'firestore'].includes(persistence),
    500,
    'STORE_CONFIGURATION',
    'PERSISTENCE_MODE must be file, postgres, or firestore.',
  );
  insist(
    !cloud || authMode !== 'local' || options.auth,
    500,
    'AUTH_CONFIGURATION',
    'Hosted deployment requires AUTH_MODE=session or firebase.',
  );
  insist(
    !cloud ||
      persistence !== 'file' ||
      options.store ||
      process.env['ALLOW_EPHEMERAL_DEMO'] === 'true',
    500,
    'STORE_CONFIGURATION',
    'Hosted deployment requires durable Postgres or Firestore persistence.',
  );

  let secret: Buffer;
  if (options.auth || firebase) secret = randomBytes(32);
  else if (authMode === 'session') {
    const configured = process.env['SESSION_SECRET'];
    insist(
      configured && configured.length >= 32,
      500,
      'AUTH_CONFIGURATION',
      'Hosted sessions require a persistent SESSION_SECRET of at least 32 characters.',
    );
    // The explicit encoding preserves an existing local binary signing key during a planned migration.
    if (configured.startsWith('base64:')) {
      const encoded = configured.slice(7);
      insist(
        /^[A-Za-z0-9+/]+={0,2}$/.test(encoded),
        500,
        'AUTH_CONFIGURATION',
        'SESSION_SECRET has invalid base64 encoding.',
      );
      secret = Buffer.from(encoded, 'base64');
    } else secret = Buffer.from(configured);
    insist(
      secret.length >= 32,
      500,
      'AUTH_CONFIGURATION',
      'The decoded session signing key must contain at least 32 bytes.',
    );
  } else secret = await localSecret(directory);

  if (firebase || persistence === 'firestore') {
    const { applicationDefault, getApps, initializeApp } = await import('firebase-admin/app');
    if (!getApps().length)
      initializeApp({ credential: applicationDefault(), ...(projectId ? { projectId } : {}) });
  }

  let store = options.store;
  if (!store && persistence === 'postgres') {
    const connectionString = process.env['DATABASE_URL'];
    insist(
      connectionString,
      500,
      'STORE_CONFIGURATION',
      'Postgres persistence requires DATABASE_URL.',
    );
    const { PostgresStore } = await import('./postgres-store.js');
    store = await new PostgresStore(connectionString).initialize();
  } else if (!store && persistence === 'firestore') {
    const { FirestoreStore } = await import('./firestore-store.js');
    store = new FirestoreStore();
  } else if (!store) store = await new FileStore(directory).initialize();

  let planner = options.gemini ?? null;
  if (options.gemini === undefined && process.env['GEMINI_API_KEY']) {
    const { makeGeminiPlanner } = await import('./gemini.js');
    planner = makeGeminiPlanner(process.env['GEMINI_API_KEY']);
  }
  const apiKey = process.env['FIREBASE_API_KEY'] ?? process.env['FIREBASE_WEB_API_KEY'];
  const config: AppConfig = {
    authMode: authMode as AppConfig['authMode'],
    persistence: persistence as AppConfig['persistence'],
    aiEnabled: Boolean(planner),
    ...(firebase && apiKey
      ? {
          firebaseConfig: {
            apiKey,
            authDomain: process.env['FIREBASE_AUTH_DOMAIN'] ?? `${projectId}.firebaseapp.com`,
            projectId: projectId ?? '',
            appId: process.env['FIREBASE_APP_ID'] ?? '',
          },
        }
      : {}),
  };
  return {
    store,
    planner,
    config,
    identity: identityMiddleware({
      override: options.auth,
      firebase,
      secure: cloud || process.env['NODE_ENV'] === 'production',
      secret,
      allowedOrigins: (process.env['CLIENT_ORIGIN'] ?? '').split(',').map((value) => value.trim()),
    }),
  };
}
