import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, validateState } from '../web/engine.js';
import { PRESETS } from '../web/data.js';

function finished() {
  let game = createGame({ playerDeck: PRESETS[0], aiDeck: PRESETS[1], seed: 91, firstPlayer: 0 });
  for (const player of [0, 1]) game = applyAction(game, { type: 'mulligan', player, cards: [] }).state;
  game.players[1].hq = 0; game.phase = 'finished'; game.winner = 0;
  assert.ok(validateState(game)); return game;
}
async function withBrowser(values, write, run) {
  const original = { window: globalThis.window, document: globalThis.document };
  const root = { innerHTML: '', querySelector: () => null, addEventListener() {} };
  globalThis.document = { activeElement: null, body: { classList: { toggle() {} } }, querySelector: selector => selector === '#app' ? root : { textContent: '' }, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
  globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: write }, scrollTo() {}, addEventListener() {} };
  try { await run(root); }
  finally { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
}

test('a finished match persisted before its statistics is recovered once on startup', async () => {
  const game = finished(), prior = { wins: 2, losses: 1, draws: 0, completed: ['prior-a', 'prior-b', 'prior-c'] };
  const values = new Map([['pkuards:v1:match', JSON.stringify(game)], ['pkuards:v1:stats', JSON.stringify(prior)], ['pkuards:v1:decks', JSON.stringify(PRESETS)]]);
  const decks = values.get('pkuards:v1:decks');
  await withBrowser(values, (key, value) => values.set(key, value), async () => {
    await import('../web/app.js?result-recovery-first');
    const recovered = JSON.parse(values.get('pkuards:v1:stats'));
    assert.deepEqual(recovered, { ...prior, wins: 3, completed: [...prior.completed, game.id] });
    assert.equal(values.get('pkuards:v1:decks'), decks);
    await import('../web/app.js?result-recovery-reload');
    assert.deepEqual(JSON.parse(values.get('pkuards:v1:stats')), recovered);
  });
});

test('a statistics write failure keeps the finished match available for a later retry', async () => {
  const game = finished(), prior = { wins: 0, losses: 0, draws: 0, completed: [] };
  const values = new Map([['pkuards:v1:match', JSON.stringify(game)], ['pkuards:v1:stats', JSON.stringify(prior)]]);
  let failStats = true;
  await withBrowser(values, (key, value) => { if (key === 'pkuards:v1:stats' && failStats) throw Error('Quota'); values.set(key, value); }, async root => {
    await import('../web/app.js?result-recovery-quota');
    assert.match(root.innerHTML, /浏览器未能保存进度/);
    assert.deepEqual(JSON.parse(values.get('pkuards:v1:stats')), prior);
    assert.equal(JSON.parse(values.get('pkuards:v1:match')).id, game.id);
    failStats = false;
    await import('../web/app.js?result-recovery-retry');
    const saved = JSON.parse(values.get('pkuards:v1:stats'));
    assert.equal(saved.wins, 1); assert.deepEqual(saved.completed, [game.id]);
    await import('../web/app.js?result-recovery-confirm');
    assert.deepEqual(JSON.parse(values.get('pkuards:v1:stats')), saved);
  });
});
