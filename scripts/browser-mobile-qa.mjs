/** Native Chromium touch and keyboard regression checks in an isolated profile. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createGame, applyAction } from '../web/engine.js';
import { PRESETS } from '../web/data.js';
import { connectBrowser } from './cdp.mjs';

const option = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const base = option('--base', 'http://localhost:4173/PKUards/');
const output = new URL('../artifacts/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await connectBrowser(option('--port', '9223'));
const { cdp, evaluate, until, errors, reload } = browser;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const match = () => evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:match'))`);
const selector = (action, attributes = '') => `[data-action="${action}"]${attributes}`;
let touchEnabled = true;
async function viewport(width, height, touch = true) {
  touchEnabled = touch;
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: touch });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: touch ? 5 : 1 });
}
async function point(query) {
  await until(`document.readyState === 'complete'`);
  return evaluate(`(async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const element = document.querySelector(${JSON.stringify(query)});
      if (!element) throw Error('Missing element: ' + ${JSON.stringify(query)});
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (!element.isConnected) continue;
      const r = element.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (r.width && r.height && x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && element.contains(document.elementFromPoint(x, y))) return { x, y };
    }
    throw Error('Element is not visible: ' + ${JSON.stringify(query)});
  })()`);
}
async function tap(query) {
  const position = await point(query);
  if (touchEnabled) {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [position] });
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
  } else {
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...position, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...position, button: 'left', clickCount: 1 });
  }
}
async function key(key, code, virtualKey, modifiers = 0) {
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKey, modifiers, ...(key === 'Enter' ? { text: '\r' } : {}) });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey, modifiers });
}
async function route(view) { await tap(view === 'lobby' ? '.faction-tile[data-id="preset-engineering"]' : selector('route', `[data-view="${view}"]`)); }
async function screenshot(name, full = false) {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
  await writeFile(new URL(`${name}.png`, output), Buffer.from(data, 'base64'));
}
async function restore(state) {
  await evaluate(`localStorage.setItem('pkuards:v1:match', ${JSON.stringify(JSON.stringify(state))})`); await reload();
  await until(`!!document.querySelector(${JSON.stringify(state.phase === 'mulligan' ? '.mulligan-page' : '.battle-page')})`);
}
function fixture() {
  let state = createGame({ playerDeck: PRESETS[1], aiDeck: PRESETS[3], seed: 73, firstPlayer: 0 });
  for (const player of [0, 1]) state = applyAction(state, { type: 'mulligan', player, cards: [] }).state;
  state.players[0].energy = state.players[0].maxEnergy = 12;
  state.players[0].hand = [{ id: 'touch-robot', cardId: 'e-robot' }, ...Array.from({ length: 8 }, (_, i) => ({ id: `touch-card-${i}`, cardId: 'n-break' }))];
  return state;
}
try {
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__touchLog = []; for (const type of ['pointerdown', 'pointerup', 'click']) document.addEventListener(type, event => window.__touchLog.push({ type, action: event.target.closest('[data-action]')?.dataset.action, y: event.clientY, scroll: scrollY }), true);` });
  await viewport(390, 844);
  await cdp('Page.navigate', { url: base }); await until(`!!document.querySelector('.site-header')`);
  await evaluate(`localStorage.clear()`); await reload(); await until(`!!document.querySelector('.hero')`);
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await reload(); await until(`!!document.querySelector('.hero')`);
  assert.ok(await evaluate(`document.body.classList.contains('reduced-motion')`), 'first launch follows the system motion preference');
  await tap(selector('settings'));
  assert.ok(await evaluate(`document.querySelector('[data-field="reduced-motion"]').checked`));
  await tap('[data-field="reduced-motion"]');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:settings')).reducedMotion`), false);
  await reload(); await until(`!!document.querySelector('.hero')`);
  assert.equal(await evaluate(`document.body.classList.contains('reduced-motion')`), false, 'a saved choice survives a system-default reload');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await evaluate(`localStorage.removeItem('pkuards:v1:settings')`); await reload(); await until(`!!document.querySelector('.hero')`);
  assert.equal(await evaluate(`document.body.classList.contains('reduced-motion')`), false);
  await route('lobby'); await tap(selector('start-game'));
  await tap(selector('confirm-mulligan')); await until(`!!document.querySelector('.battle-page')`);
  assert.equal(await evaluate('scrollY'), 0, 'a new battle starts at the top after the long mobile mulligan');

  // A known own-turn position avoids waiting on random AI decisions.
  await restore(fixture());
  await tap(selector('hand', '[data-id="touch-robot"]'));
  const beforeSwipe = JSON.stringify(await match());
  const tray = await evaluate(`document.querySelector('.hand-tray').getBoundingClientRect().toJSON()`);
  const start = { x: tray.right - 25, y: tray.top + 120 }, end = { x: tray.left + 25, y: start.y };
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  for (let i = 1; i <= 12; i++) {
    await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (end.x - start.x) * i / 12, y: start.y }] });
    await delay(20);
  }
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await until(`document.querySelector('.hand-tray').scrollLeft > 40`); await delay(300);
  assert.equal(JSON.stringify(await match()), beforeSwipe, 'native hand swipe cannot play a card or charge energy');
  assert.equal(await evaluate(`!!document.querySelector('.drag-ghost')`), false);
  assert.ok(await evaluate(`!!document.querySelector('.hand-tray .selected[data-id="touch-robot"]')`), 'selection survives a native swipe');
  const handScroll = await evaluate(`document.querySelector('.hand-tray').scrollLeft`);

  await tap(selector('slot', '[data-row="support"][data-owner="0"][data-slot="1"]'));
  await until(`!document.querySelector('.duel-cinema') && JSON.parse(localStorage.getItem('pkuards:v1:match')).players[0].energy === 9`);
  let state = await match();
  assert.equal(state.players[0].hand.length, 8);
  assert.ok(await evaluate(`document.querySelector('.hand-tray').scrollLeft > 0`), `hand position persists after play (${handScroll})`);
  const unit = state.players[0].support[1];
  await tap(selector('unit', `[data-id="${unit.id}"]`));
  await tap(selector('slot', '[data-row="front"][data-slot="0"]'));
  await until(`!document.querySelector('.duel-cinema') && JSON.parse(localStorage.getItem('pkuards:v1:match')).front.owner === 0`);
  await tap(selector('unit', `[data-id="${unit.id}"]`)); await tap(selector('target', '[data-id="hq:1"]'));
  await until(`!document.querySelector('.duel-cinema') && JSON.parse(localStorage.getItem('pkuards:v1:match')).players[1].hq === 17`);
  assert.equal((await match()).players[0].energy, 7, 'tap deployment, advance and attack each charge once');
  await tap(selector('inspect-unit', `[data-id="${unit.id}"]`));
  assert.ok(await evaluate(`!!document.activeElement.closest('.modal') && document.querySelector('.site-content').inert`), 'dialog receives focus and background becomes inert');
  await key('Escape', 'Escape', 27);
  assert.equal(await evaluate('document.activeElement.dataset.action'), 'inspect-unit', 'closing details returns focus');
  state = await match(); await reload(); await until(`!!document.querySelector('.battle-page')`);
  assert.deepEqual(await match(), state, 'touch-played position resumes exactly after reload');

  await route('collection');
  await evaluate(`(() => {
    const input = document.querySelector('#card-search'); window.__compositionInput = input; input.focus();
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.value = '机器人小队'; input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, inputType: 'insertCompositionText', data: '机器人小队' }));
  })()`);
  assert.ok(await evaluate(`document.querySelector('#card-search') === window.__compositionInput`), 'composition input is not replaced before the IME finishes');
  await evaluate(`document.querySelector('#card-search').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '机器人小队' }))`);
  await until(`document.querySelectorAll('.card-grid .game-card').length === 1`);
  assert.equal(await evaluate('document.activeElement.id'), 'card-search');
  await evaluate(`document.querySelector('.card-grid .game-card').focus()`); await key('Enter', 'Enter', 13);
  assert.ok(await evaluate(`!!document.activeElement.closest('.modal')`), JSON.stringify(await evaluate(`({ modal: !!document.querySelector('.modal'), active: document.activeElement.outerHTML.slice(0, 300) })`)));
  await key('Tab', 'Tab', 9, 1);
  assert.ok(await evaluate(`!!document.activeElement.closest('.modal')`), 'Shift+Tab stays inside the dialog');
  await key('Escape', 'Escape', 27);
  assert.equal(await evaluate('document.activeElement.dataset.id'), 'e-robot', 'keyboard inspection returns to the original card');

  await route('decks'); await tap(selector('share-deck', '[data-id="preset-engineering"]'));
  const sharedCode = await evaluate(`document.querySelector('#share-code').value`);
  assert.match(sharedCode, /^PKU1\./);
  await evaluate(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(Error('Clipboard unavailable')) } })`);
  await tap(selector('copy-deck-code'));
  await until(`document.activeElement.id === 'share-code' && document.activeElement.selectionEnd === document.activeElement.value.length`);
  await evaluate(`window.__toastInput = document.querySelector('#share-code')`);
  await until(`!document.querySelector('.toast')`, 6000);
  assert.ok(await evaluate(`window.__toastInput === document.querySelector('#share-code')`), 'toast dismissal must not replace a live input');
  await evaluate('delete navigator.clipboard');
  await key('Escape', 'Escape', 27);
  await tap(selector('import-deck')); await tap('#deck-code');
  await evaluate(`document.querySelector('#deck-code').dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))`);
  await key('Escape', 'Escape', 27);
  assert.ok(await evaluate(`!!document.querySelector('#deck-code')`), 'Escape during IME composition cannot close the import dialog');
  await evaluate(`document.querySelector('#deck-code').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))`);
  await cdp('Input.insertText', { text: 'PKU1.invalid' }); await tap(selector('import-deck-code'));
  await until(`!!document.querySelector('#import-error')`);
  assert.ok(await evaluate(`!!document.querySelector('#import-error') && document.querySelector('#deck-code').value === 'PKU1.invalid'`), JSON.stringify(await evaluate(`({ error: document.querySelector('#import-error')?.textContent, value: document.querySelector('#deck-code')?.value, active: document.activeElement.outerHTML.slice(0, 200) })`)));
  await key('Escape', 'Escape', 27); await tap(selector('import-deck')); await tap('#deck-code');
  await cdp('Input.insertText', { text: sharedCode }); await tap(selector('import-deck-code'));
  await until(`!!document.querySelector('.builder-page') && !!document.querySelector('.deck-validation.valid')`);
  assert.equal(await evaluate(`document.activeElement.id`), 'deck-name');
  await evaluate(`document.querySelector('#deck-name').select()`);
  await cdp('Input.insertText', { text: '手机与电脑共用的套牌🌊' });
  await tap(selector('save-deck'));
  const imported = await evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:decks'))`);
  assert.equal(imported.length, 1); assert.equal(imported[0].preset, false);
  assert.equal(imported[0].name, '手机与电脑共用的套牌🌊', 'the first save click after editing a name is not lost on blur');
  assert.deepEqual([...imported[0].cards].sort(), [...PRESETS[1].cards].sort());
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:draft'))`), null, 'saving a deck clears its editing draft');
  const battleBeforeDraft = await match();
  await tap(selector('edit-deck', '[data-id="preset-engineering"]'));
  await evaluate(`document.querySelector('#deck-name').select()`);
  await cdp('Input.insertText', { text: '续写一半的燕园手记' });
  await tap(selector('remove-card', '[data-id="e-night"]'));
  await reload(); await until(`!!document.querySelector('.builder-page')`);
  assert.equal(await evaluate(`document.querySelector('#deck-name').value`), '续写一半的燕园手记');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:draft')).deck.cards.length`), 38);
  assert.deepEqual(await match(), battleBeforeDraft, 'restoring an unfinished draft cannot overwrite the battle');
  await route('decks'); await tap(selector('new-deck'));
  assert.ok(await evaluate(`document.querySelector('.modal').textContent.includes('开始另一份编辑')`));
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:draft')).deck.cards.length`), 38);
  await tap('.modal ' + selector('resume-draft'));
  await until(`!!document.querySelector('.builder-page') && !document.querySelector('.modal')`);
  assert.equal(await evaluate('document.activeElement.id'), 'deck-name');
  await route('decks'); await tap(selector('discard-draft')); await tap(selector('confirm-draft-change'));

  const viewports = [[320, 568], [375, 667], [390, 844], [430, 932], [844, 390], [768, 1024], [1280, 720]];
  for (const [width, height] of viewports) {
    await viewport(width, height, width !== 1280);
    for (const view of ['home', 'lobby', 'collection', 'decks', 'guide', 'battle']) {
      await route(view);
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), `${view} fits ${width}×${height}`);
      if (view === 'battle') {
        assert.ok(await evaluate(`(() => { const r = document.querySelector('.support-row').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()`), `all five board cells fit ${width}×${height}`);
        assert.ok(await evaluate(`(() => { const r = document.querySelector('.end-turn').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && (innerWidth >= 1100 || r.bottom <= innerHeight + 1); })()`), `end-turn control fits ${width}×${height}`);
      }
    }
    if (width === 390 || width === 320 || width === 844) await screenshot(`mobile-battle-${width}x${height}`);
    await route('decks'); await tap(selector('edit-deck', '[data-id="preset-engineering"]'));
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), `deck editor fits ${width}×${height}`);
    await route('decks'); await tap(selector('discard-draft')); await tap(selector('confirm-draft-change'));
  }
  await viewport(390, 844); await restore(createGame({ playerDeck: PRESETS[1], aiDeck: PRESETS[3], seed: 74, firstPlayer: 1 }));
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'five-card mulligan fits portrait');
  const finished = fixture(); finished.players[1].hq = 0; finished.phase = 'finished'; finished.winner = 0;
  const priorStats = { wins: 2, losses: 1, draws: 0, completed: ['prior-a', 'prior-b', 'prior-c'] };
  await evaluate(`localStorage.setItem('pkuards:v1:match', ${JSON.stringify(JSON.stringify(finished))}); localStorage.setItem('pkuards:v1:stats', ${JSON.stringify(JSON.stringify(priorStats))})`);
  await reload(); await until(`!!document.querySelector('.result-modal')`);
  const recoveredStats = await evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:stats'))`);
  assert.deepEqual(recoveredStats, { ...priorStats, wins: 3, completed: [...priorStats.completed, finished.id] });
  assert.ok(await evaluate(`document.activeElement.closest('.modal') && document.querySelector('.site-content').inert`));
  await reload(); await until(`!!document.querySelector('.hero')`);
  assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:stats'))`), recoveredStats, 'recovered result is not counted again');
  assert.deepEqual(errors, [], 'no browser runtime errors');
  const report = { browser: browser.version.Browser, passed: true, base, viewports, checks: ['mobile mulligan resets scroll', 'native touch hand swipe', 'swipe preserves selection and game state', 'tap deploy / advance / attack charge exactly once', 'hand scroll survives redraw', 'refresh resumes the same position', 'dialog focus / inert background / return focus', 'Chinese composition does not redraw mid-input', 'keyboard inspection, focus trap and composition-safe Escape', 'deck sharing and manual clipboard fallback', 'invalid import preserves input and valid import creates a new deck', 'home / lobby / collection / decks / guide / battle / builder width matrix', 'five-card portrait mulligan', 'unfinished draft restore, resume and replacement confirmation'], runtimeErrors: errors };
  report.checks.unshift('system motion preference on first launch and saved override');
  report.checks.push('recover a finished match missing its result without counting it twice');
  await writeFile(new URL('browser-mobile-qa.json', output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await screenshot('mobile-failure');
  console.error(await evaluate(`JSON.stringify({ view: document.querySelector('main')?.className, phase: JSON.parse(localStorage.getItem('pkuards:v1:match') || 'null')?.phase, player: JSON.parse(localStorage.getItem('pkuards:v1:match') || 'null')?.currentPlayer, dialog: document.querySelector('.modal')?.textContent.slice(0, 200), error: document.querySelector('#import-error')?.textContent, active: document.activeElement?.outerHTML.slice(0, 200), events: window.__touchLog?.slice(-12) })`));
  throw error;
} finally { await browser.close(); }
