import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const output = resolve('dist/client');
const manifestPath = resolve(output, '.vite/manifest.json');
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : undefined;
const initialFiles = new Set();

if (manifest) {
  const visited = new Set();
  function collect(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing manifest entry: ${key}`);
    if (chunk.file.endsWith('.js')) initialFiles.add(chunk.file);
    for (const dependency of chunk.imports || []) collect(dependency);
  }
  for (const [key, chunk] of Object.entries(manifest)) {
    if (chunk.isEntry) collect(key);
  }
} else {
  // Supports measuring the original release, which was built without a manifest.
  const html = readFileSync(resolve(output, 'index.html'), 'utf8');
  for (const match of html.matchAll(/<script[^>]*src="\/?([^"?]+\.js)"/g)) {
    initialFiles.add(match[1]);
  }
}

if (!initialFiles.size) throw new Error('Build the client before measuring its JavaScript.');
let totalGzipBytes = 0;
for (const file of initialFiles) {
  const path = resolve(output, file);
  const gzipBytes = gzipSync(readFileSync(path)).length;
  totalGzipBytes += gzipBytes;
  console.log(`${file}: ${statSync(path).size} bytes, ${gzipBytes} gzip bytes`);
}
const budget = 90 * 1024;
console.log(`Initial JavaScript: ${totalGzipBytes} gzip bytes; budget: ${budget}.`);
if (totalGzipBytes > budget) {
  console.error('Initial JavaScript exceeds the 90 KiB gzip budget.');
  process.exitCode = 1;
}
