import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../web/storage.js';
import { createGame, applyAction } from '../web/engine.js';
import { PRESETS, validateDeck } from '../web/data.js';

const record = () => ({ deck: { id: 'draft-test', name: '', faction: 'engineering', ally: null, cards: ['s-fresh', 'n-break'], preset: false }, resume: true });
function memory() { const values = new Map(); return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; }
test('incomplete and temporarily mismatched drafts round-trip without becoming playable decks', () => {
  const storage = createStorage(memory()), draft = record();
  assert.ok(validateDeck(draft.deck).length, 'an editor draft can still need repairs');
  storage.saveDraft(draft); assert.deepEqual(storage.loadDraft(), draft);
  storage.saveDraft({ ...draft, resume: false }); assert.equal(storage.loadDraft().resume, false);
  storage.saveDraft(null); assert.equal(storage.loadDraft(), null);
});
test('corrupt draft data recovers independently from valid saved decks', () => {
  const backing = memory(), storage = createStorage(backing); storage.saveDecks(PRESETS);
  for (const mutate of [
    v => { v.resume = 'yes'; }, v => { v.deck.id = ''; }, v => { v.deck.name = '字'.repeat(41); },
    v => { v.deck.faction = '__proto__'; }, v => { v.deck.ally = 'neutral'; }, v => { v.deck.cards = ['t-robot']; },
    v => { v.deck.cards = ['s-fresh', 's-fresh', 's-fresh']; }, v => { v.deck.cards = Array(40).fill('n-break'); }
  ]) {
    const value = record(); mutate(value); storage.saveDraft(value);
    assert.equal(storage.loadDraft(), null, mutate.toString()); assert.ok(storage.warning());
    assert.deepEqual(storage.loadDecks(), PRESETS);
  }
});
test('draft editing survives refresh, resumes deliberately and requires replacing an existing draft', async () => {
  let game = createGame({ playerDeck: PRESETS[0], aiDeck: PRESETS[1], seed: 31, firstPlayer: 0 });
  for (const player of [0, 1]) game = applyAction(game, { type: 'mulligan', player, cards: [] }).state;
  const backing = memory(); backing.setItem('pkuards:v1:match', JSON.stringify(game));
  const handlers = {}, timers = new Map(); let nextTimer = 0;
  const original = { document: globalThis.document, window: globalThis.window, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const root = { innerHTML: '', querySelector: () => null, addEventListener: (type, handler) => { handlers[type] = handler; } };
  globalThis.document = { activeElement: null, body: { classList: { toggle() {} } }, querySelector: selector => selector === '#app' ? root : { textContent: '' }, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
  globalThis.window = { localStorage: backing, scrollTo() {} };
  globalThis.setTimeout = fn => { const id = ++nextTimer; timers.set(id, fn); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  const click = (action, data = {}) => handlers.click({ target: { closest: () => ({ dataset: { action, ...data } }) } });
  const draft = () => JSON.parse(backing.getItem('pkuards:v1:draft'));
  try {
    await import('../web/app.js?draft-start'); click('route', { view: 'decks' }); click('new-deck');
    handlers.input({ target: { dataset: { field: 'deck-name' }, value: '两张牌的草稿' } });
    click('add-card', { id: 's-fresh' }); click('add-card', { id: 'n-break' });
    handlers.change({ target: { dataset: { field: 'deck-faction' }, value: 'engineering' } });
    assert.equal(draft().deck.cards.length, 2); assert.equal(draft().resume, true);
    await import('../web/app.js?draft-refresh');
    assert.match(root.innerHTML, /class="page builder-page"/); assert.match(root.innerHTML, /两张牌的草稿/);
    assert.equal(draft().deck.faction, 'engineering');
    click('route', { view: 'home' }); assert.equal(draft().resume, false);
    await import('../web/app.js?draft-return'); assert.match(root.innerHTML, /class="battle-page"/);
    click('route', { view: 'decks' }); assert.match(root.innerHTML, /还有一份编辑草稿/);
    click('resume-draft'); click('new-deck');
    assert.match(root.innerHTML, /开始另一份编辑/); assert.equal(draft().deck.name, '两张牌的草稿');
    click('resume-draft'); assert.equal(draft().deck.cards.length, 2);
    click('new-deck'); click('confirm-draft-change'); assert.equal(draft().deck.cards.length, 0);
    click('edit-deck', { id: 'preset-science' }); click('save-deck');
    assert.equal(draft(), null); assert.equal(JSON.parse(backing.getItem('pkuards:v1:decks')).length, 1);
    assert.deepEqual(JSON.parse(backing.getItem('pkuards:v1:match')), game, 'editing never overwrites the active battle');
  } finally {
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
