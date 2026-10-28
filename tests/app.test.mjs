import test from 'node:test';
import assert from 'node:assert/strict';
import { getLegalActions, getObservation } from '../web/engine.js';
import { chooseAction } from '../web/ai.js';
import { CARD_MAP } from '../web/data.js';

test('UI controller integrates tutorial, collection, custom deck, resume, full match and deduplicated result', async () => {
  // Minimal DOM adapter tests application state/handlers, not browser layout or native input.
  const handlers = {}, stored = new Map(), timers = new Map(); let nextTimer = 1;
  const original = { document: globalThis.document, window: globalThis.window, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const root = { innerHTML: '', addEventListener: (type, handler) => { handlers[type] = handler; }, querySelector: () => null }, announcer = { textContent: '' };
  globalThis.document = { activeElement: null, body: { classList: { toggle() {} } }, querySelector: selector => selector === '#app' ? root : selector === '#announcer' ? announcer : null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
  globalThis.window = { localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) }, scrollTo() {} };
  globalThis.setTimeout = fn => { const id = nextTimer++; timers.set(id, fn); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  const click = (action, data = {}) => handlers.click({ target: { closest: () => ({ dataset: { action, ...data } }) } });
  const state = () => JSON.parse(stored.get('pkuards:v1:match'));
  try {
    await import('../web/app.js?controller-test=1'); assert.match(root.innerHTML, /在燕园/);
    click('tutorial'); assert.match(root.innerHTML, /先把伙伴请到场上/);
    click('tutorial-next'); assert.match(root.innerHTML, /把优势，推向前线/);
    click('tutorial-next'); assert.match(root.innerHTML, /找到目标/);
    click('tutorial-next'); assert.match(root.innerHTML, /很好，你已经会出牌了/); assert.match(root.innerHTML, /♥ 17/);
    click('tutorial-next'); assert.match(root.innerHTML, /带上你的主张/);
    click('route', { view: 'collection' }); assert.match(root.innerHTML, /64 全部解锁/);
    click('filter-faction', { id: 'science' }); assert.match(root.innerHTML, /12 张卡牌/);
    click('route', { view: 'decks' }); click('edit-deck', { id: 'preset-engineering' });
    assert.match(root.innerHTML, /套牌合法/); click('remove-card', { id: 'n-food' }); assert.match(root.innerHTML, /当前 38 张/);
    click('add-card', { id: 'n-food' }); click('save-deck');
    const decks = JSON.parse(stored.get('pkuards:v1:decks')); assert.equal(decks.length, 1); assert.equal(decks[0].cards.length, 39);
    click('choose-deck', { id: decks[0].id }); click('start-game'); assert.equal(state().phase, 'mulligan');
    click('confirm-mulligan');
    let pending = [...timers.entries()].at(-1);
    if (pending) { timers.delete(pending[0]); pending[1](); }
    assert.equal(state().phase, 'battle');
    timers.clear(); await import('../web/app.js?controller-test=2'); assert.match(root.innerHTML, /未名湖畔的较量/);
    for (let steps = 0; steps < 2400 && (state().phase !== 'finished' || root.innerHTML.includes('data-playback="true"')); steps++) {
      if (root.innerHTML.includes('data-playback="true"')) {
        const pending = [...timers.entries()].at(-1); assert.ok(pending, 'Animation must advance');
        timers.delete(pending[0]); pending[1](); continue;
      }
      const s = state();
      if (s.currentPlayer === 1) {
        const pending = [...timers.entries()].at(-1); assert.ok(pending, 'AI must schedule its next decision');
        timers.delete(pending[0]); pending[1](); continue;
      }
      const action = chooseAction(getObservation(s, 0), getLegalActions(s)); assert.ok(action);
      if (action.type === 'endTurn') click('end-turn');
      if (action.type === 'play') {
        const c = CARD_MAP[s.players[0].hand.find(h => h.id === action.card).cardId];
        click('hand', { id: action.card });
        if (c.kind === 'unit') click('slot', { row: 'support', owner: '0', slot: String(action.slot) });
        if (action.target) click(action.target.startsWith('hq:') ? 'target' : 'unit', { id: action.target });
      }
      if (action.type === 'move') { click('unit', { id: action.unit }); click('slot', { row: 'front', slot: String(action.slot) }); }
      if (action.type === 'attack') { click('unit', { id: action.unit }); click(action.target.startsWith('hq:') ? 'target' : 'unit', { id: action.target }); }
    }
    assert.equal(state().phase, 'finished'); assert.match(root.innerHTML, /ANOTHER PAGE IN YANYUAN/);
    assert.match(root.innerHTML, /同窗刚刚出牌/); assert.match(root.innerHTML, /对手已使用的卡牌/);
    const result = JSON.parse(stored.get('pkuards:v1:stats')); assert.equal(result.wins + result.losses + result.draws, 1);
    timers.clear(); await import('../web/app.js?controller-test=3');
    assert.deepEqual(JSON.parse(stored.get('pkuards:v1:stats')), result);
    click('route', { view: 'battle' }); click('show-result'); click('new-battle'); assert.match(root.innerHTML, /进入对局/);
  } finally {
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
