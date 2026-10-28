/** Verify real worker decisions, UI progress, cancellation and fallback. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { connectBrowser } from './cdp.mjs';
import { chooseAction } from '../web/ai.js';
import { RULES } from '../web/data.js';

const option = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const base = option('--base', 'http://localhost:4173/PKUards/');
const fixture = JSON.parse(await readFile(new URL('../tests/fixtures/ai-heavy.json', import.meta.url), 'utf8'));
assert.equal(fixture.ruleVersion, RULES.version);
const browser = await connectBrowser(option('--port', '9223'));
const { cdp, command, evaluate, until, errors, reload } = browser;
const output = new URL('../artifacts/', import.meta.url); await mkdir(output, { recursive: true });
const expected = chooseAction(fixture.view, fixture.actions);
const workerCount = () => evaluate('window.__qaWorkerStats?.active || 0');
async function untilWorkers(count) {
  const start = Date.now();
  while (Date.now() - start < 5000) {
    if (await workerCount() === count) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error(`Expected ${count} decision workers`);
}
try {
  await cdp('Page.navigate', { url: base }); await until(`!!document.querySelector('.site-header')`);
  await evaluate('localStorage.clear()'); await reload();
  await until(`!!document.querySelector('.hero') && !!navigator.serviceWorker.controller`);
  await cdp('Emulation.setCPUThrottlingRate', { rate: 4 });
  const sample = await evaluate(`(async () => {
    const { chooseAction } = await import('./ai.js');
    const { createAiClient } = await import('./ai-client.js');
    const { view, actions } = ${JSON.stringify(fixture)};
    chooseAction(view, actions);
    const syncMs = []; let direct;
    for (let i = 0; i < 3; i++) { const start = performance.now(); direct = chooseAction(view, actions); syncMs.push(performance.now() - start); }
    const stats = window.__qaWorkerStats = { active: 0, max: 0, creations: 0, errors: [] };
    class ObservedWorker extends Worker {
      constructor(...args) {
        super(...args); this.finished = false; stats.active++; stats.creations++; stats.max = Math.max(stats.max, stats.active);
        this.addEventListener('error', event => stats.errors.push(event.message || 'Worker load error'));
      }
      terminate() { if (!this.finished) { this.finished = true; stats.active--; } super.terminate(); }
    }
    const client = window.__qaAiClient = createAiClient({ WorkerClass: ObservedWorker });
    const started = performance.now(); let returned = false, uiOpened = false, uiStartedMs = null, ticks = 0;
    const interval = setInterval(() => ticks++, 4);
    const uiTimer = setTimeout(() => {
      uiStartedMs = performance.now() - started;
      document.querySelector('[data-action="settings"]').click(); uiOpened = !!document.querySelector('.modal');
    }, 0);
    return await new Promise(resolve => {
      client.request(view, actions, action => {
        clearInterval(interval); clearTimeout(uiTimer);
        resolve({ action, direct, syncMs, elapsedMs: performance.now() - started, requestReturnedBeforeReply: returned, uiOpenedBeforeReply: uiOpened, uiStartedMs, timerTicks: ticks });
      });
      returned = true;
    });
  })()`);
  assert.deepEqual(sample.action, expected); assert.deepEqual(sample.direct, expected);
  assert.ok(sample.requestReturnedBeforeReply && sample.uiOpenedBeforeReply, 'the UI opens settings while a real worker is deciding');
  await untilWorkers(1);
  const cancelled = await evaluate(`(async () => {
    let replies = 0; const { view, actions } = ${JSON.stringify(fixture)};
    window.__qaAiClient.request(view, actions, () => replies++); window.__qaAiClient.cancel();
    await new Promise(resolve => setTimeout(resolve, 80)); return replies;
  })()`);
  assert.equal(cancelled, 0); await untilWorkers(0);
  const resumed = await evaluate(`new Promise(resolve => { const { view, actions } = ${JSON.stringify(fixture)}; window.__qaAiClient.request(view, actions, resolve); })`);
  assert.deepEqual(resumed, expected); await untilWorkers(1);
  const fallback = await evaluate(`(async () => {
    const { createAiClient } = await import('./ai-client.js'); let result;
    const client = createAiClient({ WorkerClass: null }), { view, actions } = ${JSON.stringify(fixture)};
    client.request(view, actions, action => { result = action; }); client.cancel(); return result;
  })()`);
  assert.deepEqual(fallback, expected);
  await evaluate('window.__qaAiClient.cancel()'); await untilWorkers(0);
  const ownedWorkers = await evaluate('window.__qaWorkerStats');
  assert.equal(ownedWorkers.max, 1); assert.deepEqual(ownedWorkers.errors, []);
  assert.deepEqual(errors, []);
  const sync = [...sample.syncMs].sort((a, b) => a - b);
  const report = { browser: browser.version.Browser, passed: true, cpuThrottle: 4, synchronousMedianMs: +sync[1].toFixed(2), workerRoundTripMs: +sample.elapsedMs.toFixed(2), uiHandlerStartedMs: +sample.uiStartedMs.toFixed(2), uiOpenedBeforeDecisionReply: sample.uiOpenedBeforeReply, uiTimerTicksWhileDeciding: sample.timerTicks, maxOwnedDecisionWorkers: ownedWorkers.max, checks: ['worker and synchronous actions agree', 'UI settings opens before the decision reply', 'at most one owned native decision worker', 'cancellation drops pending replies and terminates the worker', 'a new request recreates the worker', 'unsupported-worker fallback chooses the same action'], runtimeErrors: errors };
  await writeFile(new URL('browser-ai-qa.json', output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(JSON.stringify({ error: error.message, workers: await evaluate('window.__qaWorkerStats'), targets: await command('Target.getTargets') }));
  throw error;
} finally {
  await cdp('Emulation.setCPUThrottlingRate', { rate: 1 });
  await browser.close();
}
