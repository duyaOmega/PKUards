import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createStaticServer } from '../scripts/serve.mjs';

test('static server serves root and GitHub Pages subpath with correct module MIME and relative assets', async t => {
  const server = createStaticServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/PKUards/'); assert.equal(response.status, 200);
  const html = await response.text(); assert.match(html, /lang="zh-CN"/); assert.match(html, /src="\.\/app.js\?v=1.2.2"/); assert.match(html, /href="\.\/style.css"/);
  assert.match(html, /href="\.\/mobile.css\?v=1.2.2"/);
  for (const file of ['app.js', 'engine.js', 'data.js', 'ai.js', 'art.js', 'storage.js', 'interactions.js', 'presentation.js', 'style.css', 'duel.css', 'cinema.css', 'mobile.css', 'favicon.svg', 'assets/art/tower.webp']) {
    const result = await fetch(`${base}/PKUards/${file}`); assert.equal(result.status, 200, file);
    if (file.endsWith('.js')) assert.match(result.headers.get('content-type'), /javascript/);
    if (file.endsWith('.css')) assert.match(result.headers.get('content-type'), /text\/css/);
  }
  assert.equal((await fetch(base + '/')).url, base + '/PKUards/');
  assert.equal((await fetch(base + '/index.html')).status, 200);
  assert.equal((await fetch(base + '/PKUards/missing')).status, 404);
  assert.equal((await fetch(base + '/PKUards/%2e%2e%2fpackage.json')).status, 403);
  assert.equal((await fetch(base + '/PKUards/%')).status, 404);
});
