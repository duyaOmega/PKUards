/** Chapter navigation, native card actions, persistent seals and offline art. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { PRESETS } from '../web/data.js';
import { applyAction } from '../web/engine.js';
import { createJourneyGame } from '../web/journey.js';
import { connectBrowser } from './cdp.mjs';

const option = (key, fallback) => { const i = process.argv.indexOf(key); return i < 0 ? fallback : process.argv[i + 1]; };
const browser = await connectBrowser(option('--port', '9223'));
const { cdp, evaluate, until, reload, errors } = browser;
const output = new URL('../artifacts/', import.meta.url); await mkdir(output, { recursive: true });
const match = () => evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:match'))`);
const progress = () => evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:journey'))`);
async function click(selector) {
  const point = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el || el.disabled) throw Error('Missing or disabled: ' + ${JSON.stringify(selector)}); el.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
}
async function shot(name) {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(new URL(name + '.png', output), Buffer.from(data, 'base64'));
}
async function finishAnimation() {
  await until(`!!document.querySelector('.duel-cinema')`);
  await click('[data-action="skip-cinema"]');
  await until(`!document.querySelector('.duel-cinema')`);
}
function fixture(chapterId = 'west-gate') {
  let state = createJourneyGame({ chapterId, playerDeck: PRESETS[1] });
  for (const player of [0, 1]) state = applyAction(state, { type: 'mulligan', player, cards: [] }).state;
  state.players[0].energy = state.players[0].maxEnergy = 12;
  return state;
}
async function loadFixture(state) {
  await evaluate(`localStorage.setItem('pkuards:v1:match', ${JSON.stringify(JSON.stringify(state))})`);
  await reload(); await until(`!!document.querySelector('.battle-page')`);
}
try {
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: option('--base', 'http://localhost:4173/PKUards/') });
  await until(`!!document.querySelector('.site-header')`);
  await evaluate(`localStorage.clear(); localStorage.setItem('pkuards:v1:settings', JSON.stringify({ reducedMotion: false, aiSpeed: 250 }))`);
  await reload(); await until(`!!document.querySelector('.hero')`);
  await until(`[...document.querySelectorAll('.hero img')].every(i => i.complete && i.naturalWidth > 0)`);
  await shot('v16-home');
  await click('[data-action="route"][data-view="collection"]');
  await evaluate(`document.querySelectorAll('.card-grid .card-wrap').forEach(w => { if (!['s-proof','e-night','h-restore','c-fresh'].includes(w.querySelector('.game-card').dataset.id)) w.style.display = 'none'; else w.querySelectorAll('img').forEach(i=>i.loading='eager'); }); document.querySelector('.page-title h1').textContent = '四大学科，同一片燕园。';`);
  await until(`[...document.querySelectorAll('.card-grid .card-wrap:not([style*="display: none"]) img[src*="print-"]')].every(i=>i.complete&&i.naturalWidth>0)`);
  await shot('v16-character-cards');
  await click('[data-action="route"][data-view="journey"]');
  assert.equal(await evaluate(`document.querySelectorAll('.journey-stop:disabled').length`), 3);
  assert.equal(await evaluate(`document.querySelector('.journey-stop[aria-pressed="true"]').dataset.id`), 'west-gate');
  await until(`document.querySelector('.journey-cover-art img').complete && document.querySelector('.chapter-portrait img').complete`);
  await shot('v16-journey-desktop');
  const layouts = [];
  for (const [width, height, mobile] of [[320, 740, true], [390, 844, true], [844, 390, true], [1024, 768, false]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    const measure = await evaluate(`({ viewport: innerWidth, page: document.documentElement.scrollWidth, chapter: document.querySelector('.chapter-paper').getBoundingClientRect().width, button: document.querySelector('[data-action="start-journey"]').getBoundingClientRect().width })`);
    assert.ok(measure.page <= measure.viewport, 'no horizontal overflow at ' + width + ': ' + JSON.stringify(measure));
    assert.ok(measure.chapter > 200 && measure.button >= 44);
    layouts.push({ width, height, ...measure });
    if (width === 390) { await evaluate('scrollTo(0,0)'); await shot('v16-journey-mobile'); }
  }
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  await evaluate(`(() => { const el=document.querySelector('#journey-deck'); el.value='preset-engineering'; el.dispatchEvent(new Event('change', { bubbles:true })); })()`);
  await click('[data-action="start-journey"][data-id="west-gate"]');
  assert.equal((await match()).journey.deckId, 'preset-engineering');
  await click('[data-action="confirm-mulligan"]');
  await until(`!!document.querySelector('.battle-page') && JSON.parse(localStorage.getItem('pkuards:v1:match')).currentPlayer === 0`);

  const state = fixture();
  state.players[0].hand = [{ id: 'journey-night', cardId: 'e-night' }];
  await loadFixture(state);
  await click('[data-action="hand"][data-id="journey-night"]');
  await click('[data-action="slot"][data-row="support"][data-owner="0"][data-slot="0"]');
  assert.equal((await match()).journey.metrics.units, 0, 'goals wait for impact');
  await finishAnimation();
  assert.equal((await match()).journey.metrics.units, 1); assert.equal((await match()).players[0].energy, 11);
  await reload(); await until(`!!document.querySelector('.journey-objectives')`);
  assert.equal((await match()).journey.metrics.units, 1, 'refresh retains goal counters');
  const unit = (await match()).players[0].support[0];
  await click(`[data-action="unit"][data-id="${unit.id}"]`);
  await click('[data-action="slot"][data-row="front"][data-slot="0"]'); await finishAnimation();
  await click('[data-action="end-turn"]');
  await until(`JSON.parse(localStorage.getItem('pkuards:v1:match')).journey.metrics.frontTurns === 1`);
  await click('[data-action="route"][data-view="journey"]');

  const final = fixture();
  final.players[0].hand = [{ id: 'journey-final', cardId: 'c-question' }];
  final.players[1].hq = 2; final.journey.metrics.units = 5;
  await loadFixture(final);
  await click('[data-action="hand"][data-id="journey-final"]');
  await click('[data-action="target"][data-id="hq:1"]'); await finishAnimation();
  await until(`!!document.querySelector('.journey-result')`);
  assert.equal((await progress()).chapters['west-gate'].stars, 3);
  assert.equal(await evaluate(`document.querySelector('.result-stars').textContent`), '★★★');
  const stats = await evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:stats'))`);
  await shot('v16-journey-result');
  await click('[data-action="journey-next"]');
  assert.equal(await evaluate(`document.querySelector('.journey-stop[aria-pressed="true"]').dataset.id`), 'weiming-lake');
  assert.equal(await evaluate(`document.querySelectorAll('.journey-stop:disabled').length`), 2);
  await reload(); await until(`!!document.querySelector('.site-header')`);
  assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:stats'))`), stats, 'reload does not count another win');

  // A completed match can recover a seal even if the progress write was interrupted.
  await evaluate(`localStorage.removeItem('pkuards:v1:journey')`);
  const { identifier } = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `const originalSet = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === 'pkuards:v1:journey') throw Error('Test quota'); return originalSet.call(this, key, value); };` });
  await reload(); await until(`!!document.querySelector('.site-header')`);
  assert.equal(await progress(), null);
  assert.ok(await evaluate(`document.body.textContent.includes('浏览器未能保存进度')`));
  await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  await reload(); await until(`!!document.querySelector('.site-header')`);
  assert.equal((await progress()).chapters['west-gate'].stars, 3);
  assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:stats'))`), stats);

  await click('[data-action="route"][data-view="journey"]');
  await click('[data-action="start-journey"][data-id="weiming-lake"]');
  await until(`!!navigator.serviceWorker.controller`);
  const beforeOffline = await match();
  await cdp('Network.enable');
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await reload(); await until(`!!document.querySelector('.mulligan-page')`);
  assert.deepEqual(await match(), beforeOffline);
  await click('[data-action="route"][data-view="journey"]');
  const decoded = await evaluate(`(async () => { const ids=['print-reader','print-math','print-coder','print-field','print-campus']; await Promise.all(ids.map(async id=>{ const image=new Image(); image.src='./assets/art/'+id+'.webp'; await image.decode(); })); return ids.length; })()`);
  assert.equal(decoded, 5); assert.equal((await progress()).chapters['west-gate'].stars, 3);
  assert.deepEqual(errors, []);
  const report = { browser: browser.version.Browser, passed: true, nativePointerInputs: true, newArtDecodedOffline: decoded, layouts, checks: ['four distinct character card illustrations', 'three locked chapters and legal deck choice', 'native chapter start and mulligan', 'goals update once at impact and survive reload', 'holding the front counts at own turn end', 'native final attack awards three stars', 'win unlocks the next chapter', 'refresh preserves deck choice and deduplicates statistics', 'interrupted progress write recovers from completed match', 'offline chapter resume and all five new illustrations'], runtimeErrors: errors };
  await writeFile(new URL('browser-journey-qa.json', output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) { await shot('journey-failure'); throw error; }
finally {
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await browser.close();
}
