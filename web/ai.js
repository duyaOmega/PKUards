import { CARD_MAP, RULES } from './data.js?v=1.5.0';
import { getTarget as target, effectTargets, getLegalActions, actionKey } from './engine.js?v=1.5.0';
import { findWinningAction, avoidImmediateLoss } from './tactics.js?v=1.5.0';
export const AI_CONFIG = Object.freeze({ thinkMs: 650, maxActionsPerTurn: 60, frontierValue: 2.3, cardValue: 1.8 });
function material(u) { return u.attack * 0.8 + u.health * 0.45 + (['artillery', 'bomber', 'fighter'].includes(CARD_MAP[u.cardId].unitType) ? 1 : 0); }
// Each candidate owns a public projection so sequential effects cannot mutate
// the observation or count the same hand/board capacity more than once.
function effectContext(view, action, card) {
  const next = structuredClone(view), owner = view.currentPlayer, player = next.players[owner];
  if (action.type === 'play') { player.hand = player.hand.filter(h => h.id !== action.card); player.energy -= card.cost; }
  let source = null;
  if (action.type === 'play' && card.kind === 'unit') {
    source = { ...card, id: 'deploy:' + action.card, cardId: card.id, owner, row: 'support', slot: action.slot, maxHealth: card.health, sick: !card.keywords.includes('blitz'), moved: false, attacked: false };
    player.support[action.slot] = source;
  } else if (action.type === 'move') {
    source = target(next, action.unit); player.support[source.slot] = null;
    source.row = 'front'; source.slot = action.slot; source.moved = true;
    source.keywords = source.keywords.filter(k => k !== 'smoke');
    next.front.owner = owner; next.front.slots[action.slot] = source;
  }
  return { view: next, source };
}
function effectValue(e, view, owner, selected, source) {
  if (e.sourceInFront && source?.row !== 'front') return 0;
  if (e.conditionFrontline && view.front.owner !== owner) return 0;
  if (e.hqAtMost !== undefined && view.players[owner].hq > e.hqAtMost) return 0;
  if (e.handAtLeast !== undefined && view.players[owner].hand.length < e.handAtLeast) return 0;
  const player = view.players[owner];
  if (e.type === 'draw') {
    const drawn = Math.min(e.amount, player.deckCount), kept = Math.min(drawn, Math.max(0, RULES.handLimit - player.hand.length));
    const value = kept * AI_CONFIG.cardValue - (player.deckCount < e.amount ? 5 : 0);
    player.deckCount -= drawn;
    for (let i = 0; i < kept; i++) player.hand.push({ id: 'preview-draw-' + player.hand.length, cardId: 'n-break' });
    return value;
  }
  if (e.type === 'summon') {
    let count = 0; const card = CARD_MAP[e.cardId];
    for (let i = 0; i < e.count; i++) {
      const slot = player.support.findIndex((u, slot) => slot !== RULES.hqSlot && !u);
      if (slot < 0) break;
      player.support[slot] = { ...card, cardId: card.id, id: 'preview-summon-' + slot, owner, row: 'support', slot, maxHealth: card.health, keywords: [...card.keywords], sick: true, moved: false, attacked: false };
      count++;
    }
    return count * (card.attack * 0.8 + card.health * 0.45 + (['artillery','fighter','bomber'].includes(card.unitType) ? 1 : 0) + 0.7);
  }
  const targets = effectTargets(view, e.target, owner, selected, source).filter(t => (!e.filterType || !t.isHq && CARD_MAP[t.cardId].unitType === e.filterType) && (e.targetAttackAtMost === undefined || !t.isHq && t.attack <= e.targetAttackAtMost));
  return targets.reduce((value, t) => {
    if (t.health <= 0) return value;
    const friendly = t.owner === owner, sign = friendly ? 1 : -1;
    if (e.type === 'damage') {
      const amount = t.isHq ? (e.amount >= t.health ? 1000 : e.amount * (t.health < 8 ? 1.4 : 0.55)) : Math.min(e.amount, t.health) * 0.7 + (e.amount >= t.health ? material(t) * 0.65 + 1.5 : 0);
      if (t.isHq) view.players[t.owner].hq -= e.amount; else t.health -= e.amount;
      return value - sign * amount;
    }
    if (e.type === 'heal') {
      const amount = Math.min(e.amount, Math.max(0, t.maxHealth - t.health));
      const score = amount * (t.isHq && t.health <= 7 ? 1.5 : 0.6);
      if (t.isHq) view.players[t.owner].hq += amount; else t.health += amount;
      return value + sign * score;
    }
    if (t.isHq) return value;
    if (e.type === 'buff') {
      const score = e.attack * 0.85 + e.health * 0.6 + (e.keywords?.includes('blitz') && t.sick ? 1.1 : 0) + (e.keywords?.includes('guard') && !t.keywords.includes('guard') ? 0.5 : 0);
      t.attack += e.attack; t.health += e.health; t.maxHealth += e.health;
      for (const k of e.keywords || []) if (!t.keywords.includes(k)) t.keywords.push(k);
      if (e.keywords?.includes('blitz')) t.sick = false;
      return value + sign * score;
    }
    if (e.type === 'weaken') { const amount = Math.min(t.attack, e.amount); t.attack -= amount; return value - sign * amount * 1.05; }
    if (e.type === 'discount') { const amount = Math.min(t.opCost, e.amount); t.opCost -= amount; return value + sign * amount * 1.7; }
    if (e.type === 'ready') {
      const score = friendly && player.energy >= t.opCost && (t.attacked || t.moved || t.sick) ? t.attack * .9 + 1 : 0;
      t.attacked = false; t.moved = false; t.sick = false; return value + score;
    }
    return value;
  }, 0);
}

/** Takes a visibility-filtered observation, never a full engine state. */
export function chooseAction(view, actions, { pressure } = {}) {
  const owner = view.currentPlayer, me = view.players[owner], them = view.players[1 - owner];
  pressure ??= me.faction === 'engineering' ? 0.75 : 0;
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
    if (a.type === 'reserve') {
      const topped = structuredClone(view), player = topped.players[owner];
      player.energy++; player.reserveAvailable = false;
      const after = getLegalActions(topped), current = new Set(actions.map(actionKey));
      if (after.some(next => !current.has(actionKey(next)))) {
        const next = chooseAction(topped, after, { pressure });
        if (next && next.type !== 'endTurn' && !current.has(actionKey(next))) score = 0.05;
      }
    }
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
        if (c.onOrder?.length || c.onDeath?.length) {
          const future = structuredClone(context.view), source = target(future, context.source.id);
          source.attacked = true;
          for (const e of c.onOrder || []) score += 0.65 * effectValue(e, future, owner, null, source);
          for (const e of c.onDeath || []) score += 0.45 * effectValue(e, future, owner, null, source);
        }
      } else {
        score = -0.35 - c.cost * 0.12;
        for (const e of c.effects) score += effectValue(e, context.view, owner, a.target);
        for (const unit of context.view.players[owner].support.concat(context.view.front.slots).filter(u => u && u.owner === owner && u.health > 0)) {
          if (unit.orderTriggeredTurn === view.turn) continue;
          unit.orderTriggeredTurn = view.turn;
          for (const e of CARD_MAP[unit.cardId].onOrder || []) score += effectValue(e, context.view, owner, null, unit);
        }
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
      if (t.isHq) score = u.attack >= them.hq ? 10000 : (u.attack * (them.hq <= 8 ? 2 : 1.15) + 0.4) * (1 + pressure);
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
