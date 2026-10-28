import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction } from '../web/engine.js';
import { PRESETS } from '../web/data.js';

test('touch swipes preserve selection and hand scroll; taps deploy, advance and attack exactly once', async () => {
  // Controller regression only: native scrolling and CSS layout need a real browser.
  let fixture = createGame({ playerDeck: PRESETS[1], aiDeck: PRESETS[0], seed: 73, firstPlayer: 0 });
  for (const player of [0, 1]) fixture = applyAction(fixture, { type: 'mulligan', player, cards: [] }).state;
  fixture.players[0].energy = fixture.players[0].maxEnergy = 12;
  fixture.players[0].hand = [{ id: 'touch-robot', cardId: 'e-robot' }, ...Array.from({ length: 8 }, (_, i) => ({ id: `touch-${i}`, cardId: 'n-break' }))];
  const stored = new Map([['pkuards:v1:match', JSON.stringify(fixture)]]), handlers = {}, timers = new Map();
  const original = { document: globalThis.document, window: globalThis.window, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  let markup = '', handTray, renders = 0, nextTimer = 0;
  const root = {
    get innerHTML() { return markup; },
    set innerHTML(value) { markup = value; handTray = value.includes('class="hand-tray"') ? { scrollLeft: 0 } : null; renders++; },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    querySelector: selector => selector === '.hand-tray' ? handTray : null
  };
  globalThis.document = { activeElement: null, body: { classList: { toggle() {} } }, querySelector: selector => selector === '#app' ? root : { textContent: '' }, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
  globalThis.window = { localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) }, scrollTo() {} };
  globalThis.setTimeout = fn => { const id = ++nextTimer; timers.set(id, fn); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  const click = (action, data = {}) => handlers.click({ target: { closest: () => ({ dataset: { action, ...data } }) } });
  const state = () => JSON.parse(stored.get('pkuards:v1:match'));
  const finishAnimation = () => {
    for (let i = 0; markup.includes('data-playback="true"') && i < 10; i++) {
      const timer = [...timers.entries()].at(-1); assert.ok(timer);
      timers.delete(timer[0]); timer[1]();
    }
    assert.ok(!markup.includes('data-playback="true"'));
  };
  try {
    await import('../web/app.js?touch-regression');
    handTray.scrollLeft = 384;
    click('hand', { id: 'touch-robot' });
    assert.equal(handTray.scrollLeft, 384, 'selection must not jump back to the first card');
    assert.match(markup, /部署「机器人小队」/);
    const beforeSwipe = renders, beforeState = stored.get('pkuards:v1:match');
    const touch = { pointerType: 'touch', pointerId: 9, button: 0, clientX: 200, clientY: 600, target: { closest() { throw Error('Touch must not enter mouse drag handling'); } }, preventDefault() { throw Error('Native swipe must not be prevented'); } };
    handlers.pointerdown(touch);
    handlers.pointermove({ ...touch, clientX: 60 });
    handlers.pointercancel(touch);
    handlers.pointerup(touch);
    assert.equal(renders, beforeSwipe, 'native pointer cancellation must not redraw the hand');
    assert.equal(stored.get('pkuards:v1:match'), beforeState, 'swiping spends no energy and plays no cards');
    assert.match(markup, /部署「机器人小队」/, 'selection survives a scroll gesture');
    click('slot', { row: 'support', owner: '0', slot: '1' }); finishAnimation();
    assert.equal(state().players[0].energy, 9);
    assert.equal(state().players[0].hand.length, 8);
    assert.equal(handTray.scrollLeft, 384, 'playback redraws also preserve the hand position');
    const unit = state().players[0].support[1]; assert.ok(unit);
    click('unit', { id: unit.id }); click('slot', { row: 'front', slot: '0' }); finishAnimation();
    assert.equal(state().front.slots[0].id, unit.id);
    assert.equal(state().players[0].energy, 8);
    click('unit', { id: unit.id }); click('target', { id: 'hq:1' }); finishAnimation();
    assert.equal(state().players[1].hq, 17);
    assert.equal(state().players[0].energy, 7);
    click('inspect', { id: 'e-robot' }); assert.match(markup, /aria-label="卡牌详情"/);
    click('close-modal'); assert.equal(handTray.scrollLeft, 384);
  } finally {
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
