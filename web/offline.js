/** Optional offline support. Ordinary online play works if registration fails. */
export async function setupOffline({ onStatus, onUpdate }) {
  if (!globalThis.navigator?.serviceWorker) { onStatus('unsupported'); return null; }
  try {
    const workers = navigator.serviceWorker;
    const registration = await workers.register(new URL('./sw.js', import.meta.url), { updateViaCache: 'none' });
    let requested = false;
    workers.addEventListener('controllerchange', () => { if (requested) location.reload(); });
    const check = worker => {
      if (!worker) return;
      const changed = () => {
        if (worker.state === 'installed' && workers.controller) onUpdate();
        if (worker.state === 'redundant' && !registration.active) onStatus('unavailable');
      };
      worker.addEventListener('statechange', changed); changed();
    };
    if (registration.waiting) onUpdate();
    check(registration.installing);
    registration.addEventListener('updatefound', () => check(registration.installing));
    workers.ready.then(() => onStatus('ready'));
    return {
      update() {
        if (!registration.waiting) return false;
        requested = true; registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' }); return true;
      }
    };
  } catch { onStatus('unavailable'); return null; }
}
