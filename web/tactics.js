import { CARD_MAP, RULES } from './data.js?v=1.3.2';
import { allUnits, applyAction, findUnit, getLegalActions, getTarget } from './engine.js?v=1.3.2';

export const TACTICAL_LIMITS = Object.freeze({ nodes: 160, depth: 6 });

/** Rebuild only public information. Unknown cards are inert draw placeholders.
 * Their identities are never used to choose a play, and no end-turn is searched.
 * Current rules trigger on drawing, not on the identity of the drawn card.
 */
function publicPosition(view) {
  const owner = view.currentPlayer;
  const visibleIds = [...allUnits(view).map(u => u.id), ...view.players[owner].hand.map(h => h.id)];
  const nextId = Math.max(0, ...visibleIds.map(id => Number(/^[cu](\d+)$/.exec(id)?.[1] || 0))) + 1;
  return {
    version: RULES.version, id: 'ai-preview', phase: 'battle', currentPlayer: owner,
    firstPlayer: view.firstPlayer, turn: view.turn, winner: null, rng: 1, nextId, nextEvent: 1,
    history: [], mulliganDone: [true, true], front: structuredClone(view.front),
    players: view.players.map(p => ({
      ...structuredClone(p), label: `玩家 ${p.id}`, deckName: '',
      hand: p.id === owner ? structuredClone(p.hand) : Array.from({ length: p.handCount }, (_, i) => ({ id: `unknown-${i}`, cardId: 'n-break' })),
      deck: Array(p.deckCount).fill('n-break')
    }))
  };
}
function priority(state, action) {
  if (action.type === 'attack') {
    const unit = findUnit(state, action.unit), target = getTarget(state, action.target);
    if (target.isHq) return 1000 + unit.attack;
    return unit.attack >= target.health ? 400 + target.attack : 50;
  }
  if (action.type === 'move') return CARD_MAP[findUnit(state, action.unit).cardId].unitType === 'tank' ? 200 : 0;
  const card = CARD_MAP[state.players[action.player].hand.find(h => h.id === action.card).cardId];
  const effects = card.kind === 'unit' ? card.onDeploy || [] : card.effects;
  if (effects.some(e => e.type === 'damage' && (e.target === 'enemyHq' || action.target === `hq:${1 - action.player}`))) return 900;
  if (effects.some(e => e.type === 'ready' || e.type === 'buff')) return 300;
  if (effects.some(e => e.type === 'damage')) return 250;
  if (card.keywords.includes('blitz')) return 150;
  return effects.some(e => e.type === 'draw') ? 20 : 10;
}
/** Find a short, fully verified win without guessing a draw or another turn. */
export function findWinningAction(view, actions) {
  if (view.phase !== 'battle' || !actions.length) return null;
  const owner = view.currentPlayer, enemy = 1 - owner;
  const directAttack = actions.filter(a => a.type === 'attack' && a.target === `hq:${enemy}`)
    .reduce((sum, a) => sum + findUnit(view, a.unit).attack, 0);
  const directOrder = view.players[owner].hand.some(h => [...(CARD_MAP[h.cardId].effects || []), ...(CARD_MAP[h.cardId].onDeploy || [])].some(e => e.type === 'damage' && ['enemy', 'enemyHq'].includes(e.target)));
  if (view.players[enemy].hq > 12 && directAttack < view.players[enemy].hq && !directOrder) return null;
  const initial = publicPosition(view), knownHand = new Set(view.players[owner].hand.map(h => h.id));
  const seen = new Map(); let nodes = 0;
  function search(state, candidates, depth) {
    if (!depth || nodes >= TACTICAL_LIMITS.nodes) return null;
    const key = JSON.stringify([state.players.map(p => [p.hq, p.energy, p.fatigue, p.hand, p.deck.length]), allUnits(state)]);
    if ((seen.get(key) || 0) >= depth) return null;
    seen.set(key, depth);
    const ordered = candidates.filter(a => a.type !== 'endTurn' && (a.type !== 'play' || knownHand.has(a.card)))
      .map(action => ({ action, score: priority(state, action) })).sort((a, b) => b.score - a.score);
    for (const { action } of ordered) {
      if (nodes++ >= TACTICAL_LIMITS.nodes) break;
      const result = applyAction(state, action);
      if (!result.ok) continue;
      if (result.state.phase === 'finished') {
        if (result.state.winner === owner) return action;
        continue;
      }
      if (search(result.state, getLegalActions(result.state), depth - 1)) return action;
    }
    return null;
  }
  return search(initial, actions, TACTICAL_LIMITS.depth);
}
/** Do not spend the turn on a publicly certain immediate loss. */
export function avoidImmediateLoss(view, rankedActions) {
  const state = publicPosition(view), owner = view.currentPlayer;
  for (const action of rankedActions) {
    if (action.type === 'endTurn') return action;
    const result = applyAction(state, action);
    if (result.ok && !(result.state.phase === 'finished' && result.state.winner === 1 - owner)) return action;
  }
  return rankedActions.find(a => a.type === 'endTurn') || rankedActions[0];
}
