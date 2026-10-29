/** Continuous full matches through real browser input, with saves and memory checks. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { connectBrowser } from './cdp.mjs';
import { createGame, getLegalActions, getObservation, applyAction, validateState } from '../web/engine.js';
import { chooseAction } from '../web/ai.js';
import { CARD_MAP, PRESETS } from '../web/data.js';

const option = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const games = Number(option('--games', '32'));
const deadline = option('--until', '') ? Date.parse(option('--until')) : Infinity;
if (!Number.isInteger(games) || games < 1 || games > 1000 || Number.isNaN(deadline)) throw new Error('Use --games 1–1000 and an optional ISO --until time.');
const base = option('--base', 'http://localhost:4173/PKUards/');
const source = option('--source', 'working-tree');
const playSettings = { reducedMotion: process.argv.includes('--quick'), aiSpeed: process.argv.includes('--quick') ? 250 : 650 };
const browser = await connectBrowser(option('--port', '9223'));
const { cdp, evaluate, until, errors, reload } = browser;
const output = new URL('../artifacts/', import.meta.url); await mkdir(output, { recursive: true });
const started = new Date().toISOString(), results = [], memory = [];
let touch = false, lastState = null, currentGame = null, lastReport = 0;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const match = () => evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:match'))`);
async function screenshot(name) {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(new URL(name + '.png', output), Buffer.from(data, 'base64'));
}
async function click(query) {
  await until(`document.readyState === 'complete'`);
  const position = await evaluate(`(async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const element = document.querySelector(${JSON.stringify(query)});
      if (!element || element.disabled) throw Error('Unavailable input: ' + ${JSON.stringify(query)});
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (!element.isConnected) continue;
      const r = element.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (r.width && r.height && x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && element.contains(document.elementFromPoint(x, y))) return { x, y };
    }
    throw Error('Input is not visible: ' + ${JSON.stringify(query)});
  })()`);
  if (touch) {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [position] });
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...position, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...position, button: 'left', clickCount: 1 });
  }
  await evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
}
async function perform(state, action) {
  const target = id => `[data-action="${id.startsWith('hq:') ? 'target' : 'unit'}"][data-id="${id}"]`;
  if (action.type === 'mulligan') {
    for (const id of action.cards) await click(`[data-action="replace"][data-id="${id}"]`);
    await click('[data-action="confirm-mulligan"]');
  } else if (action.type === 'endTurn') await click('[data-action="end-turn"]');
  else if (action.type === 'play') {
    const card = CARD_MAP[state.players[0].hand.find(h => h.id === action.card).cardId];
    await click(`[data-action="hand"][data-id="${action.card}"]`);
    if (card.kind === 'unit') await click(`[data-action="slot"][data-row="support"][data-owner="0"][data-slot="${action.slot}"]`);
    if (action.target) await click(target(action.target));
  } else {
    await click(`[data-action="unit"][data-id="${action.unit}"]`);
    if (action.type === 'move') await click(`[data-action="slot"][data-row="front"][data-slot="${action.slot}"]`);
    else await click(target(action.target));
  }
  await until(`!document.querySelector('.duel-cinema') && JSON.parse(localStorage.getItem('pkuards:v1:match')).nextEvent > ${state.nextEvent}`);
  const next = await match(); assert.ok(validateState(next), 'native input must preserve a valid position');
  if (!['endTurn', 'mulligan'].includes(action.type)) {
    // Persisted states omit undefined optional log fields; compare the save representation.
    const expected = JSON.parse(JSON.stringify(applyAction(state, action).state));
    if (!isDeepStrictEqual(next, expected)) {
      await writeFile(new URL('soak-transition-mismatch.json', output), JSON.stringify({ action, before: state, expected, actual: next }, null, 2));
      throw new Error('One native action did not match one serialized engine transition; see soak-transition-mismatch.json');
    }
  }
  return next;
}
async function report(status, extra = {}) {
  const value = { status, source, browser: browser.version.Browser, playSettings, started, updated: new Date().toISOString(), until: Number.isFinite(deadline) ? new Date(deadline).toISOString() : null, targetGames: games, completedGames: results.length, currentGame, results, memory, runtimeErrors: errors, ...extra };
  await writeFile(new URL('browser-soak.json.tmp', output), JSON.stringify(value, null, 2));
  await rename(new URL('browser-soak.json.tmp', output), new URL('browser-soak.json', output)); return value;
}
try {
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    const stats = window.__qaDecisionWorkers = { owned: 0, max: 0, created: 0, errors: [] };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args); this.qaEnded = false; stats.owned++; stats.created++; stats.max = Math.max(stats.max, stats.owned);
        this.addEventListener('error', event => stats.errors.push(event.message || 'Worker load error'));
      }
      terminate() { if (!this.qaEnded) { this.qaEnded = true; stats.owned--; } super.terminate(); }
    };
  ` });
  await cdp('Page.navigate', { url: base }); await until(`!!document.querySelector('.site-header')`);
  await evaluate(`localStorage.clear(); localStorage.setItem('pkuards:v1:settings', ${JSON.stringify(JSON.stringify(playSettings))})`); await reload();
  await until(`!!document.querySelector('.hero')`);
  await report('running');
  for (let gameIndex = 0; gameIndex < games && Date.now() < deadline - 2000; gameIndex++) {
    const player = Math.floor(gameIndex / 8) % 4, opponent = Math.floor(gameIndex / 2) % 4, firstPlayer = gameIndex % 2;
    const seed = 20261029 + gameIndex * 131;
    const viewport = [[1280, 720, false], [390, 844, true], [844, 390, true]][gameIndex % 3];
    touch = viewport[2];
    await cdp('Emulation.setDeviceMetricsOverride', { width: viewport[0], height: viewport[1], deviceScaleFactor: 1, mobile: touch });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: touch ? 5 : 1 });
    const fixture = createGame({ playerDeck: PRESETS[player], aiDeck: PRESETS[opponent], seed, firstPlayer });
    await evaluate(`localStorage.setItem('pkuards:v1:match', ${JSON.stringify(JSON.stringify(fixture))})`); await reload();
    await until(`!!document.querySelector('.mulligan-page')`);
    let state = await match(), ownActions = 0, previousEvent = state.nextEvent, lastProgress = performance.now();
    const gameStarted = performance.now();
    currentGame = { game: gameIndex + 1, player, opponent, seed, firstPlayer, turn: 0 };
    while (state.phase !== 'finished' && Date.now() < deadline - 2000) {
      assert.ok(validateState(state)); assert.ok(state.turn <= 180, 'a match must not stall for hundreds of turns');
      assert.deepEqual(errors, [], 'no browser runtime exceptions during continuous play');
      if (state.nextEvent !== previousEvent) { previousEvent = state.nextEvent; lastProgress = performance.now(); }
      assert.ok(performance.now() - lastProgress < 90000, 'the browser match stopped making progress');
      if (state.currentPlayer === 0 && !await evaluate(`!!document.querySelector('.duel-cinema')`)) {
        const action = chooseAction(getObservation(state, 0), getLegalActions(state)); assert.ok(action);
        state = await perform(state, action); ownActions++;
      } else { await delay(80); state = await match(); }
      lastState = state;
      if (performance.now() - lastReport > 30000) {
        currentGame = { ...currentGame, turn: state.turn, hq: state.players.map(p => p.hq), currentPlayer: state.currentPlayer };
        await report('running'); lastReport = performance.now();
      }
    }
    if (state.phase !== 'finished') break;
    await until(`!document.querySelector('.duel-cinema') && !!document.querySelector('.result-modal')`);
    const stats = await evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:stats'))`);
    assert.equal(stats.wins + stats.losses + stats.draws, gameIndex + 1, 'each completed game is recorded exactly once');
    assert.equal(stats.completed.length, Math.min(100, gameIndex + 1), 'completed match IDs stay bounded');
    const workers = await evaluate('window.__qaDecisionWorkers');
    assert.deepEqual(workers.errors, []); assert.equal(workers.owned, 1); assert.equal(workers.max, 1, 'one decision worker is reused through a full match');
    const result = { game: gameIndex + 1, player: PRESETS[player].faction, opponent: PRESETS[opponent].faction, firstPlayer, seed, viewport: viewport.slice(0, 2), touch, winner: state.winner, turns: state.turn, ownActions, seconds: +((performance.now() - gameStarted) / 1000).toFixed(2) };
    results.push(result);
    if (gameIndex === 0 || (gameIndex + 1) % 8 === 0) {
      await cdp('HeapProfiler.collectGarbage');
      const heap = await cdp('Runtime.getHeapUsage'), dom = await cdp('Memory.getDOMCounters');
      const sample = { game: gameIndex + 1, usedMiB: +(heap.usedSize / 1048576).toFixed(2), ...dom, ownedDecisionWorkers: workers.owned, createdDecisionWorkers: workers.created, maxOwnedDecisionWorkers: workers.max };
      assert.ok(heap.usedSize < 128 * 1048576 && dom.nodes < 15000, 'retained heap and DOM must remain bounded');
      memory.push(sample); await screenshot(`soak-game-${String(gameIndex + 1).padStart(3, '0')}`);
      await reload(); await until(`!!document.querySelector('.hero')`);
      assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:stats'))`), stats, 'refresh cannot record a result twice');
    }
    await report('running'); console.log(JSON.stringify({ ...result, memory: memory.at(-1)?.usedMiB }));
  }
  const status = results.length === games ? 'passed' : 'deadline';
  await report(status);
  console.log(JSON.stringify({ status, source, completedGames: results.length, targetGames: games, memorySamples: memory, runtimeErrors: errors }));
} catch (error) {
  await screenshot('soak-failure');
  await writeFile(new URL('soak-failure-match.json', output), JSON.stringify(lastState || await match(), null, 2));
  await report('failed', { error: error.stack }); throw error;
} finally { await browser.close(); }
