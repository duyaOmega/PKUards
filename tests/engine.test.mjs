import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CARD_MAP, FACTIONS, PRESETS, RULES, validateDeck } from '../web/data.js';
import { createGame, applyAction, getLegalActions, allUnits, findUnit, canAttack, getObservation, validateState, actionKey } from '../web/engine.js';
import { chooseAction } from '../web/ai.js';
import { simulate } from '../scripts/simulate.mjs';

function base() {
  let s = createGame({ playerDeck: PRESETS[0], aiDeck: PRESETS[1], seed: 1234, firstPlayer: 0 });
  for (const player of [0, 1]) s = applyAction(s, { type: 'mulligan', player, cards: [] }).state;
  s.players[0].energy = s.players[0].maxEnergy = 12;
  return s;
}
let uid = 1;
function place(s, cardId, owner = 0, row = 'support', slot = 0, extra = {}) {
  const c = CARD_MAP[cardId];
  const u = { id: `fixture-${uid++}`, cardId, owner, attack: c.attack, health: c.health, maxHealth: c.health, opCost: c.opCost, keywords: [...c.keywords], row, slot, sick: false, moved: false, attacked: false, ...extra };
  if (row === 'front') { s.front.owner = owner; s.front.slots[slot] = u; } else s.players[owner].support[slot] = u;
  return u;
}
function hand(s, cardId) { const h = { id: `fixture-card-${uid++}`, cardId }; s.players[0].hand = [h]; return h; }
function play(s, h, options = {}) { return applyAction(s, { type: 'play', player: 0, card: h.id, ...options }); }

