import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, DEFAULT_STATS } from '../web/storage.js';
import { PRESETS } from '../web/data.js';
import { createGame } from '../web/engine.js';
function memory() { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }; }
test('decks, settings, stats and a resumable game round-trip independently', () => {
  const api = createStorage(memory()), game = createGame({ playerDeck: PRESETS[0], aiDeck: PRESETS[1], seed: 5 });
  api.saveDecks(PRESETS); api.saveSettings({ reducedMotion: true, aiSpeed: 250 }); api.saveMatch(game); api.saveStats({ wins: 2, losses: 1, draws: 0, completed: ['a'] });
  assert.deepEqual(api.loadDecks(), PRESETS); assert.deepEqual(api.loadMatch(), game); assert.equal(api.loadStats().wins, 2); assert.equal(api.loadSettings().aiSpeed, 250);
});
test('a corrupt save does not discard unrelated valid saves or valid individual decks', () => {
  const backing = memory(), api = createStorage(backing); api.saveDecks([...PRESETS, { bad: true }]);
  backing.setItem('pkuards:v1:stats', '{broken'); backing.setItem('pkuards:v1:match', JSON.stringify({ version: 1, players: [] }));
  assert.equal(api.loadDecks().length, 4); assert.deepEqual(api.loadStats(), DEFAULT_STATS); assert.equal(api.loadMatch(), null); assert.ok(api.warning()); assert.equal(api.warning(), '');
});
test('disabled storage fails gracefully and reports persistence failure', () => {
  const api = createStorage({ getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Quota'); } });
  assert.deepEqual(api.loadDecks(), []); assert.equal(api.saveMatch(null), false); assert.ok(api.warning());
});

test('fresh settings follow the system motion preference while a saved choice wins', () => {
  const backing = memory();
  const api = createStorage(backing, { reducedMotion: true });
  assert.deepEqual(api.loadSettings(), { reducedMotion: true, aiSpeed: 650 });
  api.saveSettings({ reducedMotion: false, aiSpeed: 1000 });
  assert.deepEqual(createStorage(backing, { reducedMotion: true }).loadSettings(), { reducedMotion: false, aiSpeed: 1000 });
  assert.equal(createStorage(memory()).loadSettings().reducedMotion, false);
});

test('damaged settings recover the system default without changing other saves', () => {
  const backing = memory(), api = createStorage(backing, { reducedMotion: true });
  api.saveDecks(PRESETS); backing.setItem('pkuards:v1:settings', '{broken');
  assert.equal(api.loadSettings().reducedMotion, true); assert.ok(api.warning());
  assert.deepEqual(api.loadDecks(), PRESETS);
});
