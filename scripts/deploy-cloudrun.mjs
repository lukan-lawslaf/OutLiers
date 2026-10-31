import { spawnSync } from 'node:child_process';

const project = process.env.GOOGLE_CLOUD_PROJECT;
const region = process.env.GOOGLE_CLOUD_REGION || 'asia-south1';
const service = process.env.CLOUD_RUN_SERVICE || 'data-detective';
if (!project || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project)) {
  console.error('Set GOOGLE_CLOUD_PROJECT to your Google Cloud project ID. See README deployment setup.');
  process.exit(1);
}
const command = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
const check = spawnSync(command, ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' });
if (check.error || check.status !== 0) {
  console.error('Google Cloud CLI is required. Install it, then run gcloud auth login.');
  process.exit(1);
}
const firebaseKeys = ['FIREBASE_API_KEY', 'FIREBASE_AUTH_DOMAIN', 'FIREBASE_APP_ID'];
if (firebaseKeys.some(key => !process.env[key])) {
  console.error('Set FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN and FIREBASE_APP_ID from your Firebase web app. Production uses anonymous Firebase auth and Firestore.');
  process.exit(1);
}
// Firebase web configuration is public. Gemini uses an existing Secret Manager secret, never CLI secret values.
const env = ['NODE_ENV=production', 'AUTH_MODE=firebase', 'PERSISTENCE_MODE=firestore', `GOOGLE_CLOUD_PROJECT=${project}`, ...firebaseKeys.map(key => `${key}=${process.env[key]}`), `GEMINI_MODEL=${process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'}`];
const args = ['run', 'deploy', service, '--source', '.', '--project', project, '--region', region, '--allow-unauthenticated', '--memory', '1Gi', '--cpu', '1', '--max-instances', '3', '--timeout', '60', '--set-env-vars', env.join(',')];
if (process.env.GEMINI_SECRET_NAME) {
  if (!/^[a-zA-Z0-9_-]+$/.test(process.env.GEMINI_SECRET_NAME)) throw new Error('GEMINI_SECRET_NAME must be a secret name, not a value.');
  args.push('--set-secrets', `GEMINI_API_KEY=${process.env.GEMINI_SECRET_NAME}:latest`);
}
const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
if (result.error) throw result.error;
process.exit(result.status || 0);
