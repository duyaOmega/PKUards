import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiClient } from '../web/ai-client.js';
import { createGame, applyAction, getObservation, getLegalActions } from '../web/engine.js';
import { chooseAction } from '../web/ai.js';
import { PRESETS } from '../web/data.js';

function position() {
  let state = createGame({ playerDeck: PRESETS[0], aiDeck: PRESETS[1], seed: 73, firstPlayer: 0 });
  for (const player of [0, 1]) state = applyAction(state, { type: 'mulligan', player, cards: [] }).state;
  return { view: getObservation(state, 0), actions: getLegalActions(state) };
}
function workers() {
  const instances = [];
  class FakeWorker {
    constructor(url, options) { this.url = url; this.options = options; this.messages = []; this.terminated = false; instances.push(this); }
    postMessage(message) { this.messages.push(structuredClone(message)); }
    terminate() { this.terminated = true; }
    reply(message = this.messages.at(-1)) { this.onmessage({ data: { id: message.id, action: chooseAction(message.view, message.actions) } }); }
  }
  return { FakeWorker, instances };
}
test('decision worker receives the visibility-filtered projection and is reused between replies', () => {
  const { FakeWorker, instances } = workers(), { view, actions } = position(), received = [];
  const client = createAiClient({ WorkerClass: FakeWorker });
  try {
    client.request(view, actions, action => received.push(action)); assert.equal(client.pending, true);
    const worker = instances[0], sent = worker.messages[0];
    assert.equal(worker.options.type, 'module'); assert.ok(worker.url.pathname.endsWith('/ai-worker.js'));
    assert.deepEqual(Object.keys(sent).sort(), ['actions', 'id', 'view']); assert.equal(sent.view.rng, undefined);
    assert.equal(sent.view.players[1].hand, undefined);
    assert.ok(sent.view.players.every(player => !Object.hasOwn(player, 'deck')));
    worker.reply(); assert.equal(client.pending, false); assert.deepEqual(received, [chooseAction(view, actions)]);
    client.request(view, actions, action => received.push(action)); assert.equal(instances.length, 1);
    worker.reply(sent); assert.equal(received.length, 1, 'an old reply cannot complete a new decision');
    worker.reply(); assert.equal(received.length, 2);
  } finally { client.cancel(); }
});
test('cancelling drops a pending reply and recreates a worker only when needed', () => {
  const { FakeWorker, instances } = workers(), { view, actions } = position(), received = [];
  const client = createAiClient({ WorkerClass: FakeWorker });
  try {
    client.request(view, actions, action => received.push(action)); const old = instances[0];
    client.cancel(); old.reply(); assert.equal(received.length, 0); assert.equal(client.pending, false); assert.ok(old.terminated);
    client.request(view, actions, action => received.push(action)); assert.equal(instances.length, 2);
    old.onerror({ preventDefault() {} }); instances[1].reply(); assert.equal(received.length, 1);
  } finally { client.cancel(); }
});
test('worker errors fall back once to the same visible-information decision', () => {
  const { FakeWorker, instances } = workers(), { view, actions } = position(), received = [];
  const client = createAiClient({ WorkerClass: FakeWorker });
  try {
    client.request(view, actions, action => received.push(action)); instances[0].onerror({ preventDefault() {} });
    assert.equal(client.pending, false); assert.ok(instances[0].terminated);
    assert.deepEqual(received, [chooseAction(view, actions)]);
    instances[0].reply(); assert.equal(received.length, 1);
    client.request(view, actions, action => received.push(action)); assert.equal(instances.length, 1); assert.equal(received.length, 2);
  } finally { client.cancel(); }
});
test('unavailable or denied workers keep synchronous play available', () => {
  const { view, actions } = position();
  for (const WorkerClass of [null, class { constructor() { throw new Error('Worker denied'); } }]) {
    const client = createAiClient({ WorkerClass }); let action;
    client.request(view, actions, value => { action = value; });
    assert.deepEqual(action, chooseAction(view, actions)); assert.equal(client.pending, false); client.cancel();
  }
});
test('a worker that never responds times out without leaving a match stuck', () => {
  const { FakeWorker, instances } = workers(), { view, actions } = position();
  const original = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const timers = new Map(); let nextId = 0, action;
  globalThis.setTimeout = fn => { const id = ++nextId; timers.set(id, fn); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  const client = createAiClient({ WorkerClass: FakeWorker });
  try {
    client.request(view, actions, value => { action = value; }); assert.equal(client.pending, true);
    [...timers.values()][0](); assert.deepEqual(action, chooseAction(view, actions));
    assert.equal(client.pending, false); assert.ok(instances[0].terminated); assert.equal(timers.size, 0);
  } finally { client.cancel(); Object.assign(globalThis, original); }
});
