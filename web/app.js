import { CARDS, CARD_MAP, FACTIONS, PRESETS, RULES, UNIT_TYPES, KEYWORDS, validateDeck } from './data.js?v=1.2.0';
import { createGame, getLegalActions, applyAction, allUnits, findUnit, getObservation } from './engine.js?v=1.2.0';
import { chooseAction, AI_CONFIG } from './ai.js?v=1.2.0';
import { createStorage } from './storage.js?v=1.2.0';
import { illustration, campusScene } from './art.js?v=1.2.0';
import { resolveDrop, revealedPlays } from './interactions.js';
import { describeAction, playbackStages, createPlayback } from './presentation.js?v=1.2.1';

const app = document.querySelector('#app');
const memoryFallback = { getItem: () => null, setItem: () => { throw new Error('Storage unavailable'); } };
let browserStorage; try { browserStorage = window.localStorage; } catch { browserStorage = memoryFallback; }
const store = createStorage(browserStorage);
let customDecks = store.loadDecks(), game = store.loadMatch(), stats = store.loadStats(), settings = store.loadSettings();
const ui = { view: game && game.phase !== 'finished' ? 'battle' : 'home', selection: null, replace: [], modal: null, toast: store.warning(), filter: { faction: 'all', cost: 'all', type: 'all', keyword: 'all', query: '' }, draft: null, pickDeck: PRESETS[0].id, opponent: 'random', lastEvents: [], departed: [], tutorial: null, tutorialStep: 0, aiActions: 0 };
let aiTimer, toastTimer, drag = null, suppressClickUntil = 0, activePlayback = null;
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const attr = escape;
const factionColor = f => FACTIONS[f]?.color || FACTIONS.neutral.color;
const deckList = () => [...PRESETS, ...customDecks];
const playing = () => game && game.phase !== 'finished';
function toast(message) {
  ui.toast = message; document.querySelector('#announcer').textContent = message;
  clearTimeout(toastTimer); render(); toastTimer = setTimeout(() => { ui.toast = ''; render(); }, 3800);
}
function saveMatch() {
  store.saveMatch(game);
  if (game?.phase === 'finished' && !stats.completed.includes(game.id)) {
    stats[game.winner === 'draw' ? 'draws' : game.winner === 0 ? 'wins' : 'losses']++;
    stats.completed = [...stats.completed.slice(-99), game.id]; store.saveStats(stats);
    if (ui.cinema) ui.pendingResult = true;
    else ui.modal = { type: 'result' };
  }
  const warning = store.warning(); if (warning) ui.toast = warning;
}
function runAction(action) {
  if (ui.cinema) return;
  const result = applyAction(game, action);
  if (!result.ok) { toast(result.error); return; }
  const before = game;
  const commit = () => {
    ui.departed = allUnits(before).filter(u => result.events.some(e => e.kind === 'death' && e.unit === u.id));
    game = result.state; ui.lastEvents = result.events; ui.selection = null; ui.replace = [];
    document.querySelector('#announcer').textContent = result.events.map(e => e.text).join('。');
    saveMatch(); render();
  };
  if (ui.view === 'battle' && before.phase === 'battle' && ['play', 'move', 'attack'].includes(action.type)) {
    const description = describeAction(before, action, result);
    ui.selection = null;
    ui.cinema = { ...description, anchors: captureAnchors(before, result.state, action) };
    activePlayback = createPlayback({ stages: playbackStages(description, settings.reducedMotion),
      onStage: phase => { ui.cinema.phase = phase; render(); }, onCommit: commit,
      onDone: () => { ui.cinema = null; activePlayback = null; if (ui.pendingResult) { ui.pendingResult = false; ui.modal = { type: 'result' }; } render(); }
    });
    activePlayback.start();
  } else commit();
}
function scheduleAi() {
  clearTimeout(aiTimer);
  if (ui.view !== 'battle' || !game || game.phase === 'finished' || game.currentPlayer !== 1 || ui.modal || ui.cinema) return;
  const id = game.id, turn = game.turn;
  aiTimer = setTimeout(() => {
    if (game?.id !== id || game.turn !== turn || game.currentPlayer !== 1 || ui.view !== 'battle' || ui.modal) return;
    const actions = getLegalActions(game), view = getObservation(game, 1);
    let action = chooseAction(view, actions);
    if (game.phase === 'battle' && ++ui.aiActions > AI_CONFIG.maxActionsPerTurn) action = actions.find(a => a.type === 'endTurn');
    if (action?.type === 'endTurn' || game.phase === 'mulligan') ui.aiActions = 0;
    if (action) runAction(action);
  }, settings.reducedMotion ? Math.min(settings.aiSpeed, 250) : settings.aiSpeed);
}
function available() { return game && game.currentPlayer === 0 && game.phase === 'battle' && !ui.modal && !ui.cinema ? getLegalActions(game) : []; }
function selectedActions() {
  const s = ui.selection; if (!s) return [];
  return available().filter(a => s.kind === 'unit' ? a.unit === s.id : a.card === s.id && (s.slot === undefined || a.slot === s.slot));
}
function canTarget(id) {
  if (!ui.selection) return false;
  if (ui.selection.kind === 'hand') {
    const hand = game.players[0].hand.find(c => c.id === ui.selection.id);
    if (hand && CARD_MAP[hand.cardId].kind === 'unit' && ui.selection.slot === undefined) return false;
  }
  return selectedActions().some(a => a.target === id);
}
function hint() {
  if (ui.cinema) return `${ui.cinema.title}：${ui.cinema.subtitle}`;
  if (game.phase === 'finished') return '本局已结束。可以查看战场，或开始一场新的较量。';
  if (game.currentPlayer === 1) return '同窗正在思考… 留意对方如何分配精力与争夺前线。';
  const s = ui.selection;
  if (!s) return '选择手牌来部署伙伴或使用事件；选择场上单位来移动、攻击。';
  if (s.kind === 'unit') { const u = findUnit(game, s.id); return u ? `已选「${CARD_MAP[u.cardId].name}」· 点击高亮目标攻击，或点击前线空位推进。` : '请选择单位'; }
  const c = CARD_MAP[game.players[0].hand.find(h => h.id === s.id)?.cardId];
  return c?.kind === 'unit' && s.slot === undefined ? `部署「${c.name}」· 请选择己方后场的高亮空位。` : '请选择一个高亮目标；按 Esc 或点取消返回。';
}
function cardReason(c) {
  if (game.currentPlayer !== 0) return '等待你的回合；可以点右上角查看详情';
  if (c.cost > game.players[0].energy) return `需要 ${c.cost} 点精力，当前只有 ${game.players[0].energy} 点`;
  if (c.kind === 'unit' && game.players[0].support.filter(Boolean).length >= 4) return '己方后场已满，先将单位推进前线';
  return '目前没有合法目标';
}
function cardMarkup(c, options = {}) {
  const { context = 'collection', hand, selected = false, playable = false, replace = false } = options;
  const cost = c.cost;
  const action = context === 'hand' ? 'hand' : context === 'mulligan' ? 'replace' : context === 'builder' ? 'add-card' : 'inspect';
  const id = hand?.id || c.id;
  return `<article class="card-wrap ${context === 'hero' ? 'hero-card' : ''}" style="--faction:${factionColor(c.faction)}"><button class="game-card ${context} ${selected ? 'selected' : ''} ${playable ? 'playable' : ''} ${replace ? 'to-replace' : ''}" data-action="${action}" data-id="${attr(id)}" ${context === 'hand' && !playable ? `aria-disabled="true" title="${attr(cardReason(c))}"` : ''} aria-label="${attr(c.name)}，${cost} 费，${attr(c.text)}"><span class="card-top"><span class="card-faction">${escape(FACTIONS[c.faction].short)} / ${c.kind === 'event' ? '事件' : UNIT_TYPES[c.unitType]}</span><span class="card-cost">${cost}</span></span><span class="card-art">${illustration(c.art, c.faction)}</span><span class="card-name">${escape(c.name)}</span>${c.signature ? `<span class="card-signature">${escape(c.signature)}</span>` : ''}<span class="card-rules">${escape(c.text)}</span><span class="card-bottom">${c.kind === 'unit' ? `<span class="attack-stat">✦ ${c.attack}</span><span class="op-stat">行动 ${c.opCost}</span><span class="health-stat">♥ ${c.health}</span>` : `<span class="event-label">— 校园事件 —</span>`}</span>${replace ? '<span class="replace-stamp">替换</span>' : ''}</button>${context !== 'hero' ? `<button class="card-info" data-action="inspect" data-id="${c.id}" aria-label="查看${attr(c.name)}详情" title="卡牌详情">i</button>` : ''}</article>`;
}
function header() {
  const total = stats.wins + stats.losses + stats.draws;
  const links = [['home', '燕园大厅'], ['battle', '对战'], ['collection', '卡牌图鉴'], ['decks', '我的套牌'], ['guide', '玩法指南']];
  return `<header class="site-header"><button class="brand" data-action="route" data-view="home" aria-label="燕园大厅"><span class="brand-seal">燕</span><span><strong>PKUARDS<span class="brand-dot">.</span></strong><small>燕园争锋 · CAMPUS CARD GAME</small></span></button><nav aria-label="主导航">${links.map(([key, text]) => `<button data-action="route" data-view="${key}" class="nav-link ${ui.view === key || (key === 'battle' && ui.view === 'lobby') ? 'active' : ''}">${text}${key === 'battle' && playing() ? '<span class="live-dot"></span>' : ''}</button>`).join('')}</nav><div class="header-meta"><span class="record-count">${total} <small>场对局</small></span><button class="icon-button settings-button" data-action="settings" aria-label="设置" title="设置">⚙</button></div></header>`;
}
function footer() { return `<footer class="site-footer"><span>PKUARDS · 燕园争锋</span><span>在未名湖畔，打出你的一手好牌。</span><span>原创校园策略卡牌 / v1.2</span></footer>`; }
function home() {
  return `<main class="home-page"><section class="hero"><div class="hero-copy"><span class="eyebrow"><i></i> 一塔湖图之间，一场思想的交锋</span><h1>这一次，<br>在燕园<span>出牌。</span></h1><p class="hero-description">从静园书页，到未名湖畔。<br>集结你的校园伙伴，让每一种热爱成为力量。</p><div class="hero-actions"><button class="button primary large" data-action="route" data-view="${playing() ? 'battle' : 'lobby'}">${playing() ? '继续对局' : '开始对战'} <span>↗</span></button><button class="text-button" data-action="tutorial">初来燕园？先学一手 <span>→</span></button></div><div class="hero-facts"><span><strong>64</strong> 张原创卡牌</span><span><strong>4</strong> 大学科阵营</span><span>全卡解锁 <small>·</small> 自由组牌</span></div></div><div class="hero-visual"><span class="scene-caption">PEKING UNIVERSITY · 燕园手记</span><div class="campus-scene">${campusScene()}</div><div class="hero-card-stack">${cardMarkup(CARD_MAP['n-tower'], { context: 'hero' })}${cardMarkup(CARD_MAP['h-poetry'], { context: 'hero' })}${cardMarkup(CARD_MAP['e-robot'], { context: 'hero' })}</div><span class="hero-stamp">始于热爱<br><strong>成于交锋</strong></span></div></section><section class="factions-section"><div class="section-heading"><div><span class="eyebrow">CHOOSE YOUR SIDE</span><h2>四种学科，各有锋芒。</h2></div><button class="text-button" data-action="route" data-view="decks">探索你的套牌 <span>→</span></button></div><div class="faction-strip">${PRESETS.map((d, i) => { const f = FACTIONS[d.faction]; return `<button class="faction-tile" style="--faction:${f.color}" data-action="choose-deck" data-id="${d.id}"><div class="tile-heading"><span class="tile-number">0${i + 1}</span><span class="faction-symbol">${f.icon}</span></div><h3>${f.name}<span>↗</span></h3><p>${f.motto}</p><small>${f.style}</small></button>`; }).join('')}</div></section><section class="home-note"><span class="note-mark">“</span><p>在这里，数院的证明、工学的巧思、人文的温度与社科的洞察，<br class="desktop-only">都能成为一套独一无二的战术。</p><button class="text-button" data-action="route" data-view="collection">翻开卡牌图鉴 ↗</button></section></main>`;
}
function lobby() {
  const decks = deckList(), selected = decks.find(d => d.id === ui.pickDeck) || decks[0];
  return `<main class="page lobby-page"><div class="page-title"><span class="eyebrow">YOUR NEXT CHAPTER</span><h1>带上你的主张，出战。</h1><p>选择一套牌，与燕园同窗切磋。每一张牌，都有自己的位置。</p></div>${playing() ? `<div class="resume-banner"><span>你还有一场未结束的对局。开始新对局将覆盖当前进度。</span><button class="button small" data-action="route" data-view="battle">继续对局 →</button></div>` : ''}<div class="lobby-decks">${decks.map(d => { const f = FACTIONS[d.faction]; return `<button class="deck-choice ${selected.id === d.id ? 'chosen' : ''}" data-action="pick-deck" data-id="${attr(d.id)}" style="--faction:${f.color}"><span class="deck-cover">${illustration(f.art, d.faction)}<span class="deck-cover-seal">${f.icon}</span></span><span class="deck-choice-body"><small>${f.name} · ${d.preset ? '预组套牌' : '自定义'}</small><strong>${escape(d.name)}</strong><span>${f.style}</span></span><span class="deck-check">${selected.id === d.id ? '✓' : '+'}</span></button>`; }).join('')}</div><div class="lobby-bottom"><div class="opponent-picker"><label for="opponent">对手阵营</label><select id="opponent" data-field="opponent"><option value="random">随机同窗</option>${PRESETS.map(d => `<option value="${d.faction}" ${ui.opponent === d.faction ? 'selected' : ''}>${FACTIONS[d.faction].name}</option>`).join('')}</select><small>本地策略 AI · 标准难度 · 先后手随机</small></div><button class="button primary large" data-action="start-game">${playing() ? '开始新对局' : '进入对局'} <span>↗</span></button></div><div class="lobby-tip"><strong>出战小记</strong><p>${FACTIONS[selected.faction].description} 记得为部署后的移动和攻击留出精力。</p></div></main>`;
}
function hqMarkup(owner) {
  const p = game.players[owner], f = FACTIONS[p.faction], targetId = `hq:${owner}`, targetable = canTarget(targetId), hit = ui.lastEvents.some(e => e.target === targetId && ['attack', 'damage'].includes(e.kind));
  return `<button class="hq-card ${targetable ? 'valid-target' : ''} ${hit ? 'just-hit' : ''}" data-action="target" data-id="${targetId}" style="--faction:${f.color}" aria-label="${owner === 0 ? '己方' : '敌方'}基地，士气 ${p.hq}"><span class="hq-emblem">${f.icon}</span><strong>${owner === 0 ? '你的' : '同窗的'}${f.short}基地</strong><span class="hq-health">♥ <b>${Math.max(0, p.hq)}</b><small>/20</small></span><span class="hq-bar"><i style="width:${Math.max(0, p.hq) / 20 * 100}%"></i></span></button>`;
}
function unitMarkup(u) {
  const c = CARD_MAP[u.cardId], targetable = canTarget(u.id), selected = ui.selection?.kind === 'unit' && ui.selection.id === u.id;
  const actionable = available().some(a => a.unit === u.id), fresh = ui.lastEvents.some(e => ['deploy', 'move'].includes(e.kind) && e.unit === u.id), hit = ui.lastEvents.some(e => e.target === u.id && ['attack', 'damage'].includes(e.kind));
  return `<div class="unit-wrap" style="--faction:${factionColor(c.faction)}"><button class="unit-card ${u.owner === 1 ? 'enemy-unit' : ''} ${selected ? 'selected' : ''} ${targetable ? 'valid-target' : ''} ${actionable ? 'ready' : ''} ${fresh ? 'just-deployed' : ''} ${hit ? 'just-hit' : ''}" data-action="unit" data-id="${u.id}" aria-label="${attr(c.name)}，攻击 ${u.attack}，生命 ${u.health}，行动 ${u.opCost}"><span class="unit-art">${illustration(c.art, c.faction)}</span><span class="unit-op" title="行动费用">${u.opCost}</span><span class="unit-keywords">${u.keywords.map(k => `<i title="${attr(KEYWORDS[k].name)}">${k === 'guard' ? '▣' : k === 'blitz' ? 'ϟ' : '◌'}</i>`).join('')}</span><strong>${escape(c.name)}</strong><span class="unit-bottom"><span class="attack-stat">✦ ${u.attack}</span><small>${u.sick ? '准备中' : u.attacked || (u.moved && c.unitType !== 'tank') ? '已行动' : UNIT_TYPES[c.unitType]}</small><span class="health-stat ${u.health < u.maxHealth ? 'damaged' : ''}">♥ ${u.health}</span></span></button><button class="unit-info" data-action="inspect-unit" data-id="${u.id}" aria-label="查看${attr(c.name)}详情">i</button></div>`;
}
function emptySlot(row, owner, slot) {
  const action = selectedActions().find(a => row === 'front' ? a.type === 'move' && a.slot === slot : owner === 0 && a.type === 'play' && a.slot === slot);
  return `<button class="empty-slot ${action ? 'valid-slot' : ''}" data-action="slot" data-row="${row}" data-owner="${owner}" data-slot="${slot}" aria-label="${row === 'front' ? '前线' : owner === 0 ? '己方后场' : '敌方后场'}空位 ${slot + 1}"><span>${action ? '+' : '◇'}</span><small>${action ? row === 'front' ? '推进至此' : '部署至此' : row === 'front' ? '争夺前线' : '后场空位'}</small></button>`;
}
function boardCell(content, row, owner, slot) {
  const departed = ui.departed.filter(u => u.row === row && u.slot === slot && (row === 'front' || u.owner === owner));
  return `<div class="board-cell" data-row="${row}" data-owner="${owner}" data-slot="${slot}">${content}${departed.map(u => `<div class="departing-card" aria-hidden="true">${illustration(CARD_MAP[u.cardId].art, CARD_MAP[u.cardId].faction)}<span>${CARD_MAP[u.cardId].name} · 离场</span></div>`).join('')}</div>`;
}
function boardRow(owner) {
  return `<div class="board-row support-row">${game.players[owner].support.map((u, slot) => boardCell(slot === RULES.hqSlot ? hqMarkup(owner) : u ? unitMarkup(u) : emptySlot('support', owner, slot), 'support', owner, slot)).join('')}</div>`;
}
function opponentReveal() {
  const plays = revealedPlays(game.history).filter(e => CARD_MAP[e.cardId]?.name), latest = plays[0];
  if (!latest) return '<section class="opponent-reveal empty-reveal"><span class="eyebrow">对手出牌区</span><p>同窗使用的卡牌会展示在这里。</p></section>';
  const c = CARD_MAP[latest.cardId];
  return `<section class="opponent-reveal" aria-label="对手已使用的卡牌"><span class="eyebrow">同窗刚刚出牌 · 第 ${Math.ceil(latest.turn / 2)} 轮</span><div class="revealed-card">${cardMarkup(c)}</div><p>${escape(c.text)}</p><div class="reveal-history" aria-label="最近使用的卡牌">${plays.map(e => `<button data-action="inspect" data-id="${e.cardId}" title="${attr(CARD_MAP[e.cardId].name)}"><span>${CARD_MAP[e.cardId].cost}</span>${escape(CARD_MAP[e.cardId].name)}</button>`).join('')}</div></section>`;
}
function battle() {
  if (!game) return lobby();
  if (game.phase === 'mulligan') return mulligan();
  const p = game.players[0], enemy = game.players[1], actions = available(), owner = game.front.owner;
  return `<main class="battle-page"><div class="battle-top"><div><span class="eyebrow">CAMPUS DUEL</span><h1>未名湖畔的较量 <small>第 ${Math.ceil(game.turn / 2)} 轮</small></h1></div><div class="turn-indicator ${game.currentPlayer === 0 && game.phase !== 'finished' ? 'your-turn' : ''}"><i></i>${game.phase === 'finished' ? '对局结束' : game.currentPlayer === 0 ? '你的回合' : '同窗回合'}</div><button class="text-button" data-action="route" data-view="home">稍作休息 ↗</button></div><div class="match-layout"><div class="arena"><div class="player-strip enemy-strip"><span class="player-avatar" style="--faction:${factionColor(enemy.faction)}">${FACTIONS[enemy.faction].icon}</span><div><strong>燕园同窗 <small>${FACTIONS[enemy.faction].name}</small></strong><span>手牌 ${enemy.hand.length} · 牌库 ${enemy.deck.length}${enemy.fatigue ? ` · 疲劳 ${enemy.fatigue}` : ''}</span></div><div class="opponent-hand" aria-label="敌方 ${enemy.hand.length} 张手牌">${enemy.hand.slice(0, 9).map(() => '<i>燕</i>').join('')}</div><div class="energy-readout"><span>ϟ</span><strong>${enemy.energy}<small> / ${enemy.maxEnergy}</small></strong><label>精力</label></div></div><div class="row-caption"><span>同窗后场</span><i></i></div>${boardRow(1)}<div class="frontline-section ${owner === 0 ? 'owned' : owner === 1 ? 'enemy-owned' : ''}"><div class="frontline-caption"><span>— 共享前线 —</span><small>${owner === null ? '尚未占领 · 仅一方可驻守' : owner === 0 ? '由你控制' : '由同窗控制'}</small></div><div class="board-row frontline-row">${game.front.slots.map((u, slot) => boardCell(u ? unitMarkup(u) : emptySlot('front', owner, slot), 'front', owner, slot)).join('')}</div></div><div class="row-caption own-caption"><span>你的后场</span><i></i></div>${boardRow(0)}<div class="player-strip own-strip"><span class="player-avatar" style="--faction:${factionColor(p.faction)}">${FACTIONS[p.faction].icon}</span><div><strong>你 <small>${escape(p.deckName)}</small></strong><span>牌库 ${p.deck.length} · 弃牌 ${p.discard.length}${p.fatigue ? ` · 疲劳 ${p.fatigue}` : ''}</span></div><div class="energy-pips">${Array.from({ length: p.maxEnergy }, (_, i) => `<i class="${i < p.energy ? 'filled' : ''}"></i>`).join('')}</div><div class="energy-readout"><span>ϟ</span><strong>${p.energy}<small> / ${p.maxEnergy}</small></strong><label>精力</label></div></div><div class="hand-tray" aria-label="你的手牌">${p.hand.map(h => cardMarkup(CARD_MAP[h.cardId], { context: 'hand', hand: h, selected: ui.selection?.id === h.id, playable: actions.some(a => a.card === h.id) })).join('') || '<p class="empty-hand">手牌已空。善用场上的伙伴，下一回合会有新的机会。</p>'}</div></div><aside class="battle-sidebar"><div class="sidebar-heading"><span class="eyebrow">FIELD NOTES</span><h2>战局手记</h2></div><div class="hint-box"><small>${ui.selection ? '下一步' : '行动提示'}</small><p>${hint()}</p>${ui.selection ? '<button class="text-button" data-action="cancel">取消选择 ×</button>' : ''}</div><button class="button primary end-turn" data-action="end-turn" ${game.currentPlayer !== 0 || game.phase === 'finished' ? 'disabled' : ''}>${game.phase === 'finished' ? '对局已结束' : game.currentPlayer === 1 ? '同窗思考中…' : '结束回合 →'}</button>${opponentReveal()}<div class="history-heading">最近行动 <span>${game.history.length}</span></div><ol class="battle-history">${game.history.slice(-12).reverse().map(e => `<li class="history-${e.kind}"><span>${e.kind === 'turn' ? '◷' : e.kind === 'attack' ? '✦' : e.kind === 'deploy' ? '+' : '·'}</span>${escape(e.text)}</li>`).join('')}</ol><button class="text-button sidebar-help" data-action="guide-modal">规则速查 ↗</button>${game.phase === 'finished' ? '<button class="button" data-action="show-result">查看结算</button>' : ''}</aside></div><p class="battle-footnote">进度自动保存在当前浏览器 · 拖牌部署 · 拖动单位推进或攻击 · 右上角 i 查看卡牌 · Esc 取消选择</p></main>`;
}
function mulligan() {
  const me = game.players[0], waiting = game.currentPlayer !== 0;
  return `<main class="page mulligan-page"><span class="eyebrow">A GOOD BEGINNING</span><h1>把好，第一手。</h1><p>${game.firstPlayer === 0 ? '你是先手，起手 4 张牌。' : '你是后手，起手 5 张牌。'} 点击不想保留的牌替换一次。建议留下低费单位。</p><div class="mulligan-cards">${me.hand.map(h => cardMarkup(CARD_MAP[h.cardId], { context: 'mulligan', hand: h, replace: ui.replace.includes(h.id) })).join('')}</div><div class="mulligan-actions"><span>${waiting ? '同窗正在调整起手牌…' : `已选 ${ui.replace.length} 张替换 · 其余保留`}</span><button class="button primary large" data-action="confirm-mulligan" ${waiting ? 'disabled' : ''}>${waiting ? '准备中…' : ui.replace.length ? '换牌并开始 →' : '全部保留，开始 →'}</button></div><p class="quiet">所有替换牌在抽取新牌后洗回牌库，不会立即重抽。</p></main>`;
}
function filteredCards(builder = false) {
  const f = ui.filter;
  return CARDS.filter(c => (f.faction === 'all' || c.faction === f.faction) && (f.cost === 'all' || (f.cost === '6' ? c.cost >= 6 : c.cost === Number(f.cost))) && (f.type === 'all' || c.kind === f.type || c.unitType === f.type) && (f.keyword === 'all' || c.keywords.includes(f.keyword)) && (!f.query || `${c.name} ${c.text} ${c.flavor}`.includes(f.query.trim())) && (!builder || [ui.draft.faction, ui.draft.ally, 'neutral'].includes(c.faction)));
}
function filters(builder = false) {
  return `<div class="collection-toolbar"><div class="faction-tabs" role="group" aria-label="阵营筛选"><button data-action="filter-faction" data-id="all" class="${ui.filter.faction === 'all' ? 'active' : ''}">全部</button>${Object.entries(FACTIONS).filter(([id]) => !builder || [ui.draft.faction, ui.draft.ally, 'neutral'].includes(id)).map(([id, f]) => `<button data-action="filter-faction" data-id="${id}" class="${ui.filter.faction === id ? 'active' : ''}" style="--faction:${f.color}">${f.short}</button>`).join('')}</div><label class="search-label"><span>⌕</span><input id="card-search" type="search" placeholder="搜索卡名或效果" value="${attr(ui.filter.query)}" data-field="search" aria-label="搜索卡名或效果"></label></div><div class="filter-row"><label>费用 <select data-field="filter-cost" aria-label="费用筛选"><option value="all">全部费用</option>${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${ui.filter.cost === String(n) ? 'selected' : ''}>${n}${n === 6 ? '+' : ''} 费</option>`).join('')}</select></label><label>类型 <select data-field="filter-type" aria-label="类型筛选"><option value="all">全部类型</option><option value="event" ${ui.filter.type === 'event' ? 'selected' : ''}>事件</option>${Object.entries(UNIT_TYPES).map(([id, name]) => `<option value="${id}" ${ui.filter.type === id ? 'selected' : ''}>${name}</option>`).join('')}</select></label><label>关键词 <select data-field="filter-keyword" aria-label="关键词筛选"><option value="all">全部关键词</option>${Object.entries(KEYWORDS).map(([id, k]) => `<option value="${id}" ${ui.filter.keyword === id ? 'selected' : ''}>${k.name}</option>`).join('')}</select></label><span class="collection-count">${filteredCards(builder).length} 张${builder ? '可选' : '卡牌'} <small>/ 64 全部解锁</small></span></div>`;
}
function collection() {
  const cards = filteredCards();
  return `<main class="page collection-page"><div class="page-title split"><div><span class="eyebrow">THE YANYUAN COLLECTION</span><h1>每一张牌，都是燕园。</h1><p>64 张原创卡牌，已全部解锁。点开一张，读读它的故事。</p></div><span class="collection-seal">全卡<br>解锁</span></div>${filters()}<div class="card-grid">${cards.map(c => cardMarkup(c)).join('')}</div>${!cards.length ? '<div class="empty-state">没有找到符合条件的卡牌。<button class="text-button" data-action="reset-filters">重置筛选 →</button></div>' : ''}</main>`;
}
function decks() {
  return `<main class="page decks-page"><div class="page-title split"><div><span class="eyebrow">MAKE IT YOURS</span><h1>好主张，需要好搭配。</h1><p>39 张卡牌，一座基地。把你的想法，组成自己的流派。</p></div><button class="button primary" data-action="new-deck">＋ 创建套牌</button></div><h2 class="subheading">预组套牌 <small>四种风格，随时出战</small></h2><div class="deck-grid">${PRESETS.map(deckTile).join('')}</div><h2 class="subheading">我的套牌 <small>${customDecks.length} 套 · 保存在此浏览器</small></h2>${customDecks.length ? `<div class="deck-grid">${customDecks.map(deckTile).join('')}</div>` : '<div class="empty-state notebook-empty"><span>✎</span><h3>你的下一种可能，还在空白页里。</h3><p>从一套预组开始调整，或自由搭配主副阵营。</p><button class="text-button" data-action="new-deck">创建第一套牌 →</button></div>'}</main>`;
}
function deckTile(d) {
  const f = FACTIONS[d.faction];
  return `<article class="deck-tile" style="--faction:${f.color}"><div class="deck-tile-art">${illustration(f.art, d.faction)}<span>${f.icon}</span></div><div class="deck-tile-body"><small>${f.name}${d.ally ? ` ＋ ${FACTIONS[d.ally].short}` : ''}</small><h3>${escape(d.name)}</h3><p>${d.cards.length} 张卡牌 ＋ 1 基地 <span>${f.style}</span></p><div class="deck-tile-actions"><button class="text-button" data-action="edit-deck" data-id="${attr(d.id)}">${d.preset ? '复制并调整' : '编辑套牌'} ↗</button><button class="button small" data-action="choose-deck" data-id="${attr(d.id)}">出战 →</button>${!d.preset ? `<button class="delete-deck" data-action="delete-deck" data-id="${attr(d.id)}" aria-label="删除${attr(d.name)}" title="删除套牌">×</button>` : ''}</div></div></article>`;
}
function builder() {
  const d = ui.draft; if (!d) return decks();
  const errors = validateDeck(d), counts = {}, costCounts = Array(7).fill(0);
  d.cards.forEach(id => { counts[id] = (counts[id] || 0) + 1; costCounts[Math.min(6, CARD_MAP[id].cost)]++; });
  const ordered = Object.keys(counts).sort((a, b) => CARD_MAP[a].cost - CARD_MAP[b].cost || a.localeCompare(b));
  const maxCost = Math.max(1, ...costCounts);
  return `<main class="page builder-page"><div class="builder-heading"><button class="text-button" data-action="route" data-view="decks">← 我的套牌</button><span class="eyebrow">DECK WORKSHOP</span></div><div class="builder-layout"><section class="builder-collection"><h1>为每一张牌，找到同伴。</h1>${filters(true)}<div class="card-grid builder-grid">${filteredCards(true).map(c => `<div class="builder-card">${cardMarkup(c, { context: 'builder' })}<span class="copy-count ${counts[c.id] === 2 ? 'full' : ''}">${counts[c.id] || 0} / 2 <small>点击加入</small></span></div>`).join('')}</div>${!filteredCards(true).length ? '<div class="empty-state">没有符合条件的卡牌。<button class="text-button" data-action="reset-filters">重置筛选 →</button></div>' : ''}</section><aside class="deck-editor"><span class="eyebrow">YOUR DECK</span><label class="deck-name-label" for="deck-name">套牌名称</label><input id="deck-name" maxlength="40" value="${attr(d.name)}" data-field="deck-name" aria-label="套牌名称"><div class="faction-selectors"><label>主阵营<select data-field="deck-faction">${Object.entries(FACTIONS).filter(([id]) => id !== 'neutral').map(([id, f]) => `<option value="${id}" ${id === d.faction ? 'selected' : ''}>${f.name}</option>`).join('')}</select></label><label>副阵营<select data-field="deck-ally"><option value="">不使用副阵营</option>${Object.entries(FACTIONS).filter(([id]) => id !== 'neutral' && id !== d.faction).map(([id, f]) => `<option value="${id}" ${id === d.ally ? 'selected' : ''}>${f.name}</option>`).join('')}</select></label></div><div class="deck-total"><strong>${d.cards.length}<small> / 39</small></strong><span>＋ 1 座基地<br><small>副阵营 ${d.cards.filter(id => CARD_MAP[id].faction === d.ally).length} / 12</small></span></div><div class="mana-curve" aria-label="费用曲线">${costCounts.slice(1).map((n, i) => `<div><small>${n || ''}</small><i style="height:${4 + n / maxCost * 39}px"></i><span>${i + 1}${i === 5 ? '+' : ''}</span></div>`).join('')}</div><div class="deck-validation ${errors.length ? 'invalid' : 'valid'}">${errors.length ? errors.map(e => `<p>· ${escape(e)}</p>`).join('') : '✓ 套牌合法，可以出战'}</div><div class="deck-card-list">${ordered.map(id => { const c = CARD_MAP[id]; return `<div class="deck-list-row" style="--faction:${factionColor(c.faction)}"><span class="list-cost">${c.cost}</span><button class="list-card-name" data-action="inspect" data-id="${id}">${c.name}</button><span>×${counts[id]}</span><button class="remove-card" data-action="remove-card" data-id="${id}" aria-label="移除一张${c.name}">−</button></div>`; }).join('') || '<p class="quiet">从左侧点击卡牌加入套牌。</p>'}</div><div class="editor-buttons"><button class="button primary" data-action="save-deck" ${errors.length || !d.name.trim() ? 'disabled' : ''}>保存套牌 ✓</button><button class="text-button" data-action="clear-deck">清空</button></div></aside></div></main>`;
}
const guideSections = `<section><span class="guide-number">01</span><div><h2>守住基地，争夺前线。</h2><p>双方基地初始士气为 20。将对方士气降至 0 即获胜；同时归零为平局。每方后场可放 4 个单位，基地占据中央卡位。中央 5 格前线由一方独占，先清空敌方驻守才能推进。</p></div></section><section><span class="guide-number">02</span><div><h2>精力，花在真正需要的地方。</h2><p>每回合精力上限增加 1，最高 12，并恢复至上限。卡牌左上角是部署费用，单位的行动数字是每次移动或攻击的费用。普通单位每回合移动或攻击一次；突击可以先移动再攻击，两次分别付费。</p></div></section><section><span class="guide-number">03</span><div><h2>不同伙伴，不同打法。</h2><dl class="unit-guide"><dt>近战</dt><dd>占领前线后，才能攻击敌方后场与基地；可从己方后场攻击敌方前线。</dd><dt>突击</dt><dd>射程同近战，但可以先移动再攻击。</dd><dt>炮击</dt><dd>可远程攻击任何位置，攻击时不受反击，也可绕过守护。</dd><dt>拦截</dt><dd>可远程攻击，正常互相造成伤害；拦截同排敌方轰炸。</dd><dt>轰炸</dt><dd>远程攻击并绕过守护，只有拦截能反击它；自己被攻击时不反击。目标排若有拦截，须先攻击拦截。</dd></dl></div></section><section><span class="guide-number">04</span><div><h2>三个关键词，让站位有意义。</h2><p><strong>速攻</strong>：登场回合即可行动。<strong>守护</strong>：保护本排左右相邻卡位，包括基地，炮击、轰炸和事件可以绕过。<strong>隐蔽</strong>：首次移动或攻击前不能被敌方单位攻击，事件可直接影响。单位通常不能从前线自行退回后场。</p></div></section><section><span class="guide-number">05</span><div><h2>39 张卡，组成你的主张。</h2><p>选择一个主阵营，可搭配一个副阵营。套牌包含 39 张可抽取牌和自动配置的 1 座基地。同名牌最多 2 张，副阵营最多 12 张，中立卡通用。所有 64 张卡牌已解锁，无需收集。</p></div></section><section><span class="guide-number">06</span><div><h2>起手与疲劳，也在计划之中。</h2><p>先手起手 4 张，后手 5 张，各可换牌一次。每次己方回合开始抽 1 张，手牌上限 9，溢出牌弃置。空牌库抽牌时，基地依次受到 1、2、3… 点疲劳伤害。治疗最多恢复到生命上限，召唤只使用己方后场空位，位置不足的部分不生效。</p></div></section>`;
function guide() { return `<main class="page guide-page"><div class="page-title split"><div><span class="eyebrow">A LITTLE FIELD GUIDE</span><h1>落第一张牌之前。</h1><p>三次操作学会出牌、推进与攻击，然后带着自己的想法出发。</p></div><button class="button primary" data-action="tutorial">互动教学 →</button></div><div class="guide-content">${guideSections}</div><div class="guide-callout"><h2>最好的战术，从一场对局开始。</h2><button class="button primary" data-action="route" data-view="lobby">选择套牌 →</button></div></main>`; }
function startTutorial() {
  let t = createGame({ playerDeck: PRESETS[1], aiDeck: PRESETS[0], seed: 73, firstPlayer: 0 });
  t = applyAction(t, { type: 'mulligan', player: 0, cards: [] }).state;
  t = applyAction(t, { type: 'mulligan', player: 1, cards: [] }).state;
  t.players[0].maxEnergy = 5; t.players[0].energy = 5;
  t.players[0].hand = [{ id: 'tutorial-card', cardId: 'e-robot' }];
  ui.tutorial = t; ui.tutorialStep = 0; ui.modal = { type: 'tutorial' }; render();
}
function tutorialMarkup() {
  const t = ui.tutorial, step = ui.tutorialStep, u = allUnits(t, 0)[0];
  const titles = ['先把伙伴请到场上。', '把优势，推向前线。', '找到目标，打出这一手。', '很好，你已经会出牌了。'];
  const texts = ['花 3 点精力，部署一张机器人小队。它有速攻，可以立即行动。', '再花 1 点精力，将小队推进共享前线。突击推进后仍可攻击。', '最后花 1 点精力，攻击对方基地，造成 3 点士气伤害。', '从 5 点精力到一轮完整行动，你刚完成了一次部署、推进与攻击。现在试试真正的对局。'];
  return `<div class="tutorial-modal"><span class="eyebrow">LEARN BY PLAYING · ${Math.min(step + 1, 3)} / 3</span><h2>${titles[step]}</h2><p>${texts[step]}</p><div class="tutorial-field"><div class="tutorial-hq">同窗基地 <strong>♥ ${t.players[1].hq}</strong></div><div class="tutorial-line"><small>共享前线</small>${u?.row === 'front' ? `<div class="tutorial-piece">${illustration('robot', 'engineering')}<b>机器人小队 · 3 / 2</b></div>` : '<span>◇ 等待伙伴推进</span>'}</div><div class="tutorial-line"><small>己方后场</small>${u?.row === 'support' ? `<div class="tutorial-piece">${illustration('robot', 'engineering')}<b>机器人小队 · 3 / 2</b></div>` : '<span>◇ 后场空位</span>'}</div><div class="tutorial-energy">ϟ 精力 <strong>${t.players[0].energy} / 5</strong></div></div><div class="tutorial-steps">${[0, 1, 2].map(i => `<span class="${step >= i ? 'active' : ''}">${step > i ? '✓' : i + 1} ${['部署', '推进', '攻击'][i]}</span>`).join('')}</div><button class="button primary large" data-action="tutorial-next">${['① 部署到后场', '② 推进到前线', '③ 攻击对方基地', '选择套牌，去实战 ↗'][step]}</button></div>`;
}
function modal() {
  const m = ui.modal; if (!m) return '';
  let content = '', klass = '';
  if (m.type === 'card') {
    const c = CARD_MAP[m.id], u = m.unit && findUnit(game, m.unit);
    if (!c) return '';
    klass = 'card-detail-dialog';
    content = `<div class="detail-card-display">${cardMarkup(c, { context: 'hero' })}</div><div class="detail-copy"><span class="eyebrow">${FACTIONS[c.faction].name} / ${c.kind === 'unit' ? UNIT_TYPES[c.unitType] : '事件'}</span><h2>${c.name}</h2>${c.signature ? `<div class="signature-detail">专属能力 · ${escape(c.signature)}</div>` : ''}<p class="detail-rule">${c.text}</p>${u ? `<p class="current-stats">场上数值：攻击 ${u.attack} · 生命 ${u.health}/${u.maxHealth} · 行动 ${u.opCost}${u.sick ? ' · 本回合准备中' : ''}</p>` : ''}<div class="detail-keywords">${[...new Set([...(u?.keywords || c.keywords), ...(c.kind === 'unit' ? [c.unitType] : [])])].map(k => KEYWORDS[k] ? `<p><strong>${KEYWORDS[k].name}</strong>${KEYWORDS[k].text}</p>` : `<p><strong>${UNIT_TYPES[k]}</strong>${k === 'tank' ? '每回合可以先移动再攻击，分别支付行动费用。' : k === 'artillery' ? '可远程攻击，绕过守护，攻击时不受反击。' : k === 'fighter' ? '可远程攻击，正常反击，并拦截同排轰炸。' : k === 'bomber' ? '远程攻击并绕过守护，受拦截拦截，被攻击时不反击。' : '占领前线，才能攻击敌方后场或基地。'}</p>`).join('')}</div><blockquote>${c.flavor}</blockquote><span class="card-catalog-id">燕园卡牌手记 / ${c.id.toUpperCase()}</span></div>`;
  } else if (m.type === 'settings') {
    content = `<span class="eyebrow">MAKE YOURSELF AT HOME</span><h2>对局设置</h2><label class="settings-row">减少动态效果<input type="checkbox" data-field="reduced-motion" ${settings.reducedMotion ? 'checked' : ''}></label><label class="settings-row">同窗思考节奏<select data-field="ai-speed"><option value="250" ${settings.aiSpeed === 250 ? 'selected' : ''}>快速</option><option value="650" ${settings.aiSpeed === 650 ? 'selected' : ''}>标准</option><option value="1000" ${settings.aiSpeed === 1000 ? 'selected' : ''}>从容</option></select></label><p class="quiet">套牌、战绩和对局进度保存在当前浏览器。清除站点数据会清除这些记录。</p><button class="button primary" data-action="close-modal">完成 ✓</button>`;
  } else if (m.type === 'result') {
    const win = game.winner === 0, draw = game.winner === 'draw';
    content = `<div class="result-modal"><span class="result-seal">${draw ? '和' : win ? '胜' : '续'}</span><span class="eyebrow">ANOTHER PAGE IN YANYUAN</span><h2>${draw ? '棋逢对手，未分高下。' : win ? '这一手，打得漂亮。' : '下一个好主张，在路上。'}</h2><p>${draw ? '双方基地同时归零，本局平局。' : win ? '你的校园伙伴赢下了这场交锋。' : '同窗赢得了这次切磋，调整套牌，再试一次。'}</p><div class="result-score"><span>你的士气 <b>${Math.max(0, game.players[0].hq)}</b></span><i>:</i><span>同窗士气 <b>${Math.max(0, game.players[1].hq)}</b></span></div><p class="quiet">第 ${Math.ceil(game.turn / 2)} 轮结束 · 累计 ${stats.wins} 胜 ${stats.losses} 负 ${stats.draws} 平</p><div class="result-actions"><button class="button primary" data-action="new-battle">再来一局 ↗</button><button class="button" data-action="result-decks">调整套牌</button></div></div>`;
  } else if (m.type === 'tutorial') content = tutorialMarkup();
  else if (m.type === 'guide') { klass = 'guide-dialog'; content = `<span class="eyebrow">QUICK REFERENCE</span><h2>对战规则速查</h2><div class="guide-content">${guideSections}</div>`; }
  else if (m.type === 'delete') { content = `<h2>删除这套自定义套牌？</h2><p>预组和其他套牌不受影响。此操作不能撤销。</p><div class="result-actions"><button class="button primary" data-action="confirm-delete" data-id="${attr(m.id)}">删除套牌</button><button class="button" data-action="close-modal">保留</button></div>`; }
  return `<div class="modal-backdrop" data-action="backdrop"><section class="modal ${klass}" role="dialog" aria-modal="true" aria-label="${m.type === 'card' ? '卡牌详情' : m.type === 'tutorial' ? '互动教学' : '燕园争锋对话框'}"><button class="modal-close icon-button" data-action="close-modal" aria-label="关闭">×</button>${content}</section></div>`;
}
function captureAnchors(before, after, action) {
  const point = element => { const r = element?.getBoundingClientRect?.(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height } : null; };
  const cell = u => point(app.querySelector(`.board-cell[data-row="${u.row}"][data-slot="${u.slot}"]${u.row === 'support' ? `[data-owner="${u.owner}"]` : ''}`));
  const points = {};
  for (const u of [...allUnits(before), ...allUnits(after)]) points[u.id] = cell(u);
  for (const owner of [0, 1]) points[`hq:${owner}`] = point(app.querySelector(`[data-action="target"][data-id="hq:${owner}"]`));
  const hand = action.card && action.player === 0 ? point(app.querySelector(`[data-action="hand"][data-id="${action.card}"]`)) : null;
  return { points, source: action.unit ? cell(findUnit(before, action.unit)) : hand, movementTarget: action.type === 'move' ? cell({ row: 'front', slot: action.slot }) : null };
}
function cinemaMarkup() {
  const s = ui.cinema; if (!s) return '';
  const width = window.innerWidth || 1280, height = window.innerHeight || 800;
  const start = s.anchors.source || { x: width - 180, y: height <= 820 ? 238 : 316 };
  const destinations = s.kind === 'move' ? [s.anchors.movementTarget] : s.targets.map(id => s.anchors.points[id]);
  const points = destinations.filter(Boolean);
  const aiming = s.phase !== 'reveal';
  const paths = aiming && start ? points.map(p => `<path class="cinema-arrow" d="M${start.x} ${start.y} L${p.x} ${p.y}" marker-end="url(#cinema-arrowhead)"/>`).join('') : '';
  const markers = aiming ? points.map(p => { const w = p.width || 110, h = p.height || 95; return `<rect class="cinema-reticle" x="${p.x - w / 2 + 2}" y="${p.y - h / 2 + 2}" width="${w - 4}" height="${h - 4}" rx="3"/>`; }).join('') : '';
  const impactStacks = {};
  const floats = s.phase === 'impact' ? s.impacts.map(e => {
    const p = s.anchors.points[e.target || e.unit]; if (!p) return '';
    const id = e.target || e.unit, stack = impactStacks[id] || 0; impactStacks[id] = stack + 1;
    const text = e.kind === 'damage' ? `−${e.amount}` : e.kind === 'heal' ? `+${e.amount}` : e.kind === 'death' ? '离场' : e.kind === 'deploy' ? '登场' : e.effectType === 'ready' ? '再行动' : e.effectType === 'discount' ? `行动 −${e.amount}` : e.attack || e.health ? `+${e.attack}/+${e.health}` : '强化';
    return `<span class="cinema-number number-${e.kind}" style="left:${p.x}px;top:${p.y - 23 - stack * 34}px;--i:${stack}">${text}</span>`;
  }).join('') : '';
  return `<div class="duel-cinema cinema-${s.phase} cinema-${s.owner === 1 ? 'enemy' : 'self'} ${s.kind === 'play' ? 'cinema-play' : ''}" data-playback="true" role="status" aria-live="polite"><div class="cinema-heading"><small>${escape(s.title)}</small><strong>${escape(CARD_MAP[s.cardId]?.name || '')}</strong><p>${escape(s.subtitle)}</p></div>${s.kind === 'play' && s.owner === 1 ? `<div class="cinema-card">${cardMarkup(CARD_MAP[s.cardId], { context: 'hero' })}</div>` : ''}<svg class="cinema-lines" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><defs><marker id="cinema-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 10 5 0 10Z" fill="#95734d"/></marker></defs>${paths}${markers}</svg>${floats}<div class="cinema-target-label">${s.phase === 'reveal' ? '卡牌展示' : s.phase === 'aim' ? '锁定目标' : '效果结算'} · ${escape(s.targetText)}</div><button class="button cinema-skip" data-action="skip-cinema">跳过 ›</button></div>`;
}
function render() {
  if (drag?.active) return;
  const active = document.activeElement, focusId = active?.id, selectionStart = active?.selectionStart, selectionEnd = active?.selectionEnd;
  document.body.classList.toggle('reduced-motion', settings.reducedMotion);
  document.body.classList.toggle('cinema-active', !!ui.cinema);
  const views = { home, lobby, battle, collection, decks, builder, guide };
  app.innerHTML = `${header()}${(views[ui.view] || home)()}${ui.view === 'battle' ? '' : footer()}<div class="portrait-hint">↻ 横过手机，给这场交锋更多空间。</div>${ui.toast ? `<div class="toast" role="status">${escape(ui.toast)}<button data-action="dismiss-toast" aria-label="关闭提示">×</button></div>` : ''}${modal()}${cinemaMarkup()}`;
  if (focusId) {
    const next = document.getElementById(focusId);
    if (next) { next.focus({ preventScroll: true }); if (typeof selectionStart === 'number' && next.type !== 'number') try { next.setSelectionRange(selectionStart, selectionEnd); } catch {} }
  }
  for (const element of document.querySelectorAll('.hand-tray .game-card, .unit-card.ready')) element.draggable = false;
  scheduleAi();
}
function resetFilters() { ui.filter = { faction: 'all', cost: 'all', type: 'all', keyword: 'all', query: '' }; }
function route(view) {
  ui.modal = null; ui.selection = null; ui.lastEvents = []; ui.departed = [];
  if (view === 'battle' && !game) view = 'lobby';
  ui.view = view; render(); window.scrollTo({ top: 0, behavior: 'instant' });
}
function clickTarget(id) {
  const action = selectedActions().find(a => a.target === id);
  if (action && canTarget(id)) { runAction(action); return true; }
  return false;
}
app.addEventListener('click', event => {
  if (Date.now() < suppressClickUntil) return;
  const el = event.target.closest('[data-action]'); if (!el) return;
  const { action, id } = el.dataset;
  if (action === 'skip-cinema') { activePlayback?.finish(); return; }
  if (ui.cinema) return;
  if (action === 'backdrop' && event.target !== el) return;
  if (action === 'route') return route(el.dataset.view);
  if (action === 'choose-deck' || action === 'pick-deck') { ui.pickDeck = id; if (action === 'choose-deck') ui.view = 'lobby'; render(); return; }
  if (action === 'start-game') {
    const deck = deckList().find(d => d.id === ui.pickDeck) || PRESETS[0];
    const seed = Date.now() >>> 0, opponent = ui.opponent === 'random' ? PRESETS[Math.floor(Math.random() * PRESETS.length)] : PRESETS.find(d => d.faction === ui.opponent);
    game = createGame({ playerDeck: deck, aiDeck: opponent, seed }); ui.aiActions = 0; ui.replace = []; ui.view = 'battle'; ui.modal = null; ui.selection = null; saveMatch(); render(); window.scrollTo(0, 0); return;
  }
  if (action === 'inspect' || action === 'inspect-unit') { const u = action === 'inspect-unit' && findUnit(game, id); ui.modal = { type: 'card', id: u ? u.cardId : id, unit: u?.id }; render(); return; }
  if (action === 'settings') { ui.modal = { type: 'settings' }; render(); return; }
  if (action === 'guide-modal') { ui.modal = { type: 'guide' }; render(); return; }
  if (action === 'close-modal' || action === 'backdrop') { ui.modal = null; render(); return; }
  if (action === 'dismiss-toast') { ui.toast = ''; render(); return; }
  if (action === 'tutorial') { startTutorial(); return; }
  if (action === 'tutorial-next') {
    if (ui.tutorialStep >= 3) { ui.modal = null; route('lobby'); return; }
    const actions = getLegalActions(ui.tutorial), type = ['play', 'move', 'attack'][ui.tutorialStep];
    const a = actions.find(a => a.type === type && (type !== 'play' || a.slot === 1) && (type !== 'move' || a.slot === 2) && (type !== 'attack' || a.target === 'hq:1'));
    if (a) { ui.tutorial = applyAction(ui.tutorial, a).state; ui.tutorialStep++; render(); }
    return;
  }
  if (action === 'reset-filters') { resetFilters(); render(); return; }
  if (action === 'filter-faction') { ui.filter.faction = id; render(); return; }
  if (action === 'new-deck' || action === 'edit-deck') {
    const original = action === 'edit-deck' ? deckList().find(d => d.id === id) : null;
    ui.draft = original ? { ...structuredClone(original), id: original.preset ? `custom-${Date.now()}` : original.id, name: original.preset ? original.name + ' · 我的搭配' : original.name, preset: false } : { id: `custom-${Date.now()}`, name: '我的燕园手记', faction: 'science', ally: null, cards: [], preset: false };
    resetFilters(); route('builder'); return;
  }
  if (action === 'add-card') {
    if (!ui.draft) return;
    if (ui.draft.cards.filter(c => c === id).length >= 2) return toast('同名卡牌最多加入 2 张。');
    if (ui.draft.cards.length >= 39) return toast('套牌已满 39 张，请先移除其他卡牌。');
    ui.draft.cards.push(id); render(); return;
  }
  if (action === 'remove-card') { const index = ui.draft.cards.indexOf(id); if (index >= 0) ui.draft.cards.splice(index, 1); render(); return; }
  if (action === 'clear-deck') { ui.draft.cards = []; render(); return; }
  if (action === 'save-deck') {
    const errors = validateDeck(ui.draft); if (errors.length || !ui.draft.name.trim()) return toast(errors[0] || '请输入套牌名称。');
    const saved = { ...structuredClone(ui.draft), name: ui.draft.name.trim() };
    customDecks = [...customDecks.filter(d => d.id !== saved.id), saved]; store.saveDecks(customDecks); ui.pickDeck = saved.id; route('decks'); toast('套牌已保存，带上你的新主张出战吧。'); return;
  }
  if (action === 'delete-deck') { ui.modal = { type: 'delete', id }; render(); return; }
  if (action === 'confirm-delete') { customDecks = customDecks.filter(d => d.id !== id); store.saveDecks(customDecks); ui.modal = null; render(); return; }
  if (action === 'new-battle') { ui.modal = null; route('lobby'); return; }
  if (action === 'result-decks') { ui.modal = null; route('decks'); return; }
  if (action === 'show-result') { ui.modal = { type: 'result' }; render(); return; }
  if (action === 'cancel') { ui.selection = null; render(); return; }
  if (!game || game.currentPlayer !== 0 || game.phase === 'finished') return;
  if (action === 'replace' && game.phase === 'mulligan') { ui.replace = ui.replace.includes(id) ? ui.replace.filter(x => x !== id) : [...ui.replace, id]; render(); return; }
  if (action === 'confirm-mulligan') { runAction({ type: 'mulligan', player: 0, cards: ui.replace }); return; }
  if (action === 'end-turn') { ui.aiActions = 0; runAction({ type: 'endTurn', player: 0 }); return; }
  if (action === 'hand') {
    const h = game.players[0].hand.find(h => h.id === id); if (!h) return;
    const c = CARD_MAP[h.cardId], actions = available().filter(a => a.card === id);
    if (!actions.length) return toast(cardReason(c));
    if (c.kind === 'event' && !actions[0].target) { runAction(actions[0]); return; }
    ui.selection = ui.selection?.id === id ? null : { kind: 'hand', id }; render(); return;
  }
  if (action === 'unit' || action === 'target') {
    if (clickTarget(id)) return;
    const u = action === 'unit' && findUnit(game, id);
    if (u?.owner === 0) {
      if (!available().some(a => a.unit === id)) return toast(u.sick ? '这位伙伴正在准备。下个己方回合才可行动，速攻例外。' : u.opCost > game.players[0].energy ? `行动需要 ${u.opCost} 点精力。` : '这位伙伴已行动，或暂时没有合法移动位置与攻击目标。');
      ui.selection = ui.selection?.id === id ? null : { kind: 'unit', id }; render();
    } else if (u) { ui.modal = { type: 'card', id: u.cardId, unit: u.id }; render(); }
    return;
  }
  if (action === 'slot') {
    const slot = Number(el.dataset.slot), row = el.dataset.row;
    const actions = selectedActions().filter(a => a.slot === slot && (row === 'front' ? a.type === 'move' : a.type === 'play' && el.dataset.owner === '0'));
    if (!actions.length) return;
    if (actions[0].target) { ui.selection.slot = slot; render(); }
    else runAction(actions[0]);
  }
});
app.addEventListener('input', event => {
  const { field } = event.target.dataset;
  if (field === 'search') { ui.filter.query = event.target.value; render(); }
  if (field === 'deck-name' && ui.draft) { ui.draft.name = event.target.value; const save = app.querySelector('[data-action="save-deck"]'); if (save) save.disabled = !!validateDeck(ui.draft).length || !ui.draft.name.trim(); }
});
app.addEventListener('change', event => {
  const { field } = event.target.dataset, value = event.target.value;
  if (field === 'opponent') ui.opponent = value;
  if (field?.startsWith('filter-')) ui.filter[field.slice(7)] = value;
  if (field === 'deck-faction') { ui.draft.faction = value; if (ui.draft.ally === value) ui.draft.ally = null; resetFilters(); }
  if (field === 'deck-ally') { ui.draft.ally = value || null; resetFilters(); }
  if (field === 'reduced-motion') { settings.reducedMotion = event.target.checked; store.saveSettings(settings); }
  if (field === 'ai-speed') { settings.aiSpeed = Number(value); store.saveSettings(settings); }
  render();
});
function dropZone(element) {
  const target = element?.closest('[data-action="unit"], [data-action="target"]');
  if (target) return { target: target.dataset.id };
  const slot = element?.closest('[data-action="slot"]');
  if (slot) return { row: slot.dataset.row, owner: Number(slot.dataset.owner), slot: Number(slot.dataset.slot) };
  return { arena: !!element?.closest('.arena') };
}
function clearDrag() {
  if (!drag) return;
  drag.ghost?.remove(); drag.line?.remove(); drag.source.classList?.remove('drag-source');
  if (app.hasPointerCapture?.(drag.pointerId)) app.releasePointerCapture(drag.pointerId);
  document.body.classList.remove('is-dragging'); drag = null;
}
app.addEventListener('dragstart', event => event.preventDefault());
app.addEventListener('pointerdown', event => {
  if (ui.cinema) return;
  if (event.button !== 0 || game?.currentPlayer !== 0 || game.phase !== 'battle' || ui.modal || event.target.closest('.card-info, .unit-info')) return;
  const source = event.target.closest('[data-action="hand"], .unit-card.ready');
  if (!source) return;
  const selection = { kind: source.dataset.action === 'hand' ? 'hand' : 'unit', id: source.dataset.id };
  if (!available().some(a => selection.kind === 'hand' ? a.card === selection.id : a.unit === selection.id)) return;
  drag = { source, selection, x: event.clientX, y: event.clientY, pointerId: event.pointerId, active: false };
});
app.addEventListener('pointermove', event => {
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7) return;
  event.preventDefault();
  if (!drag.active) {
    drag.active = true; ui.selection = drag.selection; app.setPointerCapture(event.pointerId);
    const rect = drag.source.getBoundingClientRect();
    drag.ghost = drag.source.cloneNode(true); drag.ghost.classList.add('drag-ghost'); drag.ghost.setAttribute('aria-hidden', 'true'); drag.ghost.inert = true;
    drag.ghost.style.width = `${Math.max(110, rect.width)}px`; document.body.append(drag.ghost);
    drag.line = document.createElement('div'); drag.line.className = 'drag-line'; document.body.append(drag.line);
    drag.source.classList.add('drag-source'); document.body.classList.add('is-dragging');
    for (const el of app.querySelectorAll('[data-action="unit"], [data-action="target"], [data-action="slot"], .arena')) {
      if (resolveDrop(available(), drag.selection, dropZone(el))) el.classList.add(el.dataset.action === 'slot' ? 'valid-slot' : 'valid-target');
    }
  }
  drag.ghost.style.left = `${event.clientX + 17}px`; drag.ghost.style.top = `${event.clientY - 45}px`;
  const hit = document.elementFromPoint(event.clientX, event.clientY), valid = resolveDrop(available(), drag.selection, dropZone(hit));
  drag.ghost.classList.toggle('drop-allowed', !!valid);
  const color = valid ? '#d5aa50' : '#b9543c', x = event.clientX, y = event.clientY;
  drag.line.innerHTML = `<svg width="100%" height="100%"><defs><marker id="drag-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="${color}"/></marker></defs><path d="M${drag.x} ${drag.y} Q${drag.x} ${y} ${x} ${y}" fill="none" stroke="${color}" stroke-width="4" stroke-dasharray="9 5" marker-end="url(#drag-arrow)"/></svg><span class="drag-caption">${valid ? valid.pendingSlot !== undefined ? '松开后选择技能目标' : '松开执行' : '拖至高亮位置 · Esc 取消'}</span>`;
});
app.addEventListener('pointerup', event => {
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (!drag.active) { drag = null; return; }
  const selection = drag.selection, action = resolveDrop(available(), selection, dropZone(document.elementFromPoint(event.clientX, event.clientY)));
  clearDrag(); suppressClickUntil = Date.now() + 350;
  if (action?.pendingSlot !== undefined) { ui.selection = { ...selection, slot: action.pendingSlot }; render(); }
  else if (action) runAction(action);
  else { ui.selection = null; render(); }
});
app.addEventListener('pointercancel', () => { clearDrag(); ui.selection = null; render(); });
document.addEventListener('keydown', event => {
  if (ui.cinema) { if (event.key === 'Escape' || event.key === ' ') activePlayback?.finish(); return; }
  if (event.key === 'Escape') { if (drag?.active) suppressClickUntil = Date.now() + 350; clearDrag(); ui.modal = null; ui.selection = null; render(); }
  if (event.key === 'Tab' && ui.modal) {
    const focusable = [...document.querySelectorAll('.modal button, .modal select, .modal input')].filter(e => !e.disabled), first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && (!document.querySelector('.modal').contains(document.activeElement) || document.activeElement === first)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (!document.querySelector('.modal').contains(document.activeElement) || document.activeElement === last)) { event.preventDefault(); first?.focus(); }
  }
});
window.addEventListener?.('resize', () => activePlayback?.finish());
render();
