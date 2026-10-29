import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, validateState } from '../web/engine.js';
import { PRESETS, validateDeck } from '../web/data.js';
import { createStorage } from '../web/storage.js';

function base() { return createGame({ playerDeck: PRESETS[0], aiDeck: PRESETS[1], seed: 73, firstPlayer: 0 }); }
test('save validation rejects broken match metadata, prototype keys, log cards and stalled phases', () => {
  const cases = [
    s => { delete s.id; }, s => { s.id = '<broken>'; }, s => { s.rng = 2 ** 32; },
    s => { s.nextId = 1; }, s => { s.mulliganDone[0] = true; },
    s => { s.phase = 'battle'; }, s => { s.players[0].faction = '__proto__'; },
    s => { s.players[0].hand[0].cardId = '__proto__'; }, s => { s.players[0].deck[0] = 'constructor'; },
    s => { s.players[0].hq = 1.5; }, s => { s.players[0].support[0] = false; },
    s => { s.history[0].cardId = 'constructor'; }, s => { s.history[0].turn = -1; },
    s => { s.history.push({ ...s.history[0] }); }, s => { s.history[0].owner = 2; }
  ];
  for (const mutate of cases) {
    const state = base(); mutate(state);
    assert.equal(validateState(state), false, mutate.toString());
  }
  assert.ok(validateState(base()));
  assert.ok(validateDeck({ ...PRESETS[0], faction: '__proto__' }).length);
  assert.ok(validateDeck({ ...PRESETS[0], ally: 'constructor' }).length);
});
test('finished save must agree with HQ health and active saves preserve once-per-turn hooks', () => {
  let state = base();
  for (const player of [0, 1]) state = applyAction(state, { type: 'mulligan', player, cards: [] }).state;
  const finished = structuredClone(state); finished.phase = 'finished'; finished.winner = 0;
  assert.equal(validateState(finished), false, 'no winner while both HQs are alive');
  finished.players[1].hq = 0; assert.ok(validateState(finished));
  finished.winner = 1; assert.equal(validateState(finished), false);
  finished.players[0].hq = 0; finished.winner = 'draw'; assert.ok(validateState(finished));
  state.players[0].hand = [{ id: 'qa-journal', cardId: 'c-journal' }];
  state.players[0].energy = state.players[0].maxEnergy = 12;
  state = applyAction(state, { type: 'play', player: 0, card: 'qa-journal', slot: 0 }).state;
  const journal = state.players[0].support[0]; journal.orderTriggeredTurn = state.turn;
  assert.ok(validateState(state));
  journal.orderTriggeredTurn = state.turn + 1; assert.equal(validateState(state), false);
});
test('bad resumable match recovers without touching valid decks, settings or statistics', () => {
  const corrupt = base(); corrupt.players[0].hand[0].cardId = '__proto__';
  const values = new Map([
    ['pkuards:v1:match', JSON.stringify(corrupt)], ['pkuards:v1:decks', JSON.stringify(PRESETS)],
    ['pkuards:v1:stats', JSON.stringify({ wins: 3, losses: 1, draws: 0, completed: ['previous'] })]
  ]);
  const storage = createStorage({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  assert.equal(storage.loadMatch(), null); assert.ok(storage.warning());
  assert.deepEqual(storage.loadDecks(), PRESETS); assert.equal(storage.loadStats().wins, 3);
  assert.equal(values.get('pkuards:v1:match'), JSON.stringify(corrupt), 'recovery does not silently overwrite the stored evidence');
});
