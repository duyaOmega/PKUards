import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CARD_MAP, PRESETS, RULES, validateDeck } from '../web/data.js';
import { createGame, applyAction, getLegalActions, findUnit, validateState } from '../web/engine.js';
import { createStorage } from '../web/storage.js';
import { encodeDeck, decodeDeck } from '../web/deck-code.js';
import { auditCards } from '../scripts/balance.mjs';

function base() {
  let state = createGame({ playerDeck: PRESETS[0], aiDeck: PRESETS[1], seed: 581, firstPlayer: 0 });
  for (const player of [0,1]) state = applyAction(state, { type: 'mulligan', player, cards: [] }).state;
  state.players[0].energy = state.players[0].maxEnergy = 12; state.players[0].hand = [];
  return state;
}
let counter = 0;
function put(state, cardId, owner = 1, extra = {}) {
  const card = CARD_MAP[cardId], row = extra.row || 'support', slot = extra.slot ?? 0;
  const unit = { id: 'balance-unit-' + ++counter, cardId, owner, attack: card.attack, health: card.health, maxHealth: card.health, opCost: card.opCost,
    keywords: [...card.keywords], row, slot, sick: false, moved: false, attacked: false, ...extra };
  if (row === 'front') { state.front.owner = owner; state.front.slots[slot] = unit; } else state.players[owner].support[slot] = unit;
  return unit;
}
function cast(state, cardId, target, slot) {
  const hand = { id: 'balance-card-' + ++counter, cardId }; state.players[0].hand.unshift(hand);
  const result = applyAction(state, { type: 'play', player: 0, card: hand.id, ...(target ? { target } : {}), ...(slot === undefined ? {} : { slot }) });
  assert.ok(result.ok, result.error); assert.ok(validateState(result.state)); return result.state;
}

test('shared basics and three specialists per discipline replace duplicate faction whiteboards', () => {
  const audit = auditCards(); assert.equal(audit.cardCount, 64); assert.equal(audit.units, 24); assert.equal(audit.orders, 40);
  assert.deepEqual(audit.duplicateUnits, []); assert.deepEqual(audit.sameMechanicsBodyDominance, []);
  assert.equal(CARDS.filter(c => c.faction === 'neutral' && c.kind === 'unit').length, 12);
  for (const faction of ['science','engineering','humanities','society']) {
    const units = CARDS.filter(c => c.faction === faction && c.kind === 'unit');
    assert.equal(units.length, 3); assert.ok(units.every(c => c.signature));
    assert.equal(CARDS.filter(c => c.faction === faction && c.kind === 'event').length, 9);
  }
  assert.equal(CARD_MAP['s-fresh'].kind, 'event'); assert.equal(CARD_MAP['h-reader'].kind, 'event');
  assert.deepEqual(['cost','opCost','attack','health'].map(k => CARD_MAP['n-library'][k]), [1,1,1,3]);
});

test('starter compositions can choose different common curves without breaking copies or deck size', () => {
  for (const deck of PRESETS) {
    assert.deepEqual(validateDeck(deck), []); assert.equal(deck.rulesVersion, RULES.version);
    assert.equal(deck.cards.length, 39);
    const expected = ['science','engineering'].includes(deck.faction) ? 26 : 24;
    assert.equal(deck.cards.filter(id => CARD_MAP[id].kind === 'unit').length, expected);
  }
  assert.ok(PRESETS[1].cards.includes('n-rain')); assert.ok(!PRESETS[1].cards.includes('n-tower'));
  assert.ok(PRESETS[2].cards.includes('n-tower')); assert.ok(!PRESETS[2].cards.includes('n-rain'));
});

test('attack reduction clamps at zero, persists and never disables movement', () => {
  let state = base(); const unit = put(state, 'n-library');
  state = cast(state, 'c-law', unit.id);
  assert.equal(findUnit(state, unit.id).attack, 0); assert.equal(findUnit(state, unit.id).health, 3);
  state = applyAction(state, { type: 'endTurn', player: 0 }).state;
  assert.ok(getLegalActions(state).some(a => a.type === 'move' && a.unit === unit.id));
  assert.ok(!getLegalActions(state).some(a => a.type === 'attack' && a.unit === unit.id));
  assert.equal(findUnit(state, unit.id).attack, 0);
  const values = new Map(), storage = createStorage({ getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) });
  storage.saveMatch(state); assert.equal(findUnit(storage.loadMatch(), unit.id).attack, 0);
});

