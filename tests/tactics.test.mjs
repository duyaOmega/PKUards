import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, getLegalActions, getObservation, validateState } from '../web/engine.js';
import { CARD_MAP, PRESETS } from '../web/data.js';
import { chooseAction } from '../web/ai.js';
import { findWinningAction } from '../web/tactics.js';

function base() {
  let state = createGame({ playerDeck: PRESETS[1], aiDeck: PRESETS[3], seed: 73, firstPlayer: 0 });
  for (const player of [0, 1]) state = applyAction(state, { type: 'mulligan', player, cards: [] }).state;
  state.players[0].energy = state.players[0].maxEnergy = 12;
  state.players[0].hand = [];
  return state;
}
function unit(state, cardId, owner = 0, slot = 0, extra = {}) {
  const c = CARD_MAP[cardId];
  const u = { id: `qa-${owner}-${slot}`, cardId, owner, attack: c.attack, health: c.health, maxHealth: c.health, opCost: c.opCost, keywords: [...c.keywords], row: 'support', slot, sick: false, moved: false, attacked: false, ...extra };
  state.players[owner].support[slot] = u; return u;
}
function hand(state, cards) { state.players[0].hand = cards.map((cardId, i) => ({ id: `qa-card-${i}`, cardId })); }
function finishTurn(state, limit = 8) {
  for (let i = 0; i < limit && state.phase !== 'finished'; i++) {
    const action = chooseAction(getObservation(state, 0), getLegalActions(state));
    assert.notEqual(action.type, 'endTurn', 'AI must complete its visible winning sequence');
    const result = applyAction(state, action); assert.ok(result.ok); state = result.state;
    assert.ok(validateState(state));
  }
  assert.equal(state.winner, 0); return state;
}
test('AI reserves operation energy for three lethal attacks before an expensive deployment', () => {
  const state = base(); state.players[0].energy = state.players[0].maxEnergy = 6; state.players[1].hq = 15;
  hand(state, ['e-build']);
  for (const [slot, card] of [[0, 'e-flight'], [1, 'c-debate'], [3, 'n-keeper']]) unit(state, card, 0, slot, { attack: 5 });
  const first = chooseAction(getObservation(state, 0), getLegalActions(state));
  assert.equal(first.type, 'attack');
  const done = finishTurn(state); assert.equal(done.players[0].energy, 3); assert.equal(done.players[0].hand.length, 1);
});
test('AI sees deployment, advance and attack and can reactivate an already used unit', () => {
  let state = base(); state.players[0].energy = 5; state.players[1].hq = 3; hand(state, ['e-robot']);
  finishTurn(state);
  state = base(); state.players[0].energy = 3; state.players[1].hq = 4;
  const attacker = unit(state, 'e-flight', 0, 0, { attack: 3, attacked: true }); hand(state, ['e-script']);
  const first = chooseAction(getObservation(state, 0), getLegalActions(state));
  assert.equal(first.card, 'qa-card-0'); assert.equal(first.target, attacker.id); finishTurn(state);
});
test('AI removes an adjacent guard before sending a frontline attacker at the base', () => {
  const state = base(); state.players[0].energy = 3; state.players[1].hq = 3;
  const attacker = unit(state, 's-contest', 0, 0); state.players[0].support[0] = null;
  attacker.row = 'front'; state.front = { owner: 0, slots: [attacker, null, null, null, null] };
  unit(state, 's-tutor', 1, 1, { health: 2 }); hand(state, ['c-question']);
  finishTurn(state);
});
test('unknown draws cannot become invented winning cards and hidden permutations do not affect tactics', () => {
  const state = base(); state.players[0].energy = 2; state.players[1].hq = 2; hand(state, ['n-break']);
  state.players[0].deck = ['c-question'];
  assert.equal(findWinningAction(getObservation(state, 0), getLegalActions(state)), null, 'the search cannot play an unknown drawn placeholder');
  const first = chooseAction(getObservation(state, 0), getLegalActions(state));
  state.players[0].deck = ['n-finals']; state.players[1].deck.reverse(); state.players[1].hand.reverse();
  assert.deepEqual(chooseAction(getObservation(state, 0), getLegalActions(state)), first);
});
test('AI avoids fatal fatigue and enemy death triggers when a non-losing action exists', () => {
  let state = base(); state.players[0].hq = 1; state.players[0].deck = ['n-food']; hand(state, ['n-break']);
  unit(state, 'c-journal', 0, 0, { sick: true });
  assert.equal(chooseAction(getObservation(state, 0), getLegalActions(state)).type, 'endTurn');
  state = base(); state.players[0].hq = 2; state.players[1].hq = 20;
  unit(state, 'c-forum', 1, 0, { health: 1 }); unit(state, 's-stars', 0, 0);
  const action = chooseAction(getObservation(state, 0), getLegalActions(state));
  assert.notEqual(action.target, 'qa-1-0');
  assert.notEqual(applyAction(state, action).state.winner, 1);
});
