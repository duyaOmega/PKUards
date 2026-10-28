import { CARD_MAP, RULES } from './data.js?v=1.3.4';
import { getTarget as target, effectTargets } from './engine.js?v=1.3.4';
import { findWinningAction, avoidImmediateLoss } from './tactics.js?v=1.3.4';
export const AI_CONFIG = Object.freeze({ thinkMs: 650, maxActionsPerTurn: 60, frontierValue: 2.3, cardValue: 1.8 });
function material(u) { return u.attack * 0.8 + u.health * 0.45 + (['artillery', 'bomber', 'fighter'].includes(CARD_MAP[u.cardId].unitType) ? 1 : 0); }
// Effects see the board after the card leaves hand or the unit advances. Only
// those containers are copied; the input observation and its units stay intact.
function effectContext(view, action, card) {
  const owner = view.currentPlayer, me = view.players[owner];
  const player = { ...me, support: [...me.support], hand: action.type === 'play' ? me.hand.filter(h => h.id !== action.card) : me.hand };
  const next = { ...view, players: view.players.map(p => p.id === owner ? player : p), front: { ...view.front, slots: [...view.front.slots] } };
  let source = null;
  if (action.type === 'play' && card.kind === 'unit') {
    source = { ...card, id: `deploy:${action.card}`, cardId: card.id, owner, row: 'support', slot: action.slot, maxHealth: card.health, sick: !card.keywords.includes('blitz'), moved: false, attacked: false };
    player.support[action.slot] = source;
  } else if (action.type === 'move') {
    const original = target(view, action.unit);
    source = { ...original, row: 'front', slot: action.slot, moved: true };
    player.support[original.slot] = null;
    next.front.owner = owner; next.front.slots[action.slot] = source;
  }
  return { view: next, source };
}
function effectValue(e, view, owner, selected, source) {
  if (e.sourceInFront && source?.row !== 'front') return 0;
  if (e.conditionFrontline && view.front.owner !== owner) return 0;
  if (e.hqAtMost !== undefined && view.players[owner].hq > e.hqAtMost) return 0;
  const targets = effectTargets(view, e.target, owner, selected, source).filter(t => !e.filterType || !t.isHq && CARD_MAP[t.cardId].unitType === e.filterType);
  if (e.type === 'draw') return Math.min(e.amount, view.players[owner].deckCount, Math.max(0, RULES.handLimit - view.players[owner].hand.length)) * AI_CONFIG.cardValue - (view.players[owner].deckCount < e.amount ? 5 : 0);
  if (e.type === 'summon') return Math.min(e.count, view.players[owner].support.filter((u, i) => i !== RULES.hqSlot && !u).length) * 2.7;
  return targets.reduce((v, t) => {
    const friendly = t.owner === owner;
    if (e.type === 'damage') {
      const value = t.isHq ? (e.amount >= t.health ? 1000 : e.amount * (t.health < 8 ? 1.4 : 0.55)) : Math.min(e.amount, t.health) * 0.7 + (e.amount >= t.health ? material(t) * 0.65 + 1.5 : 0);
      return v + (friendly ? -value : value);
    }
    if (e.type === 'heal') return v + (friendly ? 1 : -1) * Math.min(e.amount, Math.max(0, t.maxHealth - t.health)) * (t.isHq && t.health <= 7 ? 1.5 : 0.6);
    if (t.isHq) return v;
    if (e.type === 'buff') return v + (friendly ? 1 : -1) * (e.attack * 0.85 + e.health * 0.6 + (e.keywords?.includes('blitz') && t.sick ? 1.1 : 0) + (e.keywords?.includes('guard') && !t.keywords.includes('guard') ? 0.5 : 0));
    if (e.type === 'discount') return v + (friendly ? 1 : -1) * Math.min(t.opCost, e.amount) * 1.7;
    if (e.type === 'ready') return v + (friendly && (t.attacked || t.moved || t.sick) ? t.attack * .9 + 1 : 0);
    return v;
  }, 0);
}
/** Takes a visibility-filtered observation, never a full engine state. */
export function chooseAction(view, actions) {
  const owner = view.currentPlayer, me = view.players[owner], them = view.players[1 - owner];
  if (view.phase === 'mulligan') {
    const replace = me.hand.filter(h => CARD_MAP[h.cardId].cost >= 4 || (CARD_MAP[h.cardId].kind === 'event' && CARD_MAP[h.cardId].cost >= 3)).map(h => h.id).sort().join(',');
    return actions.find(a => [...a.cards].sort().join(',') === replace) || actions[0];
  }
  const winning = findWinningAction(view, actions);
  if (winning) return winning;
  const ranked = [];
  for (const a of actions) {
    let score = -100;
    if (a.type === 'endTurn') score = -0.1;
    if (a.type === 'play') {
      const c = CARD_MAP[me.hand.find(h => h.id === a.card).cardId];
      const context = effectContext(view, a, c);
      if (c.kind === 'unit') {
        score = c.attack * 0.85 + c.health * 0.5 + 1 - c.cost * 0.2;
        if (['artillery', 'fighter', 'bomber'].includes(c.unitType)) score += 1.1;
        if (c.keywords.includes('blitz')) score += 0.9;
        if (c.keywords.includes('guard')) score += a.slot === 1 || a.slot === 3 ? 1 : 0;
        if (them.hq <= 6 && c.cost + c.opCost > me.energy) score -= 1.5;
        for (const e of c.onDeploy || []) score += effectValue(e, context.view, owner, a.target, context.source);
      } else {
        score = -0.35 - c.cost * 0.12;
        for (const e of c.effects) score += effectValue(e, context.view, owner, a.target);
      }
    }
    if (a.type === 'move') {
      const u = target(view, a.unit), c = CARD_MAP[u.cardId];
      score = ['infantry', 'tank'].includes(c.unitType) ? AI_CONFIG.frontierValue + u.attack * 0.3 : -2;
      if (view.front.owner === null) score += 1.4;
      if (c.unitType === 'tank' && me.energy >= u.opCost * 2) score += 1.5;
      if (u.keywords.includes('guard')) score += view.front.slots.some((other, i) => other && Math.abs(i - a.slot) === 1) ? 0.6 : 0;
      if (view.front.slots.filter(Boolean).length >= 3 && !['infantry', 'tank'].includes(c.unitType)) score -= 3;
      if (c.onMove?.length) {
        const context = effectContext(view, a);
        for (const e of c.onMove) score += effectValue(e, context.view, owner, null, context.source);
      }
    }
    if (a.type === 'attack') {
      const u = target(view, a.unit), t = target(view, a.target), type = CARD_MAP[u.cardId].unitType;
      if (t.isHq) score = u.attack >= them.hq ? 10000 : u.attack * (them.hq <= 8 ? 2 : 1.15) + 0.4;
      else {
        const defendType = CARD_MAP[t.cardId].unitType;
        const returned = defendType !== 'bomber' && type !== 'artillery' && (type !== 'bomber' || defendType === 'fighter') ? t.attack : 0;
        score = Math.min(u.attack, t.health) * 0.6 + (u.attack >= t.health ? material(t) * 0.9 + 2 : 0) - (returned >= u.health ? material(u) * 0.8 + 0.7 : returned * 0.35);
        if (t.row === 'front') score += u.attack >= t.health ? 1.4 : 0.4;
        if (me.hq <= 7 && u.attack >= t.health) score += t.attack * 0.7;
      }
    }
    ranked.push({ action: a, score });
  }
  return avoidImmediateLoss(view, ranked.sort((a, b) => b.score - a.score).map(item => item.action));
}
