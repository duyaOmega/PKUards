import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_MAP, PRESETS, RULES } from '../web/data.js';
import { createGame, applyAction, getLegalActions, getObservation, validateState } from '../web/engine.js';
import { chooseAction } from '../web/ai.js';
import { trackJourneyAction } from '../web/journey.js';
import { createStorage } from '../web/storage.js';

function secondTurn() {
  let state = createGame({ playerDeck: PRESETS[1], aiDeck: PRESETS[0], seed: 581, firstPlayer: 1 });
  for (const player of [0,1]) state = applyAction(state, { type: 'mulligan', player, cards: [] }).state;
  return applyAction(state, { type: 'endTurn', player: 1 }).state;
}
const reserve = { type: 'reserve', player: 0 };
function put(state, cardId, extra = {}) {
  const card = CARD_MAP[cardId];
  const unit = { id: 'reserve-unit', cardId, owner: 0, attack: card.attack, health: card.health, maxHealth: card.health, opCost: card.opCost,
    keywords: [...card.keywords], row: 'support', slot: 0, sick: false, moved: false, attacked: false, ...extra };
  if (unit.row === 'front') { state.front.owner = 0; state.front.slots[0] = unit; } else state.players[0].support[0] = unit;
  return unit;
}

test('only the second player owns a once-only temporary reserve that enables an earlier deployment', () => {
  let state = secondTurn();
  assert.equal(state.players[0].reserveAvailable, true); assert.equal(state.players[1].reserveAvailable, false);
  state.players[0].hand = [{ id: 'reserve-card', cardId: 'n-bike' }];
  assert.ok(!getLegalActions(state).some(a => a.type === 'play'));
  const result = applyAction(state, reserve);
  assert.ok(result.ok); assert.equal(result.state.players[0].energy, 1 + RULES.reserveEnergy); assert.equal(result.state.players[0].maxEnergy, 1);
  assert.equal(result.state.players[0].reserveAvailable, false); assert.ok(validateState(result.state));
  assert.equal(applyAction(result.state, reserve).ok, false, 'replaying the same input never grants energy twice');
  state = applyAction(result.state, {type:'play',player:0,card:'reserve-card',slot:0}).state;
  assert.equal(state.players[0].energy, RULES.reserveEnergy - 1); assert.equal(state.players[0].support[0].cardId,'n-bike');
  state = applyAction(state, { type: 'endTurn', player: 0 }).state;
  state.players[1].energy = 0;
  assert.ok(!getLegalActions(state).some(a => a.type === 'reserve'), 'the first player cannot claim the compensation');
});

test('temporary energy expires at turn end and neither current nor later caps increase', () => {
  let state=secondTurn(); state.players[0].energy=state.players[0].maxEnergy=12;
  state=applyAction(state,reserve).state; assert.equal(state.players[0].energy,12+RULES.reserveEnergy); assert.ok(validateState(state));
  const saved=JSON.parse(JSON.stringify(state)); assert.ok(validateState(saved));
  state=applyAction(saved,{type:'endTurn',player:0}).state;
  assert.equal(state.players[0].energy,12); assert.equal(state.players[0].maxEnergy,12);
  state=applyAction(state,{type:'endTurn',player:1}).state;
  assert.equal(state.players[0].energy,12); assert.equal(state.players[0].maxEnergy,12);
  state.players[0].energy=13+RULES.reserveEnergy; assert.equal(validateState(state),false);
});

test('a reserve is retained across turns and its consumed state persists across reload', () => {
  let state = secondTurn();
  for (const player of [0,1]) state = applyAction(state, { type: 'endTurn', player }).state;
  state.players[0].energy = 0;
  state = applyAction(state, reserve).state;
  const values = new Map(), storage = createStorage({ getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) });
  storage.saveMatch(state); state = storage.loadMatch();
  assert.equal(state.players[0].reserveAvailable, false); assert.equal(state.players[0].energy, RULES.reserveEnergy);
  assert.equal(getObservation(state, 1).players[0].reserveAvailable, false);
  state.players[0].reserveAvailable = 'yes'; assert.equal(validateState(state), false);
  state.players[0].reserveAvailable = false; state.players[1].reserveAvailable = true; assert.equal(validateState(state), false);
});

test('the reserve neither occupies a card nor triggers order hooks or chapter order goals', () => {
  const state = secondTurn(); state.players[0].energy = 0;
  put(state, 'e-night', { attacked: true });
  state.journey = { chapterId: 'library', deckId: PRESETS[1].id, metrics: { units: 0, orders: 0, frontTurns: 0, turnOrders: 0, maxTurnOrders: 0 } };
  const hand = structuredClone(state.players[0].hand), discard = [...state.players[0].discard];
  const result = applyAction(state, reserve); trackJourneyAction(state, result, reserve);
  assert.deepEqual(result.state.players[0].hand, hand); assert.deepEqual(result.state.players[0].discard, discard);
  assert.equal(result.state.players[0].support[0].attacked, true);
  assert.equal(result.state.players[0].support[0].orderTriggeredTurn, undefined);
  assert.equal(result.state.journey.metrics.orders, 0); assert.equal(result.state.journey.metrics.turnOrders, 0);
  assert.equal(result.events.length, 1); assert.equal(result.events[0].kind, 'info');
});

test('AI holds the reserve when it unlocks nothing and spends it to unlock an affordable card', () => {
  const state = secondTurn(); state.players[0].maxEnergy = 3; state.players[0].energy = 0;
  state.players[0].hand = [{ id: 'reserve-card', cardId: 'n-keeper' }];
  assert.equal(chooseAction(getObservation(state, 0), getLegalActions(state)).type, 'endTurn');
  state.players[0].hand[0].cardId = 'n-library';
  const action = chooseAction(getObservation(state, 0), getLegalActions(state));
  assert.deepEqual(action, reserve);
  const next = applyAction(state, action).state;
  assert.equal(chooseAction(getObservation(next, 0), getLegalActions(next)).type, 'play');
});

test('the public tactical search finds a win that requires the one remaining reserve', () => {
  let state = secondTurn(); state.players[0].maxEnergy = 2; state.players[0].energy = 1;
  state.players[0].hand = []; state.players[1].hq = 5;
  put(state, 'n-photo', { row: 'front' });
  const action = chooseAction(getObservation(state, 0), getLegalActions(state)); assert.deepEqual(action, reserve);
  state = applyAction(state, action).state;
  state = applyAction(state, chooseAction(getObservation(state, 0), getLegalActions(state))).state;
  assert.equal(state.phase, 'finished'); assert.equal(state.winner, 0);
});

test('AI can reserve before spending on a weaker one-cost play when a better two-cost body becomes available',()=>{
 const state=secondTurn(); state.players[0].hand=[{id:'cheap-card',cardId:'n-library'},{id:'better-card',cardId:'n-lake'}];
 const action=chooseAction(getObservation(state,0),getLegalActions(state));assert.deepEqual(action,reserve);
 const next=applyAction(state,action).state;
 assert.equal(chooseAction(getObservation(next,0),getLegalActions(next)).card,'better-card');
});
