/** Resolve a drag through the engine's legal actions. No resources change on invalid drops. */
export function resolveDrop(actions, selection, zone) {
  const candidates = actions.filter(a => selection.kind === 'hand' ? a.card === selection.id : a.unit === selection.id);
  const event = candidates.find(a => a.type === 'play' && a.slot === undefined && !a.target);
  if (event && (zone.target || zone.row || zone.arena)) return event;
  if (zone.target) {
    const matches = candidates.filter(a => a.target === zone.target);
    return matches.find(a => a.slot === selection.slot) || matches.find(a => a.slot === 1) || matches[0] || null;
  }
  if (zone.row === 'front') return candidates.find(a => a.type === 'move' && a.slot === zone.slot) || null;
  if (zone.row === 'support' && zone.owner === 0) {
    const matches = candidates.filter(a => a.type === 'play' && a.slot === zone.slot);
    return matches.find(a => !a.target) || (matches.length ? { pendingSlot: zone.slot } : null);
  }
  if (zone.arena) return candidates.find(a => a.type === 'play' && a.slot === undefined && !a.target) || null;
  return null;
}
export function revealedPlays(history, owner = 1) {
  return history.filter(e => e.owner === owner && e.cardId && (e.kind === 'play' || e.kind === 'deploy' && e.fromHand)).slice(-6).reverse();
}
