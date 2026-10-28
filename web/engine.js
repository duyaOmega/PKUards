import { CARD_MAP, FACTIONS, RULES, validateDeck } from './data.js?v=1.3.5';

/** The engine is DOM-free. All state transitions use the same public action API. */
export function actionKey(a) {
  return [a.type, a.player, a.card || '', a.unit || '', a.slot ?? '', a.target || '', a.cards ? [...a.cards].sort().join(',') : ''].join('|');
}
function random(state) {
  let x = state.rng;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.rng = x >>> 0 || 1;
  return state.rng / 4294967296;
}
function shuffle(state, cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
function log(state, text, kind = 'info', extra = {}) {
  const event = { id: state.nextEvent++, turn: state.turn, text, kind, ...extra };
  state.history.push(event);
  if (state.history.length > 160) state.history.shift();
}
export function allUnits(state, owner) {
  return [...state.players.flatMap(p => p.support.filter(Boolean)), ...state.front.slots.filter(Boolean)].filter(u => owner === undefined || u.owner === owner);
}
export function findUnit(state, id) { return allUnits(state).find(u => u.id === id); }
export function getTarget(state, id) {
  if (typeof id !== 'string') return null;
  if (/^hq:[01]$/.test(id)) { const owner = Number(id.at(-1)); return { id, owner, isHq: true, health: state.players[owner].hq, maxHealth: RULES.hqHealth, row: 'support', slot: RULES.hqSlot }; }
  return findUnit(state, id) || null;
}
function drawCards(state, owner, count) {
  const p = state.players[owner];
  for (let i = 0; i < count; i++) {
    if (!p.deck.length) {
      p.fatigue++;
      p.hq -= p.fatigue;
      log(state, `${p.label}牌库耗尽，疲劳造成 ${p.fatigue} 点伤害`, 'damage', { target: `hq:${owner}`, amount: p.fatigue });
      continue;
    }
    const cardId = p.deck.pop();
    if (p.hand.length >= RULES.handLimit) {
      p.discard.push(cardId);
      log(state, `${p.label}手牌已满，弃置「${CARD_MAP[cardId].name}」`, 'discard');
    } else {
      p.hand.push({ id: `c${state.nextId++}`, cardId });
      for (const u of [...allUnits(state, owner)].filter(u => u.health > 0)) runEffects(state, CARD_MAP[u.cardId].onDraw || [], owner, null, u);
    }
  }
}
function spawn(state, owner, cardId, slot, fromHand = false) {
  const p = state.players[owner], c = CARD_MAP[cardId];
  if (slot === undefined) slot = p.support.findIndex((u, i) => i !== RULES.hqSlot && !u);
  if (slot < 0 || slot === RULES.hqSlot || p.support[slot]) return null;
  const u = { id: `u${state.nextId++}`, cardId, owner, attack: c.attack, health: c.health, maxHealth: c.health, opCost: c.opCost, keywords: [...c.keywords], row: 'support', slot, sick: !c.keywords.includes('blitz'), moved: false, attacked: false };
  p.support[slot] = u;
  log(state, `${p.label}部署「${c.name}」`, 'deploy', { unit: u.id, owner, slot, cardId, fromHand });
  return u;
}
function removeUnit(state, u) {
  if (u.row === 'front') state.front.slots[u.slot] = null;
  else state.players[u.owner].support[u.slot] = null;
  state.players[u.owner].discard.push(u.cardId);
}
function syncFront(state) {
  const first = state.front.slots.find(Boolean);
  state.front.owner = first ? first.owner : null;
}
function resolveDeaths(state) {
  for (let safety = 0; safety < 100; safety++) {
    const dead = allUnits(state).filter(u => u.health <= 0);
    if (!dead.length) break;
    for (const u of dead) {
      removeUnit(state, u);
      log(state, `「${CARD_MAP[u.cardId].name}」离场`, 'death', { unit: u.id, owner: u.owner });
    }
    syncFront(state);
    for (const u of dead) runEffects(state, CARD_MAP[u.cardId].onDeath || [], u.owner, null, u);
  }
  syncFront(state);
}
function checkWinner(state) {
  const lost = state.players.map(p => p.hq <= 0);
  if (!lost.some(Boolean)) return;
  state.phase = 'finished';
  state.winner = lost.every(Boolean) ? 'draw' : lost[0] ? 1 : 0;
  log(state, state.winner === 'draw' ? '双方基地同时失去士气，本局平局' : `${state.players[state.winner].label}获胜`, 'finish');
}
/** Read-only target resolution shared by the engine and visible-information AI. */
export function effectTargets(state, selector, owner, targetId, source) {
  if (!selector) return [];
  if (['enemy', 'enemyUnit', 'friendly', 'friendlyUnit', 'any'].includes(selector)) { const target = getTarget(state, targetId); return target ? [target] : []; }
  if (selector === 'self') { const target = source && findUnit(state, source.id); return target ? [target] : []; }
  if (selector === 'selfHq') return [getTarget(state, `hq:${owner}`)];
  if (selector === 'enemyHq') return [getTarget(state, `hq:${1 - owner}`)];
  if (selector === 'allFriendlyUnits') return allUnits(state, owner);
  if (selector === 'allEnemyUnits') return allUnits(state, 1 - owner);
  if (selector === 'allUnits') return allUnits(state);
  if (selector === 'enemyFront') return allUnits(state, 1 - owner).filter(u => u.row === 'front');
  if (selector === 'adjacentFriendly' && source) return [...allUnits(state, owner), getTarget(state, `hq:${owner}`)].filter(t => t.row === source.row && Math.abs(t.slot - source.slot) === 1);
  return [];
}
function runEffects(state, effects, owner, targetId, source) {
  for (const e of effects) {
    if (e.sourceInFront && source?.row !== 'front') continue;
    if (e.conditionFrontline && state.front.owner !== owner) continue;
    if (e.hqAtMost !== undefined && state.players[owner].hq > e.hqAtMost) continue;
    if (e.type === 'draw') { drawCards(state, owner, e.amount); log(state, `${state.players[owner].label}抽取 ${e.amount} 张牌`, 'info', { owner, source: source?.id }); continue; }
    if (e.type === 'summon') {
      for (let i = 0; i < e.count; i++) {
        if (!spawn(state, owner, e.cardId)) { log(state, '后场已满，未能召唤更多伙伴', 'info'); break; }
      }
      continue;
    }
    for (const t of effectTargets(state, e.target, owner, targetId, source)) {
      if (e.filterType && (t.isHq || CARD_MAP[t.cardId].unitType !== e.filterType)) continue;
      if (e.type === 'damage') {
        if (t.isHq) state.players[t.owner].hq -= e.amount;
        else t.health -= e.amount;
        log(state, `${t.isHq ? state.players[t.owner].label + '基地' : '「' + CARD_MAP[t.cardId].name + '」'}受到 ${e.amount} 点伤害`, 'damage', { target: t.id, amount: e.amount });
      } else if (e.type === 'heal') {
        const before = t.isHq ? state.players[t.owner].hq : t.health;
        const after = Math.min(t.maxHealth, before + e.amount);
        if (t.isHq) state.players[t.owner].hq = after;
        else t.health = after;
        if (after > before) log(state, `恢复 ${after - before} 点${t.isHq ? '士气' : '生命'}`, 'heal', { target: t.id, amount: after - before });
      } else if (e.type === 'buff' && !t.isHq) {
        t.attack += e.attack; t.maxHealth += e.health; t.health += e.health;
        for (const key of e.keywords || []) if (!t.keywords.includes(key)) t.keywords.push(key);
        if (e.keywords?.includes('blitz')) t.sick = false;
        log(state, `「${CARD_MAP[t.cardId].name}」获得强化`, 'buff', { target: t.id, attack: e.attack, health: e.health });
      } else if (e.type === 'discount' && !t.isHq) {
        const reduction = Math.min(t.opCost, e.amount); t.opCost -= reduction;
        if (reduction) log(state, `「${CARD_MAP[t.cardId].name}」行动费用 -${reduction}`, 'buff', { target: t.id, effectType: 'discount', amount: reduction });
      } else if (e.type === 'ready' && !t.isHq) {
        t.sick = false; t.moved = false; t.attacked = false;
        log(state, `「${CARD_MAP[t.cardId].name}」重新获得行动机会`, 'buff', { target: t.id, effectType: 'ready' });
      }
    }
  }
}
function beginTurn(state, owner) {
  state.phase = 'battle'; state.currentPlayer = owner; state.turn++;
  const p = state.players[owner];
  p.maxEnergy = Math.min(RULES.maxEnergy, p.maxEnergy + 1); p.energy = p.maxEnergy;
  for (const u of allUnits(state, owner)) { u.sick = false; u.moved = false; u.attacked = false; }
  log(state, `${p.label}的回合 · ${p.energy} 点精力`, 'turn', { owner });
  drawCards(state, owner, 1);
  for (const u of [...allUnits(state, owner)]) runEffects(state, CARD_MAP[u.cardId].onTurnStart || [], owner, null, u);
  resolveDeaths(state); checkWinner(state);
}

export function createGame({ playerDeck, aiDeck, seed = Date.now(), firstPlayer, labels = ['你', '燕园同窗'] }) {
  for (const deck of [playerDeck, aiDeck]) {
    const errors = validateDeck(deck);
    if (errors.length) throw new Error(errors.join('；'));
  }
  const state = { version: RULES.version, id: `${Date.now().toString(36)}-${(seed >>> 0).toString(36)}`, rng: seed >>> 0 || 1, nextId: 1, nextEvent: 1, phase: 'mulligan', currentPlayer: 0, firstPlayer: firstPlayer ?? ((seed >>> 0) % 2), mulliganDone: [false, false], turn: 0, winner: null, history: [], front: { owner: null, slots: Array(5).fill(null) }, players: [playerDeck, aiDeck].map((deck, id) => ({ id, label: labels[id], faction: deck.faction, deckName: deck.name, hq: RULES.hqHealth, maxEnergy: 0, energy: 0, fatigue: 0, hand: [], deck: [...deck.cards], discard: [], support: Array(5).fill(null) })) };
  for (const p of state.players) { shuffle(state, p.deck); drawCards(state, p.id, p.id === state.firstPlayer ? 4 : 5); }
  log(state, '欢迎来到燕园争锋。选择需要替换的起手牌。');
  return state;
}
function selectedTargetRule(card) {
  return (card.kind === 'unit' ? card.onDeploy : card.effects)?.find(e => ['enemy', 'enemyUnit', 'friendly', 'friendlyUnit', 'any'].includes(e.target))?.target;
}
function playableTargets(state, owner, rule) {
  if (!rule) return [null];
  const units = allUnits(state);
  const all = [...units.map(u => ({ id: u.id, owner: u.owner, isHq: false })), ...state.players.map(p => ({ id: `hq:${p.id}`, owner: p.id, isHq: true }))];
  return all.filter(t => rule === 'any' || ((rule.startsWith('enemy') ? t.owner !== owner : t.owner === owner) && (!rule.endsWith('Unit') || !t.isHq))).map(t => t.id);
}
function isGuarded(state, target) {
  return allUnits(state, target.owner).some(u => u.id !== target.id && u.row === target.row && Math.abs(u.slot - target.slot) === 1 && u.keywords.includes('guard'));
}
export function canAttack(state, u, targetId) {
  const t = getTarget(state, targetId);
  if (!t || t.owner === u.owner || (!t.isHq && t.keywords.includes('smoke'))) return false;
  const type = CARD_MAP[u.cardId].unitType;
  if (['infantry', 'tank'].includes(type) && u.row !== 'front' && t.row !== 'front') return false;
  if (!['artillery', 'bomber'].includes(type) && isGuarded(state, t)) return false;
  if (type === 'bomber' && (t.isHq || CARD_MAP[t.cardId].unitType !== 'fighter') && allUnits(state, t.owner).some(v => v.row === t.row && CARD_MAP[v.cardId].unitType === 'fighter')) return false;
  return true;
}
export function getLegalActions(state, owner = state.currentPlayer) {
  if (state.phase === 'finished' || owner !== state.currentPlayer) return [];
  const p = state.players[owner], actions = [];
  if (state.phase === 'mulligan') {
    if (state.mulliganDone[owner]) return [];
    for (let mask = 0; mask < (1 << p.hand.length); mask++) actions.push({ type: 'mulligan', player: owner, cards: p.hand.filter((_, i) => mask & (1 << i)).map(c => c.id) });
    return actions;
  }
  for (const hand of p.hand) {
    const c = CARD_MAP[hand.cardId];
    if (c.cost > p.energy) continue;
    const targets = playableTargets(state, owner, selectedTargetRule(c));
    if (c.kind === 'unit') {
      for (let slot = 0; slot < 5; slot++) if (slot !== RULES.hqSlot && !p.support[slot]) for (const target of targets) actions.push({ type: 'play', player: owner, card: hand.id, slot, ...(target ? { target } : {}) });
    } else for (const target of targets) actions.push({ type: 'play', player: owner, card: hand.id, ...(target ? { target } : {}) });
  }
  for (const u of allUnits(state, owner)) {
    if (u.sick || u.opCost > p.energy) continue;
    const type = CARD_MAP[u.cardId].unitType;
    if (u.row === 'support' && !u.moved && !u.attacked && (state.front.owner === null || state.front.owner === owner)) {
      for (let slot = 0; slot < 5; slot++) if (!state.front.slots[slot]) actions.push({ type: 'move', player: owner, unit: u.id, slot });
    }
    if (u.attack > 0 && !u.attacked && (!u.moved || type === 'tank')) {
      for (const target of [...allUnits(state, 1 - owner).map(t => t.id), `hq:${1 - owner}`]) if (canAttack(state, u, target)) actions.push({ type: 'attack', player: owner, unit: u.id, target });
    }
  }
  actions.push({ type: 'endTurn', player: owner });
  return actions;
}
export function applyAction(state, action) {
  const key = actionKey(action);
  const legal = getLegalActions(state).find(a => actionKey(a) === key);
  if (!legal) return { ok: false, state, events: [], error: '当前不能执行此操作：请检查精力、目标、站位和行动状态。' };
  const next = structuredClone(state), startEvent = next.nextEvent;
  const p = next.players[legal.player];
  if (legal.type === 'mulligan') {
    const replaced = p.hand.filter(c => legal.cards.includes(c.id));
    p.hand = p.hand.filter(c => !legal.cards.includes(c.id));
    drawCards(next, p.id, replaced.length);
    p.deck.push(...replaced.map(c => c.cardId)); shuffle(next, p.deck);
    next.mulliganDone[p.id] = true;
    log(next, `${p.label}完成换牌（${replaced.length} 张）`);
    if (next.mulliganDone.every(Boolean)) beginTurn(next, next.firstPlayer);
    else next.currentPlayer = 1 - p.id;
  } else if (legal.type === 'play') {
    const index = p.hand.findIndex(c => c.id === legal.card), hand = p.hand.splice(index, 1)[0], c = CARD_MAP[hand.cardId];
    p.energy -= c.cost;
    if (c.kind === 'unit') {
      const u = spawn(next, p.id, c.id, legal.slot, true);
      runEffects(next, c.onDeploy || [], p.id, legal.target, u);
    } else {
      p.discard.push(c.id);
      log(next, `${p.label}使用「${c.name}」`, 'play', { cardId: c.id, owner: p.id, target: legal.target });
      runEffects(next, c.effects, p.id, legal.target, null);
      resolveDeaths(next);
      for (const u of [...allUnits(next, p.id)]) {
        const hooks = CARD_MAP[u.cardId].onOrder;
        if (hooks && u.orderTriggeredTurn !== next.turn) { u.orderTriggeredTurn = next.turn; runEffects(next, hooks, p.id, null, u); }
      }
    }
    resolveDeaths(next); checkWinner(next);
  } else if (legal.type === 'move') {
    const u = findUnit(next, legal.unit);
    p.energy -= u.opCost;
    p.support[u.slot] = null;
    u.row = 'front'; u.slot = legal.slot; u.moved = true; u.keywords = u.keywords.filter(k => k !== 'smoke');
    next.front.slots[legal.slot] = u; syncFront(next);
    log(next, `「${CARD_MAP[u.cardId].name}」推进至前线`, 'move', { unit: u.id, owner: p.id, slot: legal.slot });
    runEffects(next, CARD_MAP[u.cardId].onMove || [], p.id, null, u);
    resolveDeaths(next); checkWinner(next);
  } else if (legal.type === 'attack') {
    const u = findUnit(next, legal.unit), t = getTarget(next, legal.target), type = CARD_MAP[u.cardId].unitType;
    p.energy -= u.opCost; u.attacked = true; u.keywords = u.keywords.filter(k => k !== 'smoke');
    log(next, `「${CARD_MAP[u.cardId].name}」攻击${t.isHq ? '敌方基地' : '「' + CARD_MAP[t.cardId].name + '」'}`, 'attack', { unit: u.id, target: t.id, amount: u.attack });
    if (t.isHq) next.players[t.owner].hq -= u.attack;
    else {
      const defendingType = CARD_MAP[t.cardId].unitType;
      const retaliation = defendingType !== 'bomber' && type !== 'artillery' && (type !== 'bomber' || defendingType === 'fighter');
      const returningDamage = retaliation ? t.attack : 0;
      t.health -= u.attack; u.health -= returningDamage;
    }
    resolveDeaths(next); checkWinner(next);
  } else if (legal.type === 'endTurn') beginTurn(next, 1 - p.id);
  return { ok: true, state: next, events: next.history.filter(e => e.id >= startEvent) };
}

/** Remove BOTH deck orders and the opponent's hand before an AI decision. */
export function getObservation(state, owner) {
  return { phase: state.phase, currentPlayer: state.currentPlayer, firstPlayer: state.firstPlayer, turn: state.turn, front: structuredClone(state.front), players: state.players.map(p => ({ id: p.id, faction: p.faction, hq: p.hq, energy: p.energy, maxEnergy: p.maxEnergy, fatigue: p.fatigue, hand: p.id === owner ? structuredClone(p.hand) : undefined, handCount: p.hand.length, deckCount: p.deck.length, discard: [...p.discard], support: structuredClone(p.support) })) };
}
export function validateState(state) {
  if (!state || state.version !== RULES.version || !['mulligan', 'battle', 'finished'].includes(state.phase) || !Array.isArray(state.players) || state.players.length !== 2 || !state.front || !Array.isArray(state.front.slots) || state.front.slots.length !== 5) return false;
  const integer = Number.isSafeInteger;
  const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
  const knownCard = id => typeof id === 'string' && Object.hasOwn(CARD_MAP, id);
  if (!validId(state.id) || ![0, 1].includes(state.currentPlayer) || ![0, 1].includes(state.firstPlayer) || ![null, 0, 1].includes(state.front.owner) || !integer(state.turn) || state.turn < 0 || !integer(state.rng) || state.rng < 1 || state.rng > 0xffffffff || !integer(state.nextId) || state.nextId < 1 || !Array.isArray(state.history) || state.history.length > 160 || !integer(state.nextEvent) || state.nextEvent < 1 || !Array.isArray(state.mulliganDone) || state.mulliganDone.length !== 2 || state.mulliganDone.some(v => typeof v !== 'boolean')) return false;
  if (state.phase === 'mulligan' ? state.turn !== 0 || state.mulliganDone[state.currentPlayer] : state.turn < 1 || !state.mulliganDone.every(Boolean)) return false;
  const eventKinds = ['info', 'discard', 'deploy', 'damage', 'heal', 'buff', 'turn', 'play', 'move', 'attack', 'death', 'finish'];
  if (state.history.some((e, i) => !e || !integer(e.id) || e.id <= (i ? state.history[i - 1].id : 0) || e.id >= state.nextEvent || !integer(e.turn) || e.turn < 0 || e.turn > state.turn || !eventKinds.includes(e.kind) || typeof e.text !== 'string' || e.cardId !== undefined && !knownCard(e.cardId) || e.owner !== undefined && ![0, 1].includes(e.owner))) return false;
  const ids = new Set();
  function registerId(id) {
    if (!validId(id) || ids.has(id)) return false;
    const generated = /^[cu](\d+)$/.exec(id);
    if (generated && Number(generated[1]) >= state.nextId) return false;
    ids.add(id); return true;
  }
  for (let owner = 0; owner < 2; owner++) {
    const p = state.players[owner];
    if (!p || p.id !== owner || !Object.hasOwn(FACTIONS, p.faction) || p.faction === 'neutral' || typeof p.label !== 'string' || typeof p.deckName !== 'string' || !integer(p.hq) || p.hq > RULES.hqHealth || !integer(p.energy) || !integer(p.maxEnergy) || p.energy < 0 || p.energy > p.maxEnergy || p.maxEnergy > RULES.maxEnergy || !integer(p.fatigue) || p.fatigue < 0 || !Array.isArray(p.support) || p.support.length !== 5 || p.support[RULES.hqSlot] !== null || !Array.isArray(p.deck) || !Array.isArray(p.discard) || !Array.isArray(p.hand) || p.hand.length > RULES.handLimit) return false;
    if ([...p.deck, ...p.discard].some(id => !knownCard(id)) || p.hand.some(c => !c || !knownCard(c.cardId))) return false;
    for (const c of p.hand) if (!registerId(c.id)) return false;
  }
  for (const [row, slots, owner] of [['support', state.players[0].support, 0], ['support', state.players[1].support, 1], ['front', state.front.slots, state.front.owner]]) {
    for (let slot = 0; slot < 5; slot++) {
      const u = slots[slot]; if (u === null) continue;
      if (!u || !registerId(u.id) || !knownCard(u.cardId) || CARD_MAP[u.cardId].kind !== 'unit' || u.owner !== owner || u.row !== row || u.slot !== slot || !integer(u.attack) || u.attack < 0 || !integer(u.health) || u.health <= 0 || !integer(u.maxHealth) || u.health > u.maxHealth || !integer(u.opCost) || u.opCost < 0 || !Array.isArray(u.keywords) || u.keywords.some(k => !['blitz', 'guard', 'smoke'].includes(k)) || ['sick', 'moved', 'attacked'].some(k => typeof u[k] !== 'boolean') || u.orderTriggeredTurn !== undefined && (!integer(u.orderTriggeredTurn) || u.orderTriggeredTurn < 0 || u.orderTriggeredTurn > state.turn)) return false;
    }
  }
  if (state.front.slots.every(u => !u) && state.front.owner !== null) return false;
  const lost = state.players.map(p => p.hq <= 0);
  if (state.phase === 'finished' ? !lost.some(Boolean) || state.winner !== (lost.every(Boolean) ? 'draw' : lost[0] ? 1 : 0) : state.winner !== null || lost.some(Boolean)) return false;
  return true;
}
