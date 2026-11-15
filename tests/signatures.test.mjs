import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CARD_MAP, PRESETS } from '../web/data.js';
import { createGame, applyAction, findUnit, allUnits } from '../web/engine.js';
import { createStorage } from '../web/storage.js';
function base(){let s=createGame({playerDeck:PRESETS[0],aiDeck:PRESETS[1],seed:9,firstPlayer:0});for(const player of [0,1])s=applyAction(s,{type:'mulligan',player,cards:[]}).state;s.players[0].energy=s.players[0].maxEnergy=12;return s;}
let next=200;
function place(s,id,row='support',slot=0,extra={}){const c=CARD_MAP[id];const u={id:`qa-${next++}`,cardId:id,owner:0,attack:c.attack,health:c.health,maxHealth:c.health,opCost:c.opCost,keywords:[...c.keywords],row,slot,sick:false,moved:false,attacked:false,...extra};if(row==='support')s.players[0].support[slot]=u;else{s.front.owner=0;s.front.slots[slot]=u;}return u;}
function cast(s,id,target){const h={id:`qa-card-${next++}`,cardId:id};s.players[0].hand=[h];return applyAction(s,{type:'play',player:0,card:h.id,...(target?{target}:{})}).state;}
function cycle(s){s=applyAction(s,{type:'endTurn',player:0}).state;return applyAction(s,{type:'endTurn',player:1}).state;}
test('twelve faction signature units each have a real mechanic; shared bodies have no fake signature', () => {
  const units = CARDS.filter(c => c.signature);
  assert.equal(units.length, 12); assert.equal(new Set(units.map(c => c.signature)).size, 12);
  assert.ok(units.every(c => c.kind === 'unit' && c.faction !== 'neutral'));
});
test('proof grows once per own order turn; fieldwork draws and the shared tower stays a basic guard', () => {
  let s = base(), proof = place(s, 's-proof');
  s = cast(s, 'n-break'); assert.equal(findUnit(s, proof.id).attack, 3); assert.equal(findUnit(s, proof.id).maxHealth, 5);
  s = cast(s, 's-night'); assert.equal(findUnit(s, proof.id).attack, 3);
  s = cycle(s); assert.equal(findUnit(s, proof.id).attack, 3, 'ordinary turn draw is not an order');
  s = cast(s, 'n-break'); assert.equal(findUnit(s, proof.id).attack, 4);
  const field = place(s, 'c-field', 'support', 1), cards = s.players[0].hand.length;
  s = applyAction(s, { type: 'move', player: 0, unit: field.id, slot: 0 }).state;
  assert.equal(s.players[0].hand.length, cards + 1);
  const tower = place(s, 'n-tower', 'support', 3);
  s = applyAction(s, { type: 'move', player: 0, unit: tower.id, slot: 1 }).state;
  assert.equal(findUnit(s, tower.id).maxHealth, 5);
});
test('editor draws only once per own turn and the engineering order enables another attack', () => {
  let s = base(); place(s, 'c-journal'); const before = s.players[0].deck.length;
  s = cast(s, 'n-break'); assert.equal(s.players[0].deck.length, before - 2);
  s = cast(s, 'n-break'); assert.equal(s.players[0].deck.length, before - 3);
  const robot = place(s, 'e-robot', 'front', 0, { attacked: true });
  s = cast(s, 'e-script', robot.id); assert.equal(findUnit(s, robot.id).attacked, false); assert.equal(findUnit(s, robot.id).attack, 4);
  s = applyAction(s, { type: 'attack', player: 0, unit: robot.id, target: 'hq:1' }).state;
  assert.equal(s.players[1].hq, 16);
});
test('restoration heals its fixed neighbours; a shared basic unit has no humanities healing', () => {
  let s = base(); place(s, 'h-restore', 'support', 1);
  const friend = place(s, 'n-library', 'support', 0, { health: 1 }); s.players[0].hq = 15;
  s = cycle(s); assert.equal(s.players[0].hq, 16); assert.equal(findUnit(s, friend.id).health, 2);
  s = base(); const lake = place(s, 'n-lake'); s.players[0].hq = 10;
  s = cycle(s); assert.equal(s.players[0].hq, 10);
  s = applyAction(s, { type: 'move', player: 0, unit: lake.id, slot: 0 }).state;
  s = cycle(s); assert.equal(s.players[0].hq, 10);
});
test('observation rewards the front, dispatch reduces operation costs and lecture summons only in crisis', () => {
  let s = base(); const front = place(s, 'n-library', 'front', 0), before = s.players[0].deck.length;
  s = cast(s, 's-stars'); assert.equal(s.players[0].deck.length, before - 2); assert.equal(findUnit(s, front.id).maxHealth, 4);
  const tank = place(s, 'e-robot', 'support', 1);
  s = cast(s, 'e-server'); assert.equal(findUnit(s, tank.id).opCost, 0); assert.equal(findUnit(s, front.id).opCost, 0);
  for (const hq of [10, 11]) {
    s = base(); s.players[0].hq = hq; s.players[0].hand = [{ id: 'lecture', cardId: 'h-lecture' }];
    s = applyAction(s, { type: 'play', player: 0, card: 'lecture', slot: 0 }).state;
    assert.equal(allUnits(s, 0).length, hq === 10 ? 2 : 1);
  }
});
test('versions 1 and 2 matches reset with a specific notice while decks and records survive', () => {
  for (const version of [1, 2]) {
    const map = new Map([['pkuards:v1:match', JSON.stringify({ version })], ['pkuards:v1:decks', JSON.stringify(PRESETS)]]);
    const store = createStorage({ getItem: k => map.get(k) || null, setItem: (k,v) => map.set(k,v) });
    assert.equal(store.loadMatch(), null); assert.match(store.warning(), /共享单位与学科指令/); assert.equal(store.loadDecks().length, 4);
  }
});
