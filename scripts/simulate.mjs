import { fileURLToPath } from 'node:url';
import { PRESETS } from '../web/data.js';
import { createGame, getLegalActions, applyAction, getObservation, validateState } from '../web/engine.js';
import { chooseAction, AI_CONFIG } from '../web/ai.js';

export function simulate({ seed = 20261028, rounds = 1 } = {}) {
  const results = [];
  for (let round = 0; round < rounds; round++) for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let first = 0; first < 2; first++) {
    let state = createGame({ playerDeck: PRESETS[a], aiDeck: PRESETS[b], seed: seed + results.length * 131, firstPlayer: first });
    let moves = 0, sameTurn = 0, previousTurn = -1;
    while (state.phase !== 'finished') {
      if (++moves > 2400 || state.turn > 180) throw new Error(`对局未终局：${a}/${b}/${first}，turn=${state.turn}`);
      if (state.turn !== previousTurn) { sameTurn = 0; previousTurn = state.turn; }
      const actions = getLegalActions(state);
      let action = chooseAction(getObservation(state, state.currentPlayer), actions);
      if (++sameTurn > AI_CONFIG.maxActionsPerTurn && state.phase === 'battle') action = actions.find(a => a.type === 'endTurn');
      if (!action) throw new Error('AI 未选择合法动作');
      const result = applyAction(state, action);
      if (!result.ok) throw new Error(result.error);
      state = result.state;
      if (!validateState(state)) throw new Error(`动作 ${JSON.stringify(action)} 产生无效状态`);
    }
    results.push({ player: PRESETS[a].faction, opponent: PRESETS[b].faction, firstPlayer: first, winner: state.winner, turns: state.turn, actions: moves, hq: state.players.map(p => p.hq) });
  }
  return results;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : Number(process.argv[i + 1]); };
  const seed = arg('--seed') ?? 20261028, rounds = arg('--rounds') ?? 1;
  if (!Number.isInteger(seed) || !Number.isInteger(rounds) || rounds < 1 || rounds > 100) throw new Error('--seed 须为整数，--rounds 须为 1–100');
  const started = Date.now(), results = simulate({ seed, rounds });
  console.log(JSON.stringify({ games: results.length, finished: results.length, seed, rounds, maxTurns: Math.max(...results.map(r => r.turns)), maxActions: Math.max(...results.map(r => r.actions)), seconds: +((Date.now() - started) / 1000).toFixed(2), results }, null, 2));
}
