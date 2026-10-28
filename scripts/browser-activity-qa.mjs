/** Native visibility and page navigation checks; focus emulation stays disabled. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { connectBrowser } from './cdp.mjs';
import { createGame, applyAction, getLegalActions, getObservation } from '../web/engine.js';
import { chooseAction } from '../web/ai.js';
import { PRESETS } from '../web/data.js';

const option = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const base = option('--base', 'http://localhost:4173/PKUards/');
const browser = await connectBrowser(option('--port', '9223'));
const { cdp, command, evaluate, until, errors, reload } = browser;
const output = new URL('../artifacts/', import.meta.url); await mkdir(output, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const match = () => evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:match'))`);
let otherTab, stage = 'create background match';
try {
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: false });
  otherTab = await command('Target.createTarget', { url: 'about:blank', background: false, newWindow: false });
  await cdp('Page.navigate', { url: base }); await until(`!!document.querySelector('.site-header')`);
  await until(`document.visibilityState === 'hidden'`, 5000);
  let fixture = createGame({ playerDeck: PRESETS[0], aiDeck: PRESETS[1], seed: 73, firstPlayer: 0 });
  for (const player of [0, 1]) fixture = applyAction(fixture, { type: 'mulligan', player, cards: [] }).state;
  fixture.currentPlayer = 1; fixture.turn = 2;
  fixture.players[1].energy = fixture.players[1].maxEnergy = 5;
  fixture.players[1].hand = [{ id: 'activity-robot', cardId: 'e-robot' }];
  await evaluate(`localStorage.clear(); localStorage.setItem('pkuards:v1:settings', JSON.stringify({ reducedMotion: false, aiSpeed: 1000 })); localStorage.setItem('pkuards:v1:match', ${JSON.stringify(JSON.stringify(fixture))})`); await reload();
  await until(`!!document.querySelector('.battle-page') && document.visibilityState === 'hidden'`);
  await delay(1500);
  assert.deepEqual(await match(), JSON.parse(JSON.stringify(fixture)), 'a background restored match cannot run AI');

  stage = 'foreground and hide pending deployment';
  await cdp('Page.bringToFront');
  await until(`document.visibilityState === 'visible' && !!document.querySelector('.cinema-reveal')`);
  assert.equal((await match()).players[1].energy, 5, 'reveal has not committed its fee');
  await command('Target.activateTarget', { targetId: otherTab.targetId });
  await until(`document.visibilityState === 'hidden' && !document.querySelector('.duel-cinema')`);
  const deployed = await match();
  const expectedAction = chooseAction(getObservation(fixture, 1), getLegalActions(fixture));
  assert.deepEqual(deployed, JSON.parse(JSON.stringify(applyAction(fixture, expectedAction).state)), 'hiding commits exactly the pending deployment');
  await delay(1500); assert.deepEqual(await match(), deployed, 'no follow-up AI action occurs in a hidden tab');

  stage = 'leave during movement';
  await cdp('Page.bringToFront');
  await until(`document.visibilityState === 'visible' && !!document.querySelector('.cinema-aim')`);
  assert.equal((await match()).players[1].energy, 2, 'the next advance has not committed before leaving');
  await cdp('Page.navigate', { url: 'about:blank' });
  await until(`location.href === 'about:blank'`);
  stage = 'back navigation';
  const history = await cdp('Page.getNavigationHistory');
  await cdp('Page.navigateToHistoryEntry', { entryId: history.entries[history.currentIndex - 1].id });
  await until(`!!document.querySelector('.battle-page') && !document.querySelector('.duel-cinema')`);
  const advanced = await match();
  assert.equal(advanced.front.owner, 1); assert.equal(advanced.players[1].energy, 1, 'pagehide saves one advance before back navigation');
  await until(`JSON.parse(localStorage.getItem('pkuards:v1:match')).players[0].hq === 17 && !document.querySelector('.duel-cinema')`);
  const attacked = await match();
  assert.equal(attacked.players[1].energy, 0);
  assert.equal(attacked.history.filter(event => event.kind === 'attack').length, 1, 'returning cannot replay the prior action');
  await evaluate(`document.querySelector('[data-action="settings"]').click()`);
  assert.deepEqual(errors, [], 'no lifecycle runtime errors');
  const report = { browser: browser.version.Browser, passed: true, headed: process.argv.includes('--headed'), nativeVisibility: true, checks: ['a restored background tab pauses AI', 'foregrounding resumes AI', 'hiding during reveal commits the selected action exactly once', 'hidden tab schedules no next action', 'leaving during aim persists the current action', 'back navigation resumes without duplicate fees or attacks'], runtimeErrors: errors };
  await writeFile(new URL('browser-activity-qa.json', output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(JSON.stringify({ stage, targets: await command('Target.getTargets'), error: error.message }));
  throw error;
} finally {
  if (otherTab) await command('Target.closeTarget', { targetId: otherTab.targetId });
  await browser.close();
}
