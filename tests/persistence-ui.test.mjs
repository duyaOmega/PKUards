import test from 'node:test';
import assert from 'node:assert/strict';

test('storage quota failures keep the deck in memory, offer sharing and never claim a durable save', async () => {
  const handlers = {}, timers = new Map(); let nextTimer = 0;
  const original = { document: globalThis.document, window: globalThis.window, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const root = { innerHTML: '', querySelector: () => null, addEventListener: (type, handler) => { handlers[type] = handler; } };
  globalThis.document = { activeElement: null, body: { classList: { toggle() {} } }, querySelector: selector => selector === '#app' ? root : { textContent: '' }, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
  globalThis.window = { localStorage: { getItem: () => null, setItem() { throw new Error('Quota exceeded'); } }, scrollTo() {} };
  globalThis.setTimeout = fn => { const id = ++nextTimer; timers.set(id, fn); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  const click = (action, data = {}) => handlers.click({ target: { closest: () => ({ dataset: { action, ...data } }) } });
  try {
    await import('../web/app.js?quota-regression');
    click('route', { view: 'decks' }); click('edit-deck', { id: 'preset-engineering' }); click('save-deck');
    assert.match(root.innerHTML, /套牌暂存于当前页面，刷新前请复制分享码/);
    assert.doesNotMatch(root.innerHTML, /套牌已保存，带上/);
    const customId = /data-action="share-deck" data-id="(custom-[^"]+)"/.exec(root.innerHTML)?.[1];
    assert.ok(customId, 'an unsaved in-memory deck remains available for export');
    click('share-deck', { id: customId }); assert.match(root.innerHTML, /PKU1\./);
    click('close-modal'); click('settings');
    handlers.change({ target: { dataset: { field: 'reduced-motion' }, checked: true } });
    assert.match(root.innerHTML, /浏览器未能保存进度/);
    click('close-modal'); click('delete-deck', { id: customId }); click('confirm-delete', { id: customId });
    assert.match(root.innerHTML, /刷新后可能恢复/);
  } finally {
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