test('research hand-size condition counts the cards remaining after the order leaves hand', () => {
  for (const remaining of [4,5]) {
    let state = base(); const foe = put(state, 'n-photo', 1, { health: 5 });
    state.players[0].hand = Array.from({ length: remaining }, (_, i) => ({ id: 'held-' + i, cardId: 'n-finals' }));
    state = cast(state, 's-insight', foe.id);
    if (remaining === 5) assert.equal(findUnit(state, foe.id), undefined);
    else assert.equal(findUnit(state, foe.id).health, 2);
  }
});

test('follow-up questioning uses the actual reduced attack of the chosen unit', () => {
  let state = base(); const foe = put(state, 'n-rain', 1, { attack: 3, health: 4 });
  state = cast(state, 'c-law', foe.id); assert.equal(findUnit(state, foe.id).attack, 1);
  state = cast(state, 'c-strategy', foe.id); assert.equal(findUnit(state, foe.id), undefined);
  state = base(); const other = put(state, 'n-photo', 1, { attack: 2, health: 5 });
  state = cast(state, 'c-strategy', other.id); assert.equal(findUnit(state, other.id).health, 2);
});

test('night iteration refreshes once per own turn and that limit survives serialization', () => {
  let state = base(); const night = put(state, 'e-night', 0, { row: 'front', attacked: true, moved: true });
  state = cast(state, 'n-break'); assert.equal(findUnit(state, night.id).attacked, false);
  state = applyAction(state, { type: 'attack', player: 0, unit: night.id, target: 'hq:1' }).state;
  state = JSON.parse(JSON.stringify(state)); state = cast(state, 'n-break');
  assert.equal(findUnit(state, night.id).attacked, true);
  assert.ok(!getLegalActions(state).some(a => a.type === 'attack' && a.unit === night.id));
  state = applyAction(state, { type: 'endTurn', player: 0 }).state;
  state = applyAction(state, { type: 'endTurn', player: 1 }).state;
  state = applyAction(state, { type: 'attack', player: 0, unit: night.id, target: 'hq:1' }).state;
  state = cast(state, 'n-break'); assert.ok(getLegalActions(state).some(a => a.type === 'attack' && a.unit === night.id));
});

test('repair trades a fragile body for a targeted heal and operation efficiency', () => {
  let state = base(); const friend = put(state, 'n-photo', 0, { health: 5 });
  state = cast(state, 'e-repair', friend.id, 1);
  assert.equal(findUnit(state, friend.id).health, 7); assert.equal(findUnit(state, friend.id).opCost, 1);
  assert.equal(state.players[0].support[1].health, 2);
  state = base(); state.players[0].hq = 17; state = cast(state, 'e-repair', 'hq:0', 1);
  assert.equal(state.players[0].hq, 19); assert.ok(validateState(state));
});

test('new share codes identify the card pool while legacy codes remain reviewable drafts', () => {
  const code = encodeDeck(PRESETS[0]); assert.match(code, /^PKU2\./);
  const body = JSON.parse(Buffer.from(code.slice(5), 'base64url').toString('utf8'));
  assert.equal(body.r, 3); assert.equal(decodeDeck(code).rulesVersion, 3);
  body.v = 1; delete body.r;
  const legacy = decodeDeck('PKU1.' + Buffer.from(JSON.stringify(body)).toString('base64url'));
  assert.equal(legacy.rulesVersion, 2); assert.equal(legacy.cards.length, 39); assert.deepEqual(validateDeck(legacy), []);
});

test('the version 3 update resets the old match but preserves decks, stats, settings and journal', () => {
  const old = base(); old.version = 2;
  const decks = PRESETS.map(d => { const copy = structuredClone(d); delete copy.rulesVersion; return copy; });
  const stats = { wins: 2, losses: 1, draws: 0, completed: ['old-a','old-b','old-c'] };
  const journey = { version: 1, chapters: { 'west-gate': { stars: 3, rounds: 8 } } };
  const settings = { reducedMotion: true, aiSpeed: 250 };
  const values = new Map(Object.entries({ match: old, decks, stats, journey, settings }).map(([k,v]) => ['pkuards:v1:' + k, JSON.stringify(v)]));
  const storage = createStorage({ getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) });
  assert.deepEqual(storage.loadDecks(), decks); assert.match(storage.warning(), /部分单位已改为指令/);
  assert.equal(storage.loadMatch(), null); assert.match(storage.warning(), /旧对局需要重新开始/);
  assert.deepEqual(storage.loadStats(), stats); assert.deepEqual(storage.loadJourney(), journey); assert.deepEqual(storage.loadSettings(), settings);
  assert.equal(JSON.parse(values.get('pkuards:v1:match')).version, 2, 'reading recovery leaves the original saved evidence intact');
});
