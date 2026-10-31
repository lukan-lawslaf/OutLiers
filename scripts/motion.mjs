import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const mode = process.argv[2];
if (!['check', 'render'].includes(mode)) throw new Error('Use motion.mjs check|render');
const directory = resolve('motion/intro');
if (!existsSync(resolve(directory, 'index.html')))
  throw new Error('Opening source missing: motion/intro/index.html');
const cli = resolve('node_modules/hyperframes/bin/hyperframes.mjs');
const run = (args) => {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: directory,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};
if (mode === 'check') {
  run(['lint']);
  run(['validate']);
  run(['inspect']);
} else {
  run([
    'render',
    '--output',
    resolve('public/media/intro.mp4'),
    '--fps',
    '30',
    '--quality',
    'standard',
  ]);
}
