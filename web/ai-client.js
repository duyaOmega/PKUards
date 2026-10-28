import { chooseAction } from './ai.js?v=1.3.3';

/** One reusable decision worker. Only the caller's visible observation is sent. */
export function createAiClient({ WorkerClass = globalThis.Worker } = {}) {
  let worker = null, job = null, nextId = 0, unsupported = typeof WorkerClass !== 'function';
  function cancel() { if (job) clearTimeout(job.timer); job = null; worker?.terminate(); worker = null; }
  function failed(instance) {
    if (worker !== instance) return;
    const pending = job; if (pending) clearTimeout(pending.timer);
    job = null; worker = null; unsupported = true; instance.terminate();
    if (pending) pending.callback(chooseAction(pending.view, pending.actions));
  }
  function start() {
    if (worker || unsupported) return;
    try {
      const instance = new WorkerClass(new URL('./ai-worker.js?v=1.3.3', import.meta.url), { type: 'module', name: 'pkuards-ai' });
      worker = instance;
      instance.onmessage = event => {
        if (worker !== instance || !job || event.data.id !== job.id) return;
        const callback = job.callback; clearTimeout(job.timer); job = null; callback(event.data.action);
      };
      instance.onerror = event => { event.preventDefault?.(); failed(instance); };
      instance.onmessageerror = () => failed(instance);
    } catch { unsupported = true; worker = null; }
  }
  return {
    get pending() { return job !== null; },
    request(view, actions, callback) {
      if (job) cancel();
      start();
      if (!worker) { callback(chooseAction(view, actions)); return; }
      const id = ++nextId, instance = worker;
      job = { id, view, actions, callback, timer: setTimeout(() => { if (job?.id === id) failed(instance); }, 8000) };
      try { instance.postMessage({ id, view, actions }); }
      catch { failed(instance); }
    },
    cancel
  };
}
