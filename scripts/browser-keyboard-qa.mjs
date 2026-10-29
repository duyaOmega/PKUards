/** Play a known turn with native Tab, Enter and Space; no pointer input. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createGame, applyAction } from '../web/engine.js';
import { CARD_MAP, PRESETS } from '../web/data.js';
import { connectBrowser } from './cdp.mjs';

const option = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const browser = await connectBrowser(option('--port', '9223'));
const { cdp, evaluate, until, errors, reload } = browser;
const output = new URL('../artifacts/', import.meta.url); await mkdir(output, { recursive: true });
let keyPresses = 0;
async function key(name, shift = false) {
  const [code, value, virtual] = name === 'Tab' ? ['Tab', 'Tab', 9] : name === 'Space' ? ['Space', ' ', 32] : name === 'Escape' ? ['Escape', 'Escape', 27] : ['Enter', 'Enter', 13];
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: value, code, windowsVirtualKeyCode: virtual, modifiers: shift ? 8 : 0, ...(name === 'Enter' ? { text: '\r' } : {}) });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code, windowsVirtualKeyCode: virtual, modifiers: shift ? 8 : 0 });
  keyPresses++;
}
async function focus(query) {
  for (let i = 0; i < 180; i++) {
    if (await evaluate(`document.activeElement?.matches(${JSON.stringify(query)})`)) return;
    await key('Tab');
  }
  throw Error(`Tab could not reach ${query}: ${await evaluate('document.activeElement?.outerHTML.slice(0, 250)')}`);
}
async function activate(query, name = 'Enter') { await focus(query); await key(name); await evaluate('new Promise(resolve => requestAnimationFrame(resolve))'); }
async function finish(name = 'Space') { await until(`!!document.querySelector('.duel-cinema')`); await key(name); await until(`!document.querySelector('.duel-cinema')`); }
const match = () => evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:match'))`);
const hand = id => `[data-action="hand"][data-id="${id}"]`;
const slot = (row, position) => `[data-action="slot"][data-row="${row}"][data-slot="${position}"]${row === 'support' ? '[data-owner="0"]' : ''}`;
const unit = id => `[data-action="unit"][data-id="${id}"]`;
const hq = owner => `[data-action="target"][data-id="hq:${owner}"]`;
try {
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: option('--base', 'http://localhost:4173/PKUards/') });
  await until(`!!document.querySelector('.site-header')`);
  let fixture = createGame({ playerDeck: PRESETS[1], aiDeck: PRESETS[3], seed: 73, firstPlayer: 0 });
  for (const player of [0, 1]) fixture = applyAction(fixture, { type: 'mulligan', player, cards: [] }).state;
  fixture.players[0].energy = fixture.players[0].maxEnergy = 12; fixture.players[0].hq = 15;
  fixture.players[0].hand = ['e-robot', 'e-repair', 'c-question', 'n-course'].map(cardId => ({ id: `keyboard-${cardId}`, cardId }));
  const card = CARD_MAP['e-flight'];
  fixture.players[1].support[0] = { id: 'keyboard-foe', cardId: card.id, owner: 1, attack: card.attack, health: 2, maxHealth: card.health, opCost: card.opCost, keywords: [], row: 'support', slot: 0, sick: false, moved: false, attacked: false };
  await evaluate(`localStorage.clear(); localStorage.setItem('pkuards:v1:match', ${JSON.stringify(JSON.stringify(fixture))}); localStorage.setItem('pkuards:v1:settings', JSON.stringify({ reducedMotion: false, aiSpeed: 650 }))`);
  await reload(); await until(`!!document.querySelector('.battle-page')`);

  await activate(hand('keyboard-e-robot'));
  assert.equal(await evaluate(`document.querySelector('${hand('keyboard-e-robot')}').getAttribute('aria-pressed')`), 'true');
  assert.equal(await evaluate(`document.activeElement.dataset.id`), 'keyboard-e-robot', 'redraw keeps keyboard focus on the selected card');
  await activate(slot('support', 1), 'Space');
  assert.equal((await match()).players[0].energy, 12, 'keyboard play is not charged before impact');
  await finish(); let state = await match();
  assert.equal(state.players[0].energy, 9); const robot = state.players[0].support[1]; assert.ok(robot);

  await activate(unit(robot.id));
  assert.equal(await evaluate(`document.querySelector('${unit(robot.id)}').getAttribute('aria-pressed')`), 'true');
  await activate(slot('front', 0)); await finish('Escape');
  assert.equal((await match()).players[0].energy, 8); assert.equal((await match()).front.slots[0].id, robot.id);
  await activate(unit(robot.id), 'Space'); await activate(hq(1)); await finish();
  assert.equal((await match()).players[1].hq, 17); assert.equal((await match()).players[0].energy, 7);

  const inspect = `[data-action="inspect-unit"][data-id="${robot.id}"]`;
  await activate(inspect); await until(`!!document.querySelector('.modal')`);
  assert.ok(await evaluate(`document.activeElement.closest('.modal') && document.querySelector('.site-content').inert`));
  await key('Tab', true);
  assert.ok(await evaluate(`document.querySelector('.modal').contains(document.activeElement)`));
  await key('Tab');
  assert.equal(await evaluate('document.activeElement.dataset.action'), 'close-modal', 'Tab wraps within the dialog');
  await key('Escape');
  assert.ok(await evaluate(`document.activeElement.matches(${JSON.stringify(inspect)})`));

  await activate(hand('keyboard-e-repair')); await activate(slot('support', 1), 'Space');
  assert.equal((await match()).players[0].energy, 7, 'targeted deployment waits for its target');
  assert.match(await evaluate(`document.querySelector('${hq(0)}').getAttribute('aria-label')`), /可选目标/);
  await activate(hq(0)); await finish();
  assert.equal((await match()).players[0].hq, 17); assert.equal((await match()).players[0].energy, 5);
  await activate(hand('keyboard-c-question')); await activate(unit('keyboard-foe'), 'Space'); await finish('Escape');
  assert.equal((await match()).players[1].support[0], null); assert.equal((await match()).players[0].energy, 4);
  await activate(hand('keyboard-n-course')); await key('Escape');
  assert.equal(await evaluate(`document.querySelector('${hand('keyboard-n-course')}').getAttribute('aria-pressed')`), 'false');
  assert.deepEqual(errors, []);
  const report = { browser: browser.version.Browser, passed: true, nativeKeyboard: true, pointerInputs: 0, keyPresses, checks: ['Tab reaches cards, slots, units and HQ', 'selected cards and units expose pressed state', 'Enter and Space deploy, advance and attack', 'animation skip charges each action once', 'native dialog focus loop and return', 'targeted deployment waits for keyboard target selection', 'legal target labels identify available choices', 'targeted order resolves once', 'Escape clears selected state'], runtimeErrors: errors };
  await writeFile(new URL('browser-keyboard-qa.json', output), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch (error) {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(new URL('keyboard-failure.png', output), Buffer.from(data, 'base64'));
  throw error;
} finally { await browser.close(); }
