import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_MAP, PRESETS } from '../web/data.js';
import { createGame, applyAction, getObservation, getLegalActions, findUnit } from '../web/engine.js';
import { chooseAction } from '../web/ai.js';

function base(energy) {
  let state = createGame({ playerDeck: PRESETS[3], aiDeck: PRESETS[1], seed: 73, firstPlayer: 0 });
  for (const player of [0, 1]) state = applyAction(state, { type: 'mulligan', player, cards: [] }).state;
  state.players[0].energy = state.players[0].maxEnergy = energy;
  state.players[0].hand = [];
  return state;
}
function unit(state, cardId, slot, owner = 0, extra = {}) {
  const card = CARD_MAP[cardId];
  const value = { id: `unit-${owner}-${slot}`, cardId, owner, attack: card.attack, health: card.health, maxHealth: card.health, opCost: card.opCost, keywords: [...card.keywords], row: 'support', slot, sick: false, moved: false, attacked: false, ...extra };
  if (value.row === 'front') { state.front.owner = owner; state.front.slots[slot] = value; }
  else state.players[owner].support[slot] = value;
  return value;
}
function hand(state, cards) { state.players[0].hand = cards.map(cardId => ({ id: `hand-${cardId}`, cardId })); }
function decision(state) {
  const before = structuredClone(state);
  const view = getObservation(state, 0), copy = structuredClone(view);
  const action = chooseAction(view, getLegalActions(state));
  assert.deepEqual(view, copy, 'scoring must not mutate the visible observation');
  assert.deepEqual(state, before, 'scoring must not mutate the live game');
  const result = applyAction(state, action); assert.ok(result.ok);
  return { action, state: result.state };
}

test('AI values the actual friendly deployment target without mutating observations', () => {
  const state = base(2); state.players[0].hq = 3; hand(state, ['n-lake', 'e-repair']);
  unit(state, 'n-bike', 0, 0, { health: 1, sick: true });
  const chosen = decision(state);
  assert.equal(chosen.action.card, 'hand-e-repair'); assert.equal(chosen.action.target, 'hq:0');
  assert.equal(chosen.state.players[0].hq, 5);
});
test('AI counts a fieldwork draw when choosing between otherwise equal advances', () => {
  const state = base(1); unit(state, 'n-bike', 0); const field = unit(state, 'c-field', 1);
  const chosen = decision(state); assert.equal(chosen.action.type, 'move'); assert.equal(chosen.action.unit, field.id);
  assert.equal(chosen.state.players[0].hand.length, 1);
});
test('AI does not buy a ready action that it cannot afford to use after paying for the order', () => {
  const state = base(3); hand(state, ['e-script', 'n-midterm']);
  unit(state, 'n-photo', 0, 0, { attacked: true }); unit(state, 'n-keeper', 0, 1, { health: 2 });
  const chosen = decision(state); assert.equal(chosen.action.card, 'hand-n-midterm'); assert.equal(chosen.state.players[1].support[0], null);
});
test('AI distinguishes large and small summons and reserves only actual available slots', () => {
  const state = base(6); hand(state, ['e-parallel', 'e-build']);
  for (const slot of [0,1,3]) unit(state, 'n-library', slot, 0, { sick: true });
  const chosen = decision(state); assert.equal(chosen.action.card, 'hand-e-build');
  assert.equal(chosen.state.players[0].support[4].cardId, 't-prototype');
  assert.equal(chosen.state.players[0].support.filter(Boolean).length, 4);
});
test('a full hand does not invent a draw benefit for advancing fieldwork', () => {
  const state = base(1); const bike = unit(state, 'n-bike', 0); unit(state, 'c-field', 1);
  state.players[0].hand = Array.from({ length: 9 }, (_, i) => ({ id: 'full-' + i, cardId: 'e-build' }));
  const chosen = decision(state); assert.equal(chosen.action.unit, bike.id); assert.equal(chosen.state.players[0].hand.length, 9);
});
test('sequential draws share the same remaining hand capacity', () => {
  const state = base(1); unit(state, 'n-library', 0, 0, { row: 'front', sick: true });
  hand(state, ['n-break','s-fresh','e-build','s-theory','h-legacy','c-focus','h-night','c-forum','s-institute']);
  const chosen = decision(state); assert.equal(chosen.action.card, 'hand-n-break'); assert.equal(chosen.state.players[0].hand.length, 9);
});
test('AI values real attack reduction rather than weakening an already harmless unit', () => {
  const state = base(2); hand(state, ['c-law']);
  unit(state, 'n-library', 0, 1, { attack: 0 }); const threat = unit(state, 'n-photo', 1, 1);
  const chosen = decision(state); assert.equal(chosen.action.target, threat.id);
  assert.equal(findUnit(chosen.state, threat.id).attack, 3);
});
test('engineering pressure follows visible faction identity and can be disabled for a controlled comparison', () => {
  const state = base(1); state.players[0].faction = 'engineering';
  unit(state, 'n-radio', 0); const weak = unit(state, 'n-library', 0, 1, { health: 1 });
  const observation = getObservation(state, 0), actions = getLegalActions(state);
  assert.equal(chooseAction(observation, actions).target, 'hq:1');
  assert.equal(chooseAction(observation, actions, { pressure: 0 }).target, weak.id);
});
