import { CARD_MAP } from './data.js?v=1.3.1';
import { getTarget } from './engine.js?v=1.3.1';

const side = owner => owner === 0 ? '你的' : '同窗的';
export function targetLabel(state, id) {
  const t = getTarget(state, id);
  return t ? `${side(t.owner)}${t.isHq ? '基地' : CARD_MAP[t.cardId].name}` : '战场';
}
/** Only the committed public action and its public effects enter this snapshot. */
export function describeAction(before, action, result) {
  const hand = action.card && before.players[action.player].hand.find(h => h.id === action.card);
  const source = action.unit && getTarget(before, action.unit);
  const cardId = hand?.cardId || source?.cardId;
  const card = CARD_MAP[cardId];
  const impacts = result.events.filter(e => ['damage', 'heal', 'buff', 'death', 'deploy'].includes(e.kind));
  if (action.type === 'attack') {
    const target = getTarget(before, action.target);
    impacts.unshift({ kind: 'damage', target: action.target, amount: source.attack });
    if (target && !target.isHq) {
      const survivor = getTarget(result.state, source.id), lost = source.health - (survivor?.health ?? 0);
      const enemyType = CARD_MAP[target.cardId].unitType;
      const retaliates = enemyType !== 'bomber' && card.unitType !== 'artillery' && (card.unitType !== 'bomber' || enemyType === 'fighter');
      if (retaliates && lost > 0) impacts.push({ kind: 'damage', target: source.id, amount: target.attack });
    }
  }
  let targets = action.target ? [action.target] : [];
  if (!targets.length) targets = [...new Set(impacts.map(e => e.target || e.unit).filter(Boolean))];
  const targetText = action.target ? targetLabel(before, action.target) : action.type === 'move' ? '共享前线' : card?.text || '战场';
  return {
    owner: action.player, kind: action.type, cardId, sourceId: action.unit,
    slot: action.slot, targets, impacts,
    title: `${action.player === 0 ? '你' : '同窗'}${action.type === 'play' ? '打出' : action.type === 'move' ? '推进' : '发起攻击'}`,
    subtitle: action.type === 'play' && !action.target ? targetText : `${card?.name || '单位'} → ${targetText}`,
    targetText, events: result.events
  };
}
export function playbackStages(description, reducedMotion = false) {
  const stages = description.kind === 'play' && description.owner === 1
    ? [{ name: 'reveal', duration: 650 }, { name: 'aim', duration: 180 }, { name: 'impact', duration: 260 }]
    : description.kind === 'move'
      ? [{ name: 'aim', duration: 120 }, { name: 'impact', duration: 180 }]
      : [{ name: 'aim', duration: 160 }, { name: 'impact', duration: 240 }];
  return reducedMotion ? stages.map(s => ({ ...s, duration: Math.min(s.duration, s.name === 'reveal' ? 450 : 140) })) : stages;
}
/** Serialized playback: committing, skipping and repeated finish calls are idempotent. */
export function createPlayback({ stages, onStage, onCommit, onDone, schedule = setTimeout, cancel = clearTimeout }) {
  let timer, index = -1, committed = false, done = false;
  const commit = () => { if (!committed) { committed = true; onCommit(); } };
  function finish() { if (done) return; done = true; cancel(timer); commit(); onDone(); }
  function advance() {
    if (done) return;
    if (++index >= stages.length) { finish(); return; }
    const stage = stages[index]; onStage(stage.name);
    if (stage.name === 'impact') commit();
    timer = schedule(advance, stage.duration);
  }
  return { start: advance, finish };
}
