import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../web/data.js';
import { encodeDeck, decodeDeck } from '../web/deck-code.js';

const payload = value => 'PKU1.' + Buffer.from(JSON.stringify(value)).toString('base64url');
function raw() { return JSON.parse(Buffer.from(encodeDeck(PRESETS[0]).slice(5), 'base64url').toString('utf8')); }
test('all presets share stable compositions and Unicode names without private save data', () => {
  for (const original of PRESETS) {
    const deck = { ...original, name: '我的「燕园」🌊', privateId: 'must-not-leak', match: { hand: ['secret'] } };
    const code = encodeDeck(deck), decoded = decodeDeck(code);
    assert.match(code, /^PKU1\.[\w-]+$/); assert.ok(code.length < 1500);
    assert.equal(decoded.name, deck.name); assert.equal(decoded.faction, deck.faction); assert.equal(decoded.ally, null);
    assert.deepEqual([...decoded.cards].sort(), [...deck.cards].sort()); assert.equal(decoded.preset, false);
    assert.equal(encodeDeck({ ...deck, cards: [...deck.cards].reverse() }), code, 'same composition has the same code');
    const body = Buffer.from(code.slice(5), 'base64url').toString('utf8');
    assert.ok(!body.includes('secret') && !body.includes('privateId') && !body.includes('must-not-leak'));
    assert.deepEqual(decodeDeck(code.slice(0, 50) + '\n  ' + code.slice(50)), decoded, 'wrapped clipboard codes work');
  }
});
test('malformed, unsupported and invalid deck codes never produce a playable deck', () => {
  for (const invalid of ['', 'PKU2.anything', 'PKU1.%%%%', 'PKU1.a', 'x'.repeat(8193), 'PKU1.' + Buffer.from('not json').toString('base64url')]) assert.throws(() => decodeDeck(invalid));
  const changes = [
    v => { v.v = 2; }, v => { v.n = ''; }, v => { v.n = '字'.repeat(41); },
    v => { v.f = '__proto__'; }, v => { v.a = 'constructor'; }, v => { v.c[0][0] = 't-robot'; },
    v => { v.c[0][0] = '__proto__'; }, v => { v.c[0][1] = 3; }, v => { v.c[0][1] = 1.5; },
    v => { v.c.pop(); }, v => { v.c.push(v.c[0]); }, v => { v.c = {}; },
    v => { v.c[0] = ['s-fresh', 1, 'extra']; }
  ];
  for (const change of changes) { const value = raw(); change(value); assert.throws(() => decodeDeck(payload(value)), undefined, change.toString()); }
  assert.throws(() => encodeDeck({ ...PRESETS[0], cards: [] }));
});
test('ally composition survives transfer and each import leaves the source deck independent', () => {
  const original = structuredClone(PRESETS[0]); original.ally = 'engineering'; original.cards[0] = 'e-night';
  const imported = decodeDeck(encodeDeck(original));
  assert.equal(imported.ally, 'engineering'); assert.ok(imported.cards.includes('e-night'));
  imported.cards.pop(); assert.equal(original.cards.length, 39);
});
