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

test('AI values deployment damage to the actual enemy frontline', () => {
  const state = base(3); hand(state, ['c-debate', 'c-law']);
  for (const slot of [0, 1, 3]) unit(state, 'e-robot', slot, 1, { row: 'front', health: 1 });
  unit(state, 'e-flight', 4, 1, { health: 1 });
  const chosen = decision(state);
  assert.equal(chosen.action.card, 'hand-c-law');
  assert.equal(chosen.state.front.owner, null);
  assert.equal(chosen.state.players[1].support[4].health, 1, 'front-only damage leaves the back row intact');
});

test('AI counts a fieldwork draw when choosing between otherwise equal advances', () => {
  const state = base(1); unit(state, 'n-bike', 0); const field = unit(state, 'c-field', 1);
  const chosen = decision(state);
  assert.equal(chosen.action.type, 'move'); assert.equal(chosen.action.unit, field.id);
  assert.equal(chosen.state.players[0].hand.length, 1);
});

test('AI values the deployment source operation discount', () => {
  const state = base(4); hand(state, ['e-server', 'e-hack']);
  const chosen = decision(state);
  assert.equal(chosen.action.card, 'hand-e-hack');
  assert.equal(chosen.state.players[0].support[chosen.action.slot].opCost, 0);
});

test('AI counts the advancing source fortification without changing the input unit', () => {
  const state = base(1); unit(state, 's-fresh', 0); const tower = unit(state, 'n-tower', 1);
  const chosen = decision(state);
  assert.equal(chosen.action.type, 'move'); assert.equal(chosen.action.unit, tower.id);
  assert.equal(findUnit(chosen.state, tower.id).maxHealth, 7);
  assert.equal(tower.maxHealth, 5);
});

test('AI does not count a summon in the slot consumed by its deployment', () => {
  const state = base(6); hand(state, ['c-forum', 'e-build']);
  for (const slot of [0, 1, 3]) unit(state, 'n-library', slot, 0, { sick: true });
  const chosen = decision(state);
  assert.equal(chosen.action.card, 'hand-c-forum', 'the two bodies tie when no robot can fit');
  assert.equal(chosen.state.players[0].support.filter(Boolean).length, 4);
});

test('a full hand does not invent a draw benefit for advancing fieldwork', () => {
  const state = base(1); const bike = unit(state, 'n-bike', 0); unit(state, 'c-field', 1);
  state.players[0].hand = Array.from({ length: 9 }, (_, i) => ({ id: `full-${i}`, cardId: 'e-build' }));
  const chosen = decision(state);
  assert.equal(chosen.action.unit, bike.id);
  assert.equal(chosen.state.players[0].hand.length, 9);
});
