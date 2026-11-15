import { CARD_MAP, PRESETS } from './data.js?v=1.5.0';
import { createGame } from './engine.js?v=1.5.0';

/** Optional chapter goals use ordinary card rules and only public actions. */
export const CHAPTERS = [
  { id: 'west-gate', place: '西门', title: '初见燕园', seal: '启', time: '晨光初起', opponent: 'engineering', art: 'print-coder', seed: 111501,
    story: '从西门走进来，迎新的同窗已经摆好一桌牌。先认识你的伙伴，再把第一套主张打出来。',
    tip: '多部署伙伴，留出推进与攻击的精力。召唤的衍生伙伴不计入部署目标。',
    goals: [{ metric: 'units', target: 5, label: '从手牌部署 5 位伙伴' }, { metric: 'hq', target: 12, label: '获胜时保留至少 12 点士气' }] },
  { id: 'weiming-lake', place: '未名湖', title: '风起湖畔', seal: '湖', time: '沿湖而行', opponent: 'humanities', art: 'print-reader', seed: 111502,
    story: '读书会把牌桌搬到了湖畔。想越过稳固的守护，先让自己的伙伴站住前线。',
    tip: '控制前线后结束你的回合，即记 1 次；同一批伙伴可以连续驻守。',
    goals: [{ metric: 'frontTurns', target: 2, label: '控制前线结束己方回合 2 次' }, { metric: 'hq', target: 10, label: '获胜时保留至少 10 点士气' }] },
  { id: 'library', place: '图书馆', title: '翻页有声', seal: '知', time: '午后问学', opponent: 'science', art: 'print-math', seed: 111503,
    story: '书页间夹着一份新的战帖。对面的研究小组越战越强，指令的时机比手牌的厚度更要紧。',
    tip: '指令只按成功使用次数计数。尽早建立场面，别给研究小组太多成长时间。',
    goals: [{ metric: 'orders', target: 4, label: '成功使用 4 张指令牌' }, { metric: 'rounds', target: 14, label: '在第 14 轮结束前获胜' }] },
  { id: 'auditorium', place: '百讲', title: '此刻登场', seal: '鸣', time: '灯火入夜', opponent: 'society', art: 'print-field', seed: 111504,
    story: '夜色落下，最后一场切磋在百讲开场。让不同的观点接力，也给自己的基地留一点余裕。',
    tip: '在同一个己方回合使用两张指令即可；两次出牌之间可以进行其他行动。',
    goals: [{ metric: 'maxTurnOrders', target: 2, label: '在同一个己方回合使用 2 张指令' }, { metric: 'hq', target: 8, label: '获胜时保留至少 8 点士气' }] }
];
export const EMPTY_JOURNEY = { version: 1, chapters: {} };
const metrics = ['units', 'orders', 'frontTurns', 'turnOrders', 'maxTurnOrders'];
export const chapterById = id => CHAPTERS.find(chapter => chapter.id === id);
export function validJourneyProgress(value) {
  return value?.version === 1 && value.chapters && !Array.isArray(value.chapters) && typeof value.chapters === 'object' &&
    Object.entries(value.chapters).every(([id, record]) => chapterById(id) && record && Number.isInteger(record.stars) && record.stars >= 1 && record.stars <= 3 && Number.isSafeInteger(record.rounds) && record.rounds >= 1);
}
export function validJourneyMatch(value) {
  return value === undefined || !!(chapterById(value?.chapterId) && typeof value.deckId === 'string' && value.deckId.length <= 100 && value.metrics && metrics.every(key => Number.isSafeInteger(value.metrics[key]) && value.metrics[key] >= 0) && value.metrics.turnOrders <= value.metrics.maxTurnOrders && value.metrics.maxTurnOrders <= value.metrics.orders);
}
export function chapterUnlocked(progress, id) {
  const index = CHAPTERS.findIndex(chapter => chapter.id === id);
  return index === 0 || index > 0 && CHAPTERS.slice(0, index).every(chapter => progress.chapters[chapter.id]?.stars >= 1);
}
export function createJourneyGame({ chapterId, playerDeck, seed }) {
  const chapter = chapterById(chapterId);
  if (!chapter) throw new Error('未知的行记章节');
  const game = createGame({ playerDeck, aiDeck: PRESETS.find(deck => deck.faction === chapter.opponent), seed: seed ?? chapter.seed, firstPlayer: 0, labels: ['你', chapter.place + '同窗'] });
  game.journey = { chapterId, deckId: playerDeck.id, metrics: Object.fromEntries(metrics.map(key => [key, 0])) };
  return game;
}
/** Called once at commit, after a successful engine action, before saving. */
export function trackJourneyAction(before, result, action) {
  if (!result.ok || !before.journey || action.player !== 0) return;
  const m = result.state.journey.metrics;
  if (action.type === 'play') {
    const card = CARD_MAP[before.players[0].hand.find(card => card.id === action.card)?.cardId];
    if (card?.kind === 'unit') m.units++;
    if (card?.kind === 'event') { m.orders++; m.turnOrders++; m.maxTurnOrders = Math.max(m.maxTurnOrders, m.turnOrders); }
  }
  if (action.type === 'endTurn') {
    if (before.front.owner === 0) m.frontTurns++;
    m.turnOrders = 0;
  }
}
export function journeyObjectives(game) {
  const chapter = chapterById(game?.journey?.chapterId);
  if (!chapter) return [];
  const won = game.phase === 'finished' && game.winner === 0;
  return [{ label: '赢下这场切磋', met: won, detail: won ? '已完成' : '等待胜利' }, ...chapter.goals.map(goal => {
    const current = goal.metric === 'hq' ? Math.max(0, game.players[0].hq) : goal.metric === 'rounds' ? Math.ceil(game.turn / 2) : game.journey.metrics[goal.metric];
    const final = ['hq', 'rounds'].includes(goal.metric);
    return { ...goal, current, met: (!final || won) && (goal.metric === 'rounds' ? current <= goal.target : current >= goal.target),
      detail: goal.metric === 'rounds' ? `第 ${current} / ${goal.target} 轮` : goal.metric === 'hq' ? `当前 ${current} 点` : `${Math.min(current, goal.target)} / ${goal.target}` };
  })];
}
export function recordJourneyResult(progress, game) {
  if (!game?.journey || game.phase !== 'finished' || game.winner !== 0) return progress;
  const id = game.journey.chapterId;
  const stars = journeyObjectives(game).filter(goal => goal.met).length;
  const previous = progress.chapters[id];
  const best = { stars: Math.max(previous?.stars || 0, stars), rounds: Math.min(previous?.rounds || Infinity, Math.ceil(game.turn / 2)) };
  if (previous?.stars === best.stars && previous?.rounds === best.rounds) return progress;
  return { version: 1, chapters: { ...progress.chapters, [id]: best } };
}
