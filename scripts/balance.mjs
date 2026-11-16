/** Reproducible card audit and non-mirror, paired-initiative AI experiments. */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS, PRESETS, RULES, CARD_MAP } from '../web/data.js';
import { createGame, getLegalActions, applyAction, getObservation, validateState } from '../web/engine.js';
import { chooseAction, AI_CONFIG } from '../web/ai.js';

const hooks = ['onDeploy', 'onDeath', 'onTurnStart', 'onDraw', 'onMove', 'onOrder'];
function mechanics(card, includeBody = true) {
  return JSON.stringify({ ...(includeBody ? { cost: card.cost, attack: card.attack, health: card.health, opCost: card.opCost } : {}),
    type: card.unitType, keywords: [...card.keywords].sort(), ...Object.fromEntries(hooks.map(key => [key, card[key] || []])) });
}
export function auditCards() {
  const units = CARDS.filter(c => c.kind === 'unit'), duplicates = [], bodyDominance = [];
  for (let a = 0; a < units.length; a++) for (let b = a + 1; b < units.length; b++) {
    const left = units[a], right = units[b];
    if (mechanics(left) === mechanics(right)) duplicates.push([left.id, right.id]);
    if (mechanics(left, false) !== mechanics(right, false)) continue;
    for (const [better, worse] of [[left, right], [right, left]]) {
      if (better.cost <= worse.cost && better.opCost <= worse.opCost && better.attack >= worse.attack && better.health >= worse.health &&
          (better.cost < worse.cost || better.opCost < worse.opCost || better.attack > worse.attack || better.health > worse.health)) {
        bodyDominance.push({ better: better.id, worse: worse.id, scope: better.faction === worse.faction ? 'same faction' : 'different access; inspect faction trade-off' });
      }
    }
  }
  return { cardCount: CARDS.length, units: units.length, orders: CARDS.length - units.length, duplicateUnits: duplicates, sameMechanicsBodyDominance: bodyDominance,
    factions: PRESETS.map(deck => ({ faction: deck.faction, units: CARDS.filter(c => c.faction === deck.faction && c.kind === 'unit').length, orders: CARDS.filter(c => c.faction === deck.faction && c.kind === 'event').length,
      presetUnits: deck.cards.filter(id => CARD_MAP[id].kind === 'unit').length, presetOrders: deck.cards.filter(id => CARD_MAP[id].kind === 'event').length })) };
}
function interval(wins, losses) {
  const n = wins + losses; if (!n) return null;
  const p = wins / n, z = 1.96, d = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / d, half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [center - half, center + half].map(x => +x.toFixed(4));
}
export function summarizeBalance(results) {
  const factions = {};
  for (const deck of PRESETS) {
    let wins = 0, losses = 0, draws = 0;
    for (const game of results) {
      if (![game.a, game.b].includes(deck.faction)) continue;
      if (game.winner === 'draw') draws++;
      else if (game.winner === deck.faction) wins++; else losses++;
    }
    factions[deck.faction] = { wins, losses, draws, decisiveWinRate: wins + losses ? +(wins / (wins + losses)).toFixed(4) : null, wilson95: interval(wins, losses) };
  }
  const pairs = [];
  for (let a = 0; a < PRESETS.length; a++) for (let b = a + 1; b < PRESETS.length; b++) {
    const rows = results.filter(r => r.a === PRESETS[a].faction && r.b === PRESETS[b].faction);
    const wins = rows.filter(r => r.winner === PRESETS[a].faction).length, losses = rows.filter(r => r.winner === PRESETS[b].faction).length;
    pairs.push({ a: PRESETS[a].faction, b: PRESETS[b].faction, aWins: wins, bWins: losses, draws: rows.length - wins - losses, aWinRate: wins + losses ? +(wins / (wins + losses)).toFixed(4) : null, wilson95: interval(wins, losses) });
  }
  const decisive = results.filter(r => r.winner !== 'draw');
  return { games: results.length, factions, pairs, firstPlayerWinRate: decisive.length ? +(decisive.filter(r => r.winner === r.first).length / decisive.length).toFixed(4) : null,
    maxTurns: Math.max(0, ...results.map(r => r.turns)), meanRounds: results.length ? +(results.reduce((n, r) => n + Math.ceil(r.turns / 2), 0) / results.length).toFixed(2) : null };
}
export function runBalance({ seed = 20261115, rounds = 20, policy = 'balanced', diagnostics = false, onProgress = () => {} } = {}) {
  const results = [], activity = Object.fromEntries(PRESETS.map(d => [d.faction, { units: 0, orders: 0, moves: 0, attacks: 0, reserves: 0, cardsDrawn: 0, weakenedAttack: 0 }]));
  let pair = 0;
  for (let a = 0; a < PRESETS.length; a++) for (let b = a + 1; b < PRESETS.length; b++, pair++) {
    for (let repeat = 0; repeat < rounds; repeat++) for (const firstPlayer of [0, 1]) {
      const gameSeed = (seed + pair * 65537 + repeat * 104729) >>> 0;
      let state = createGame({ playerDeck: PRESETS[a], aiDeck: PRESETS[b], seed: gameSeed, firstPlayer }), actionsTaken = 0, turnActions = 0, previousTurn = -1;
      const notes = { firstFront: null, firstBaseHit: null, reserveTurn: [null,null], frontTurns: [0,0], zeroAttackTurns: [0,0], emptyHandTurns: [0,0], unusedEnergy: [0,0], opening: [] };
      while (state.phase !== 'finished') {
        if (++actionsTaken > 2400 || state.turn > 180) throw Error('Unfinished balance match: ' + JSON.stringify({ a, b, firstPlayer, gameSeed }));
        if (state.turn !== previousTurn) { turnActions = 0; previousTurn = state.turn; }
        const actions = getLegalActions(state);
        let action = chooseAction(getObservation(state, state.currentPlayer), actions, policy === 'adaptive' ? {} : { pressure: policy === 'pressure' ? 0.75 : 0 });
        if (++turnActions > AI_CONFIG.maxActionsPerTurn && state.phase === 'battle') action = actions.find(a => a.type === 'endTurn');
        if (!action) throw Error('No AI action');
        const actor = activity[state.players[action.player].faction];
        if (action.type === 'play') actor[CARD_MAP[state.players[action.player].hand.find(h => h.id === action.card).cardId].kind === 'unit' ? 'units' : 'orders']++;
        if (action.type === 'move') actor.moves++;
        if (action.type === 'attack') actor.attacks++;
        if (action.type === 'reserve') actor.reserves++;
        const before = state, result = applyAction(state, action);
        if (!result.ok || !validateState(result.state)) throw Error('Invalid balance action: ' + JSON.stringify(action));
        state = result.state;
        if (diagnostics && before.phase === 'battle') {
          if (action.type === 'move' && !notes.firstFront) notes.firstFront = { player: action.player, turn: before.turn };
          if (action.type === 'reserve') notes.reserveTurn[action.player] = before.turn;
          if (!notes.firstBaseHit && result.events.some(e => e.target === 'hq:' + (1 - action.player) && (e.kind === 'attack' || e.kind === 'damage'))) notes.firstBaseHit = { player: action.player, turn: before.turn };
          if (action.type === 'endTurn') {
            const p = before.players[action.player], units = [...p.support, ...before.front.slots].filter(u => u && u.owner === p.id);
            if (before.front.owner === p.id) notes.frontTurns[p.id]++;
            if (units.some(u => !u.attack)) notes.zeroAttackTurns[p.id]++;
            if (!p.hand.length) notes.emptyHandTurns[p.id]++;
            notes.unusedEnergy[p.id] += p.energy;
            if (Math.ceil(before.turn / 2) <= 3) notes.opening.push([p.id, before.turn, units.length, units.reduce((n,u)=>n+u.attack,0), p.hand.length, p.energy, before.front.owner]);
          }
        }
        if (action.type !== 'mulligan') for (const p of state.players) activity[p.faction].cardsDrawn += Math.max(0, before.players[p.id].deck.length - p.deck.length);
        for (const event of result.events) if (event.effectType === 'weaken') actor.weakenedAttack += -event.attack;
      }
      results.push({ a: PRESETS[a].faction, b: PRESETS[b].faction, seed: gameSeed, first: state.players[firstPlayer].faction,
        winner: state.winner === 'draw' ? 'draw' : state.players[state.winner].faction, turns: state.turn, actions: actionsTaken, hq: state.players.map(p => p.hq), ...(diagnostics ? { notes } : {}) });
    }
    onProgress(PRESETS[a].faction + '/' + PRESETS[b].faction, results.length);
  }
  return { rulesVersion: RULES.version, seed, rounds, policy, policyDescription: 'same visible-information tactical AI on both sides; pressure multiplies HQ attack score by 1.75', initiative: `second player starts with five cards and may once gain ${RULES.reserveEnergy} temporary energy above its ordinary cap, cleared at turn end; reserve is not an order`, audit: auditCards(), summary: summarizeBalance(results), activity, results };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const option = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
  const seed = Number(option('--seed', '20261115')), rounds = Number(option('--rounds', '20'));
  const policy = option('--policy', 'balanced'); if (!['balanced', 'pressure', 'adaptive'].includes(policy)) throw Error('--policy must be balanced, pressure or adaptive');
  if (!Number.isInteger(seed) || !Number.isInteger(rounds) || rounds < 1 || rounds > 200) throw Error('--seed must be an integer; --rounds must be 1–200');
  const report = process.argv.includes('--audit-only') ? { audit: auditCards() } : runBalance({ seed, rounds, policy, diagnostics: process.argv.includes('--diagnostics'), onProgress: (pair, games) => console.log(pair + ': ' + games + ' completed') });
  const out = option('--out', 'artifacts/balance.json'); await mkdir(dirname(out), { recursive: true }); await writeFile(out, JSON.stringify(report, null, process.argv.includes('--diagnostics') ? 0 : 2) + '\n');
  console.log(JSON.stringify({ output: out, audit: report.audit, summary: report.summary }, null, 2));
}