test('64 unique collectable cards, valid faction counts and four legal starter decks', () => {
  assert.equal(CARDS.length, 64); assert.equal(new Set(CARDS.map(c => c.id)).size, 64);
  for (const f of Object.keys(FACTIONS)) assert.equal(CARDS.filter(c => c.faction === f).length, f === 'neutral' ? 16 : 12);
  for (const c of CARDS) {
    assert.ok(Number.isInteger(c.cost) && c.cost > 0 && c.cost <= 12);
    assert.ok(c.name && c.text && c.flavor && c.art);
    if (c.kind === 'unit') { assert.ok(c.attack >= 0 && c.health > 0 && c.opCost >= 0); }
  }
  for (const d of PRESETS) { assert.equal(d.cards.length, 39); assert.deepEqual(validateDeck(d), []); }
});
test('deck validation enforces count, faction, ally limit, copies and collectable IDs', () => {
  const d = structuredClone(PRESETS[0]); d.cards.pop(); assert.match(validateDeck(d).join(), /39/);
  d.cards.push('s-fresh'); assert.match(validateDeck(d).join(), /最多 2/);
  d.cards[0] = 't-robot'; assert.match(validateDeck(d).join(), /未知/);
  const allied = structuredClone(PRESETS[0]); allied.ally = 'engineering';
  allied.cards = [...CARDS.filter(c => c.faction === 'engineering').slice(0, 7).flatMap(c => [c.id, c.id]), ...PRESETS[0].cards.slice(0, 25)];
  assert.match(validateDeck(allied).join(), /副阵营最多 12/);
  allied.ally = null; assert.match(validateDeck(allied).join(), /不属于/);
  assert.throws(() => createGame({ playerDeck: { ...PRESETS[0], cards: [] }, aiDeck: PRESETS[1] }), /39/);
});
test('seeded shuffling, first-player hand sizes and one-time mulligan', () => {
  const make = () => createGame({ playerDeck: PRESETS[0], aiDeck: PRESETS[1], seed: 1, firstPlayer: 1 });
  let s = make(), same = make();
  assert.equal(s.players[0].hand.length, 5); assert.equal(s.players[1].hand.length, 4);
  assert.deepEqual(s.players[0].deck, same.players[0].deck);
  const oldId = s.players[0].hand[0].id, replaced = s.players[0].hand[0].cardId;
  const r = applyAction(s, { type: 'mulligan', player: 0, cards: [oldId] });
  assert.ok(r.ok); s = r.state;
  assert.ok(!s.players[0].hand.some(c => c.id === oldId)); assert.ok(s.players[0].deck.includes(replaced));
  assert.equal(s.players[0].hand.length + s.players[0].deck.length, 39);
  assert.equal(applyAction(s, { type: 'mulligan', player: 0, cards: [] }).ok, false);
  s = applyAction(s, { type: 'mulligan', player: 1, cards: [] }).state;
  assert.equal(s.currentPlayer, 1); assert.equal(s.players[1].energy, 1); assert.equal(s.players[1].hand.length, 5);
});
test('illegal actions return the original state without mutation', () => {
  const s = base(), snapshot = structuredClone(s), h = hand(s, 's-fresh'); snapshot.players[0].hand = structuredClone(s.players[0].hand);
  const r = play(s, h, { slot: 2 }); assert.equal(r.ok, false); assert.equal(r.state, s); assert.deepEqual(s, snapshot);
  assert.equal(applyAction(s, { type: 'endTurn', player: 1 }).ok, false);
});
test('deployment pays once, normal units wait, and blitz unlocks the deployment turn', () => {
  let s = base(), h = hand(s, 's-fresh'); s = play(s, h, { slot: 1 }).state;
  assert.equal(s.players[0].energy, 11); const u = s.players[0].support[1]; assert.ok(u.sick);
  assert.ok(!getLegalActions(s).some(a => a.unit === u.id));
  s = base(); h = hand(s, 'e-robot'); s = play(s, h, { slot: 1 }).state;
  assert.equal(s.players[0].energy, 9); assert.ok(getLegalActions(s).some(a => a.type === 'move'));
});
test('frontline move pays operation cost and ordinary infantry cannot move then attack', () => {
  let s = base(), u = place(s, 's-fresh'); const energy = s.players[0].energy;
  s = applyAction(s, { type: 'move', player: 0, unit: u.id, slot: 2 }).state;
  assert.equal(s.front.owner, 0); assert.equal(s.players[0].support[0], null); assert.equal(s.players[0].energy, energy - 1);
  assert.equal(findUnit(s, u.id).row, 'front'); assert.ok(!getLegalActions(s).some(a => a.unit === u.id));
  assert.ok(!getLegalActions(s).some(a => a.type === 'move' && a.unit === u.id));
});
test('tank may move then attack once, paying for each operation', () => {
  let s = base(), u = place(s, 'e-robot');
  s = applyAction(s, { type: 'move', player: 0, unit: u.id, slot: 0 }).state;
  assert.ok(getLegalActions(s).some(a => a.unit === u.id && a.type === 'attack'));
  s = applyAction(s, { type: 'attack', player: 0, unit: u.id, target: 'hq:1' }).state;
  assert.equal(s.players[1].hq, 17); assert.equal(s.players[0].energy, 10);
  assert.ok(!getLegalActions(s).some(a => a.unit === u.id));
});
test('enemy frontline blocks entry; removing its last occupant releases ownership', () => {
  let s = base(), mine = place(s, 's-fresh'), enemy = place(s, 's-fresh', 1, 'front', 1);
  assert.ok(!getLegalActions(s).some(a => a.type === 'move'));
  assert.ok(canAttack(s, mine, enemy.id)); assert.ok(!canAttack(s, mine, 'hq:1'));
  const h = hand(s, 's-insight'); s = play(s, h, { target: enemy.id }).state;
  assert.equal(s.front.owner, null); assert.ok(getLegalActions(s).some(a => a.type === 'move'));
});
test('guard protects adjacent slots including HQ, ranged bypass and smoke targeting', () => {
  const s = base(), attacker = place(s, 'c-debate'), guard = place(s, 'n-tower', 1, 'support', 1), far = place(s, 's-fresh', 1, 'support', 4), hidden = place(s, 'c-field', 1, 'support', 0);
  assert.equal(canAttack(s, attacker, 'hq:1'), false); assert.ok(canAttack(s, attacker, guard.id)); assert.ok(canAttack(s, attacker, far.id)); assert.equal(canAttack(s, attacker, hidden.id), false);
  const artillery = place(s, 's-stars', 0, 'support', 1); assert.ok(canAttack(s, artillery, 'hq:1')); assert.equal(canAttack(s, artillery, hidden.id), false);
  const h = hand(s, 's-insight'); assert.ok(getLegalActions(s).some(a => a.card === h.id && a.target === hidden.id));
});
test('smoke is removed by moving or attacking', () => {
  let s = base(), u = place(s, 'c-field'); s = applyAction(s, { type: 'move', player: 0, unit: u.id, slot: 0 }).state;
  assert.ok(!findUnit(s, u.id).keywords.includes('smoke'));
});
test('fighter intercepts bombers on its own row and retaliates against them', () => {
  let s = base(), bomber = place(s, 'n-stage'), fighter = place(s, 'c-law', 1, 'support', 1), enemy = place(s, 's-fresh', 1, 'support', 4);
  assert.equal(canAttack(s, bomber, 'hq:1'), false); assert.equal(canAttack(s, bomber, enemy.id), false); assert.ok(canAttack(s, bomber, fighter.id));
  s = applyAction(s, { type: 'attack', player: 0, unit: bomber.id, target: fighter.id }).state;
  assert.equal(findUnit(s, bomber.id).health, 1); assert.equal(findUnit(s, fighter.id), undefined);
});
test('artillery avoids retaliation and bombers do not retaliate when attacked', () => {
  let s = base(), arty = place(s, 's-stars'), enemy = place(s, 's-institute', 1, 'support', 0);
  s = applyAction(s, { type: 'attack', player: 0, unit: arty.id, target: enemy.id }).state;
  assert.equal(findUnit(s, arty.id).health, 3); assert.equal(findUnit(s, enemy.id).health, 5);
  s = base(); const a = place(s, 'c-debate'), b = place(s, 's-forum', 1, 'support', 0);
  s = applyAction(s, { type: 'attack', player: 0, unit: a.id, target: b.id }).state;
  assert.equal(findUnit(s, a.id).health, 3);
});
test('deploy, death and start-of-turn triggers resolve through the same engine', () => {
  let s = base(), h = hand(s, 'c-case'), before = s.players[0].deck.length; s = play(s, h, { slot: 0 }).state;
  assert.equal(s.players[0].hand.length, 1); assert.equal(s.players[0].deck.length, before - 1);
  s = base(); const lab = place(s, 's-lab', 1, 'front', 0), h2 = hand(s, 's-insight'), enemyHand = s.players[1].hand.length;
  s = play(s, h2, { target: lab.id }).state; assert.equal(s.players[1].hand.length, enemyHand + 1);
  s = base(); const proof = place(s, 's-proof');
  s = applyAction(s, { type: 'endTurn', player: 0 }).state; s = applyAction(s, { type: 'endTurn', player: 1 }).state;
  assert.equal(findUnit(s, proof.id).attack, 4);
});
test('buff increases health cap, heal respects cap, zero operation cost remains finite', () => {
  let s = base(), u = place(s, 'e-robot', 0, 'support', 0, { health: 1 });
  s = play(s, hand(s, 's-repeat'), { target: u.id }).state;
  assert.equal(findUnit(s, u.id).maxHealth, 4); assert.equal(findUnit(s, u.id).health, 3);
  s = play(s, hand(s, 'n-food'), { target: u.id }).state; assert.equal(findUnit(s, u.id).health, 4);
  s = base(); u = place(s, 'e-night'); s.players[0].energy = 0;
  s = applyAction(s, { type: 'move', player: 0, unit: u.id, slot: 0 }).state;
  assert.equal(s.players[0].energy, 0); assert.ok(!getLegalActions(s).some(a => a.unit === u.id));
});
test('summons use free backline slots and excess summons are skipped', () => {
  let s = base(); for (const slot of [0, 1, 3]) place(s, 's-fresh', 0, 'support', slot);
  s = play(s, hand(s, 'n-recruit')).state;
  assert.equal(s.players[0].support.filter(Boolean).length, 4); assert.equal(s.players[0].support[4].cardId, 't-volunteer');
  assert.equal(s.players[0].support[2], null);
});
test('draw overflow is discarded; repeated fatigue increments and may end the game', () => {
  let s = base(); s.players[0].hand = Array.from({ length: 9 }, (_, i) => ({ id: `overflow-${i}`, cardId: i ? 's-fresh' : 's-night' }));
  const discarded = s.players[0].discard.length; s = play(s, s.players[0].hand[0]).state;
  assert.equal(s.players[0].hand.length, 9); assert.equal(s.players[0].discard.length, discarded + 2);
  s = base(); s.players[0].deck = []; s.players[0].hq = 4; s.players[0].fatigue = 0;
  s = play(s, hand(s, 's-night')).state;
  assert.equal(s.players[0].fatigue, 2); assert.equal(s.players[0].hq, 0); assert.equal(s.winner, 1);
});
test('simultaneous death triggers can produce an exact draw; finished games reject actions', () => {
  let s = base(); s.players[0].hq = s.players[1].hq = 2;
  place(s, 'c-forum', 0, 'support', 0, { health: 3 }); place(s, 'c-forum', 1, 'support', 0, { health: 3 });
  s = play(s, hand(s, 'n-finals')).state;
  assert.equal(s.winner, 'draw'); assert.equal(s.phase, 'finished'); assert.deepEqual(getLegalActions(s), []); assert.equal(allUnits(s).length, 0);
});
test('targeted deployment requires both an empty slot and a valid target', () => {
  let s = base(), h = hand(s, 'c-strategy'); assert.equal(play(s, h, { slot: 0 }).ok, false);
  s = play(s, h, { slot: 0, target: 'hq:1' }).state; assert.equal(s.players[1].hq, 18);
  s = base(); h = hand(s, 'e-repair'); s.players[0].hq = 17;
  s = play(s, h, { slot: 1, target: 'hq:0' }).state; assert.equal(s.players[0].hq, 19);
});
test('AI observation excludes opponent hand and both deck orders; hidden permutations do not alter a decision', () => {
  const s = base(), view = getObservation(s, 0), actions = getLegalActions(s), first = chooseAction(view, actions);
  assert.equal(view.players[1].hand, undefined); assert.equal(view.players[0].deck, undefined); assert.equal(view.players[1].deck, undefined); assert.equal(view.rng, undefined);
  s.players[1].hand.reverse(); s.players[0].deck.reverse(); s.players[1].deck.reverse();
  assert.equal(actionKey(chooseAction(getObservation(s, 0), getLegalActions(s))), actionKey(first));
});
test('save-state validation rejects bad shape, reserved HQ slots, invalid cards and mixed frontline ownership', () => {
  const s = base(); assert.ok(validateState(s));
  const corrupt = structuredClone(s); corrupt.players[0].hand[0].cardId = 'missing'; assert.equal(validateState(corrupt), false);
  const badFaction = structuredClone(s); badFaction.players[0].faction = 'missing'; assert.equal(validateState(badFaction), false);
  const badLog = structuredClone(s); badLog.history[0].kind = 'unknown'; assert.equal(validateState(badLog), false);
  place(s, 's-fresh', 0, 'support', 2); assert.equal(validateState(s), false);
  const mixed = base(); place(mixed, 's-fresh', 0, 'front', 0); place(mixed, 's-fresh', 1, 'front', 1); assert.equal(validateState(mixed), false);
});
test('all 32 faction/first-player pairings end normally with legal AI actions and valid states', { timeout: 60000 }, () => {
  const results = simulate(); assert.equal(results.length, 32); assert.ok(results.every(r => [0, 1, 'draw'].includes(r.winner)));
  assert.equal(new Set(results.map(r => `${r.player}/${r.opponent}/${r.firstPlayer}`)).size, 32);
});
