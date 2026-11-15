/** Real UI validation of common units, discipline orders and the version-3 migration. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { CARDS, CARD_MAP, PRESETS } from '../web/data.js';
import { createGame, applyAction } from '../web/engine.js';
import { encodeDeck, decodeDeck } from '../web/deck-code.js';
import { connectBrowser } from './cdp.mjs';

const option = (key, fallback) => { const i = process.argv.indexOf(key); return i < 0 ? fallback : process.argv[i + 1]; };
const browser = await connectBrowser(option('--port', '9223'));
const { cdp, evaluate, until, reload, errors } = browser;
const output = new URL('../artifacts/', import.meta.url); await mkdir(output, { recursive: true });
const match = () => evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:match'))`);
async function click(selector) {
  const point = await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el || el.disabled)throw Error('Missing control'); el.scrollIntoView({block:'center',behavior:'instant'}); const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
}
async function shot(name) {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(new URL(name + '.png', output), Buffer.from(data, 'base64'));
}
function fixture() {
  let state = createGame({ playerDeck: PRESETS[3], aiDeck: PRESETS[1], seed: 581, firstPlayer: 0 });
  for (const player of [0,1]) state = applyAction(state, { type: 'mulligan', player, cards: [] }).state;
  state.players[0].energy = state.players[0].maxEnergy = 12; return state;
}
try {
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: option('--base', 'http://localhost:4173/PKUards/') });
  await until(`!!document.querySelector('.site-header')`);
  await evaluate(`localStorage.clear(); localStorage.setItem('pkuards:v1:settings', JSON.stringify({reducedMotion:false,aiSpeed:250}))`);
  await reload(); await until(`!!document.querySelector('.hero')`);
  await click('[data-action="route"][data-view="collection"]');
  await click('[data-action="filter-faction"][data-id="neutral"]');
  assert.equal(await evaluate(`document.querySelectorAll('.card-grid .game-card').length`), 16);
  assert.equal(await evaluate(`document.querySelectorAll('.card-grid .attack-stat').length`), 12);
  assert.equal(await evaluate(`document.querySelector('[data-action="inspect"][data-id="n-library"] .health-stat').textContent.trim()`), '♥ 3');
  await until(`[...document.querySelectorAll('img[src*="print-librarian"],img[src*="print-cyclist"]')].every(i=>i.complete&&i.naturalWidth>0)`);
  await evaluate('scrollTo(0,0)'); await shot('v15-shared-units');
  for (const faction of ['science','engineering','humanities','society']) {
    await click(`[data-action="filter-faction"][data-id="${faction}"]`);
    assert.equal(await evaluate(`document.querySelectorAll('.card-grid .attack-stat').length`), 3);
    assert.equal(await evaluate(`document.querySelectorAll('.card-grid .event-label').length`), 9);
    assert.ok(await evaluate(`document.querySelector('.collection-notes').textContent.includes('取舍')`));
    if (faction === 'science') {
      assert.ok(await evaluate(`document.querySelector('[data-action="inspect"][data-id="s-fresh"] .event-label').textContent.includes('指令')`));
      await evaluate('scrollTo(0,0)'); await shot('v15-science-orders');
    }
  }
  await click('[data-action="route"][data-view="decks"]'); await click('[data-action="edit-deck"][data-id="preset-engineering"]');
  assert.ok(await evaluate(`document.querySelector('.deck-composition').textContent.includes('单位 26 · 指令 13')`));

  // Existing version-2 saves and PKU1 codes remain available for review.
  const oldMatch = fixture(); oldMatch.version = 2;
  const oldDeck = { ...structuredClone(PRESETS[1]), id: 'legacy-deck', name: '旧版保留套牌', preset: false }; delete oldDeck.rulesVersion;
  const stats = { wins: 2, losses: 1, draws: 0, completed: ['old-a','old-b','old-c'] };
  const journal = { version: 1, chapters: { 'west-gate': { stars: 3, rounds: 8 } } };
  await evaluate(`localStorage.removeItem('pkuards:v1:draft'); localStorage.setItem('pkuards:v1:match', ${JSON.stringify(JSON.stringify(oldMatch))}); localStorage.setItem('pkuards:v1:decks', ${JSON.stringify(JSON.stringify([oldDeck]))}); localStorage.setItem('pkuards:v1:stats', ${JSON.stringify(JSON.stringify(stats))}); localStorage.setItem('pkuards:v1:journey', ${JSON.stringify(JSON.stringify(journal))})`);
  await reload(); await until(`!!document.querySelector('.hero')`);
  assert.ok(await evaluate(`document.body.textContent.includes('旧对局需要重新开始')`));
  assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:stats'))`), stats);
  assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:journey'))`), journal);
  await click('[data-action="route"][data-view="decks"]'); await click('[data-action="edit-deck"][data-id="legacy-deck"]');
  assert.ok(await evaluate(`!!document.querySelector('.legacy-deck-note')`)); await click('[data-action="save-deck"]');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:decks'))[0].rulesVersion`), 3);
  const payload = JSON.parse(Buffer.from(encodeDeck(PRESETS[0]).slice(5), 'base64url').toString('utf8')); payload.v = 1; delete payload.r;
  const legacyCode = 'PKU1.' + Buffer.from(JSON.stringify(payload)).toString('base64url');
  await click('[data-action="import-deck"]');
  await evaluate(`(() => {const el=document.querySelector('#deck-code'); el.value=${JSON.stringify(legacyCode)}; el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click('[data-action="import-deck-code"]');
  assert.ok(await evaluate(`!!document.querySelector('.legacy-deck-note')`)); await click('[data-action="save-deck"]');
  const id = await evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:decks')).find(d=>d.id!=='legacy-deck').id`);
  await click(`[data-action="share-deck"][data-id="${id}"]`);
  const newCode = await evaluate(`document.querySelector('#share-code').value`);
  assert.equal(decodeDeck(newCode).rulesVersion, 3); assert.match(newCode, /^PKU2\./);

  const state = fixture(), card = CARD_MAP['n-photo'];
  state.players[1].support[0] = { id: 'discipline-foe', cardId: card.id, owner: 1, attack: 5, health: 5, maxHealth: 7, opCost: 2, keywords: [], row: 'support', slot: 0, sick: false, moved: false, attacked: false };
  state.players[0].hand = ['c-law','c-law','c-strategy'].map((cardId,i)=>({id:'discipline-'+i,cardId}));
  await evaluate(`localStorage.removeItem('pkuards:v1:draft'); localStorage.setItem('pkuards:v1:match', ${JSON.stringify(JSON.stringify(state))})`);
  await reload(); await until(`!!document.querySelector('.battle-page')`);
  await click('[data-action="hand"][data-id="discipline-0"]'); await click('[data-action="unit"][data-id="discipline-foe"]');
  assert.equal((await match()).players[1].support[0].attack, 5, 'no reduction before impact');
  await until(`!!document.querySelector('.cinema-impact')`);
  const floating = await evaluate(`[...document.querySelectorAll('.cinema-number')].map(e=>e.textContent)`);
  assert.ok(floating.includes('-2 攻击')); assert.ok(!floating.some(s=>s.includes('+-')));
  await shot('v15-attack-reduction'); await until(`!document.querySelector('.duel-cinema')`);
  assert.equal((await match()).players[1].support[0].attack, 3);
  for (const hand of ['discipline-1','discipline-2']) {
    await click(`[data-action="hand"][data-id="${hand}"]`); await click('[data-action="unit"][data-id="discipline-foe"]');
    await until(`!document.querySelector('.duel-cinema')`);
  }
  assert.equal((await match()).players[1].support[0], null);
  assert.equal((await match()).players[0].energy, 5);

  // Second-player reserve is a native, once-only action rather than a hand card.
  let reserveState = createGame({playerDeck:PRESETS[1],aiDeck:PRESETS[0],seed:581,firstPlayer:1});
  for (const player of [0,1]) reserveState = applyAction(reserveState,{type:'mulligan',player,cards:[]}).state;
  reserveState = applyAction(reserveState,{type:'endTurn',player:1}).state;
  reserveState.players[0].hand = [{id:'reserve-library',cardId:'n-library'}];
  await evaluate(`localStorage.setItem('pkuards:v1:match', ${JSON.stringify(JSON.stringify(reserveState))})`);
  await reload(); await until(`!!document.querySelector('.battle-page')`);
  assert.equal(await evaluate(`document.querySelector('[data-action="reserve"]').disabled`), true);
  await click('[data-action="hand"][data-id="reserve-library"]');
  await click('[data-action="slot"][data-row="support"][data-owner="0"][data-slot="0"]');
  await until(`!document.querySelector('.duel-cinema')`);
  assert.equal((await match()).players[0].energy, 0);
  await cdp('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
  await click('[data-action="reserve"]');
  assert.equal((await match()).players[0].energy, 1); assert.equal((await match()).players[0].reserveAvailable, false);
  assert.equal((await match()).players[0].hand.length, 0);
  assert.equal(await evaluate(`document.querySelector('[data-action="reserve"]').disabled`), true);
  await shot('v15-reserve-mobile');
  await reload(); await until(`!!document.querySelector('.battle-page')`);
  assert.equal((await match()).players[0].energy, 1); assert.equal((await match()).players[0].reserveAvailable, false);
  assert.deepEqual(errors, []);
  const report = { browser: browser.version.Browser, passed: true, checks: ['12 shared units and 4 common orders', '3 specialists and 9 orders per discipline', 'shared 1/3 library baseline', 'strengths and weaknesses visible', 'different preset unit/order ratios', 'old match reset preserves decks, statistics and journal', 'legacy deck remains editable and resaves with the current card pool', 'PKU1 imports as reviewable draft and PKU2 re-exports', 'native attack reduction waits for impact and displays a negative number', 'conditional follow-up removes the weakened target exactly once'], runtimeErrors: errors };
  report.checks.push('native second-player reserve is disabled at full energy, grants one energy once and survives reload', 'reserve is accessible at 390px and does not add a hand card');
  await writeFile(new URL('browser-discipline-qa.json', output), JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
} catch (error) { await shot('discipline-failure'); throw error; }
finally { await browser.close(); }
