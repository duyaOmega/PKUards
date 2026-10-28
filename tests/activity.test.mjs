import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, validateState } from '../web/engine.js';
import { PRESETS } from '../web/data.js';

test('background and page lifecycle pause AI, commit pending intent once and resume safely', async () => {
  let fixture = createGame({ playerDeck: PRESETS[0], aiDeck: PRESETS[1], seed: 73, firstPlayer: 0 });
  for (const player of [0, 1]) fixture = applyAction(fixture, { type: 'mulligan', player, cards: [] }).state;
  fixture.currentPlayer = 1; fixture.turn = 2;
  fixture.players[1].energy = fixture.players[1].maxEnergy = 5;
  fixture.players[1].hand = [{ id: 'activity-robot', cardId: 'e-robot' }];
  const stored = new Map([['pkuards:v1:match', JSON.stringify(fixture)]]), timers = new Map(), appEvents = {}, documentEvents = {}, pageEvents = {};
  let nextTimer = 0;
  const original = { document: globalThis.document, window: globalThis.window, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const root = { innerHTML: '', querySelector: () => null, addEventListener: (name, handler) => { appEvents[name] = handler; } };
  const doc = { visibilityState: 'hidden', activeElement: null, body: { classList: { toggle() {} } }, querySelector: selector => selector === '#app' ? root : { textContent: '' }, querySelectorAll: () => [], getElementById: () => null, addEventListener: (name, handler) => { documentEvents[name] = handler; } };
  globalThis.document = doc;
  globalThis.window = { localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) }, scrollTo() {}, addEventListener: (name, handler) => { pageEvents[name] = handler; } };
  globalThis.setTimeout = fn => { const id = ++nextTimer; timers.set(id, fn); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  const state = () => JSON.parse(stored.get('pkuards:v1:match'));
  const visible = value => { doc.visibilityState = value ? 'visible' : 'hidden'; documentEvents.visibilitychange(); };
  const tick = () => { const [id, fn] = [...timers.entries()].at(-1); timers.delete(id); fn(); };
  try {
    await import('../web/app.js?activity-regression');
    assert.equal(timers.size, 0, 'a restored background tab must not start AI');
    visible(true); assert.equal(timers.size, 1);
    const staleAi = [...timers.values()][0]; visible(false); staleAi();
    assert.deepEqual(state(), fixture, 'even an already queued AI callback checks visibility');
    visible(true); tick(); assert.match(root.innerHTML, /cinema-reveal/);
    assert.equal(state().players[1].energy, 5, 'reveal has not charged the deployment yet');
    const staleReveal = [...timers.values()][0]; visible(false); staleReveal();
    assert.equal(state().players[1].energy, 2); assert.ok(state().players[1].support[0]);
    assert.equal(timers.size, 0, 'hiding completes one pending action without scheduling another');
    pageEvents.pagehide(); assert.equal(state().players[1].energy, 2);
    visible(true); assert.equal(timers.size, 0, 'a hidden page cannot resume before pageshow');
    pageEvents.pageshow(); assert.equal(timers.size, 1); tick();
    const staleMove = [...timers.values()][0]; pageEvents.pagehide(); staleMove();
    assert.equal(state().players[1].energy, 1); assert.equal(state().front.owner, 1);
    assert.equal(timers.size, 0, 'pagehide prevents the playback completion from restarting AI');
    pageEvents.pageshow(); tick(); visible(false);
    assert.equal(state().players[1].energy, 0); assert.equal(state().players[0].hq, 17);
    assert.equal(state().history.filter(event => event.kind === 'attack').length, 1);
    assert.ok(validateState(state()));
  } finally {
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
