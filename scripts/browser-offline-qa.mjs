/** Test real offline reloads and controlled upgrades on a disposable local origin. */
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createStaticServer } from './serve.mjs';
import { connectBrowser } from './cdp.mjs';
import { createGame, applyAction } from '../web/engine.js';
import { PRESETS } from '../web/data.js';

const i = process.argv.indexOf('--port');
const browser = await connectBrowser(i < 0 ? '9223' : process.argv[i + 1]);
const { cdp, evaluate, until, errors, reload } = browser;
const output = new URL('../artifacts/', import.meta.url); await mkdir(output, { recursive: true });
const appSource = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('../web/sw.js', import.meta.url), 'utf8');
const staticServer = createStaticServer();
let generation = 1;
const appRequests = [];
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/PKUards/sw.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    response.end(workerSource.replace(/const CACHE_NAME = CACHE_PREFIX \+ '[^']+';/, `const CACHE_NAME = CACHE_PREFIX + 'qa-${generation}';`));
  } else if (generation === 3 && pathname === '/PKUards/assets/art/book.webp') {
    response.writeHead(503, { 'Cache-Control': 'no-store' }); response.end('Incomplete test release');
  } else if (pathname === '/PKUards/app.js') {
    // Deliberately sticky HTTP cache: a new worker must fetch a fresh generation.
    appRequests.push(generation);
    response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'public, max-age=3600' });
    response.end(appSource + `\nwindow.__qaAssetGeneration = ${generation};`);
  } else staticServer.emit('request', request, response);
});
const click = query => evaluate(`document.querySelector(${JSON.stringify(query)}).click()`);
const match = () => evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:match'))`);
const saves = () => evaluate(`Object.fromEntries(['decks','stats','settings','match','draft'].map(key => [key, JSON.parse(localStorage.getItem('pkuards:v1:' + key))]))`);
async function screenshot(name) {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(new URL(name + '.png', output), Buffer.from(data, 'base64'));
}
try {
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__qaDecisionWorkers = [];
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) { super(...args); this.qaRecord = { url: String(args[0]), terminated: false }; window.__qaDecisionWorkers.push(this.qaRecord); }
      terminate() { this.qaRecord.terminated = true; super.terminate(); }
    };
  ` });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port, base = `http://127.0.0.1:${port}/PKUards/`;
  const cachePrefix = `pkuards-static:${base}:`;
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: base });
  await until(`window.__qaAssetGeneration === 1 && !!navigator.serviceWorker.controller`, 25000);
  const initialAssets = await evaluate(`(async () => {
    const cache = await caches.open(${JSON.stringify(cachePrefix + 'qa-1')});
    return (await cache.keys()).map(request => new URL(request.url).pathname);
  })()`);
  assert.equal(initialAssets.filter(path => path.includes('/assets/art/')).length, 20);
  assert.ok(initialAssets.some(path => path.endsWith('/offline.js')));
  assert.deepEqual((await cdp('Page.getAppManifest')).errors, [], 'web app manifest parses');

  let fixture = createGame({ playerDeck: PRESETS[1], aiDeck: PRESETS[3], seed: 73, firstPlayer: 0 });
  for (const player of [0, 1]) fixture = applyAction(fixture, { type: 'mulligan', player, cards: [] }).state;
  fixture.players[0].energy = fixture.players[0].maxEnergy = 12;
  fixture.players[0].hand = [{ id: 'offline-robot', cardId: 'e-robot' }];
  await evaluate(`localStorage.setItem('pkuards:v1:match', ${JSON.stringify(JSON.stringify(fixture))}); localStorage.setItem('pkuards:v1:decks', ${JSON.stringify(JSON.stringify([{ ...PRESETS[1], id: 'offline-deck', preset: false, name: '离线草木' }]))}); localStorage.setItem('pkuards:v1:stats', JSON.stringify({ wins: 2, losses: 1, draws: 0, completed: ['prior-1','prior-2','prior-3'] })); localStorage.setItem('pkuards:v1:settings', JSON.stringify({ reducedMotion: true, aiSpeed: 250 }))`); await reload();
  await until(`!!document.querySelector('.battle-page')`);
  await click('[data-action="hand"][data-id="offline-robot"]');
  await click('[data-action="slot"][data-row="support"][data-owner="0"][data-slot="1"]');
  await until(`!document.querySelector('.duel-cinema') && JSON.parse(localStorage.getItem('pkuards:v1:match')).players[0].energy === 9`);
  const deployed = await match();

  await cdp('Network.enable');
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await new Promise(resolve => server.close(resolve)); // No local server remains to satisfy an accidental network fetch.
  await reload(); await until(`!!document.querySelector('.battle-page')`);
  assert.deepEqual(await match(), deployed, 'an offline reload resumes the exact saved position');
  const unit = deployed.players[0].support[1];
  await click(`[data-action="unit"][data-id="${unit.id}"]`); await click('[data-action="slot"][data-row="front"][data-slot="0"]');
  await until(`!document.querySelector('.duel-cinema') && JSON.parse(localStorage.getItem('pkuards:v1:match')).players[0].energy === 8`);
  await click(`[data-action="unit"][data-id="${unit.id}"]`); await click('[data-action="target"][data-id="hq:1"]');
  await until(`!document.querySelector('.duel-cinema') && JSON.parse(localStorage.getItem('pkuards:v1:match')).players[1].hq === 17`);
  await screenshot('offline-battle');
  await click('[data-action="route"][data-view="collection"]');
  assert.equal(await evaluate(`document.querySelectorAll('.card-grid .game-card').length`), 64);
  const decoded = await evaluate(`(async () => {
    const sources = [...new Set([...document.querySelectorAll('.card-grid .painted-art')].map(image => image.src))];
    await Promise.all(sources.map(async src => { const image = new Image(); image.src = src; await image.decode(); })); return sources.length;
  })()`);
  assert.equal(decoded, 20, 'all paintings decode with both the server and network unavailable');
  await click('[data-action="route"][data-view="battle"]');
  const ownTurn = (await match()).turn;
  await click('[data-action="end-turn"]');
  await until(`(() => { const state = JSON.parse(localStorage.getItem('pkuards:v1:match')); return state.currentPlayer === 0 && state.turn > ${ownTurn} && !document.querySelector('.duel-cinema'); })()`);
  assert.ok(await evaluate(`window.__qaDecisionWorkers.some(worker => !worker.terminated && worker.url.startsWith(${JSON.stringify(base + 'ai-worker.js')}))`), 'AI uses a real decision worker while the server and network are unavailable');
  await click('[data-action="route"][data-view="decks"]');
  await click('[data-action="edit-deck"][data-id="preset-engineering"]');
  await evaluate(`(() => { const input = document.querySelector('#deck-name'); input.value = '更新前未完成的草稿'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click('[data-action="remove-card"][data-id="e-night"]');
  const beforeUpdate = await saves();
  assert.equal(beforeUpdate.draft.deck.cards.length, 38);
  await evaluate(`(() => { const input = document.querySelector('#deck-name'); window.__qaComposingInput = input; input.focus(); input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); })()`);
  await evaluate(`(async () => { const cache = await caches.open('unrelated-game-cache'); await cache.put(${JSON.stringify(base + 'keep')}, new Response('keep')); })()`);

  generation = 2; server.listen(port, '127.0.0.1'); await once(server, 'listening');
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await evaluate(`(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); })()`);
  await until(`(async () => !!(await navigator.serviceWorker.getRegistration()).waiting)()`, 25000);
  assert.ok(await evaluate(`window.__qaComposingInput === document.querySelector('#deck-name')`), 'a prepared update cannot replace an active composition input');
  await evaluate(`document.querySelector('#deck-name').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))`);
  await until(`!!document.querySelector('.settings-button.has-update')`);
  assert.equal(await evaluate('window.__qaAssetGeneration'), 1, 'a prepared update cannot reload an active match');
  assert.deepEqual(await saves(), beforeUpdate);
  assert.ok(appRequests.includes(2), 'the updated cache bypasses stale HTTP assets');
  await click('[data-action="settings"]');
  await until(`!!document.querySelector('[data-action="update-game"]')`);
  await screenshot('offline-update-ready');
  await click('[data-action="update-game"]');
  await until(`window.__qaAssetGeneration === 2 && !!document.querySelector('.builder-page')`, 25000);
  assert.deepEqual(await saves(), beforeUpdate, 'accepted updates preserve formal saves and the unfinished editor draft');
  assert.equal(await evaluate(`document.querySelector('#deck-name').value`), '更新前未完成的草稿');
  await click('[data-action="route"][data-view="battle"]');
  const beforeIncompleteUpdate = await saves();
  const cacheNames = await evaluate('caches.keys()');
  assert.ok(!cacheNames.includes(cachePrefix + 'qa-1') && cacheNames.includes(cachePrefix + 'qa-2'));
  assert.ok(cacheNames.includes('unrelated-game-cache'), 'upgrades only remove this game scope’s old caches');
  generation = 3;
  await evaluate(`(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await new Promise((resolve, reject) => {
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker.addEventListener('statechange', () => { if (worker.state === 'redundant') resolve(); });
      }, { once: true });
      registration.update().catch(reject);
    });
  })()`);
  assert.equal(await evaluate('window.__qaAssetGeneration'), 2);
  assert.equal(await evaluate(`(async () => !!(await navigator.serviceWorker.getRegistration()).waiting)()`), false);
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await new Promise(resolve => server.close(resolve));
  await reload(); await until(`window.__qaAssetGeneration === 2 && !!document.querySelector('.battle-page')`);
  assert.deepEqual(await saves(), beforeIncompleteUpdate, 'an incomplete release cannot replace the working offline game or its saves');
  assert.deepEqual(errors, [], 'no browser runtime errors');
  const report = { browser: browser.version.Browser, passed: true, isolatedLocalFixture: true, cachedAssets: initialAssets.length, decodedPaintingsOffline: decoded, checks: ['manifest parses', 'complete local resource cache', 'reload with HTTP server stopped and browser offline', 'resume and play while offline', '64-card collection and twenty paintings offline', 'real AI decision worker completes an offline turn', 'new release bypasses a deliberately stale HTTP cache', 'available updates wait for player acceptance and IME completion', 'accepted update preserves formal saves and the unfinished draft', 'old game cache removed while unrelated cache survives', 'incomplete update leaves the working offline release and saves intact'], runtimeErrors: errors };
  await writeFile(new URL('browser-offline-qa.json', output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (server.listening) await new Promise(resolve => server.close(resolve));
  await browser.close();
}
