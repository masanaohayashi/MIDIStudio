// Run after all static pages have been generated, so offline installs are complete.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function filesIn(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => entry.isDirectory()
    ? filesIn(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();
}
const files = (await filesIn('dist')).filter((file) => file !== 'dist/sw.js').sort();
const hash = createHash('sha256');
for (const file of files) {
  hash.update(file);
  hash.update(await readFile(file));
}
const revision = hash.digest('hex').slice(0, 20);
const assets = files.map((file) => file.slice('dist/'.length));
await writeFile('dist/sw.js', `
const PREFIX = 'midi-studio:' + self.registration.scope + ':';
const CACHE = PREFIX + ${JSON.stringify(revision)};
const ASSETS = ${JSON.stringify(assets)};
const urls = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([...urls].map(url => new Request(url, { cache: 'reload' })));
  })());
  // No skipWaiting: keep the current editor and its assets together until all tabs close.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  url.hash = '';
  if (url.href === self.registration.scope) url.pathname += 'index.html';
  if (!urls.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(url.href)) || fetch(event.request);
  })());
});
`);
console.log(`[build-pwa] cached ${assets.length} assets, revision ${revision}`);
