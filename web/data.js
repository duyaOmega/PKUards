export const RULES = Object.freeze({ version: 3, deckSize: 39, copies: 2, allyLimit: 12, hqHealth: 20, maxEnergy: 12, handLimit: 9, frontSlots: 5, hqSlot: 2 });
export const FACTIONS = {
  science: { name: '理学探索', short: '理学', color: '#466e68', motto: '向未知，再进一步。', style: "研究 · 成长", description: "以研究指令补充手牌，让证明研讨班在每回合首次指令后成长。", strengths: "资源积累、条件收益、持续成长", weakness: "学科卡缺乏治疗与高效群体清场", base: '理学研究基地', deckName: '穷理尽微', icon: '∑', art: 'print-math' },
  engineering: { name: '工学智造', short: '工学', color: '#a3763c', motto: '想法落地，即刻出发。', style: "机动 · 调度", description: "降低共享单位的行动费用，用速攻与再次行动把精力转成推进和爆发。", strengths: "行动效率、部署节奏、定点维修", weakness: "抽牌有限，学科卡缺乏直接伤害", base: '智造协作基地', deckName: '即刻上线', icon: '⚙', art: 'print-coder' },
  humanities: { name: '人文思辨', short: '人文', color: '#9b4748', motto: '以思想，回应时代。', style: "守护 · 传承", description: "用守护、修复和读书伙伴维持阵地，再通过有限的群体强化赢下对局。", strengths: "守护站位、恢复、群体维持", weakness: "学科卡缺乏直接伤害和群体清场", base: '博雅共学基地', deckName: '弦歌不辍', icon: '文', art: 'print-reader' },
  society: { name: '社科纵横', short: '社科', color: '#626581', motto: '于众声之中，找到答案。', style: "质询 · 节奏", description: "削弱敌方攻击后精准追问，以指令接力和少量直伤掌握节奏。", strengths: "削攻干预、条件解场、指令接力", weakness: "学科卡缺乏治疗，专属单位身材偏小", base: '社会观察基地', deckName: '纵横有方', icon: '衡', art: 'print-field' },
  neutral: { name: '燕园日常', short: '中立', color: '#747565', motto: '一塔湖图，皆是日常。', style: '通用 · 协作', description: '来自燕园各个角落的伙伴与日常，为所有阵营提供支援。', icon: '燕', art: 'tower' }
};
export const UNIT_TYPES = { infantry: '近战', tank: '突击', artillery: '炮击', fighter: '拦截', bomber: '轰炸' };
export const KEYWORDS = { blitz: { name: '速攻', text: '登场回合即可行动，移动与攻击仍须支付行动费用。' }, guard: { name: '守护', text: '保护同排左右相邻卡位，包括基地。炮击、轰炸及事件可绕过守护。' }, smoke: { name: '隐蔽', text: '首次移动或攻击前，无法被敌方单位选作攻击目标。事件仍可影响它。' } };
const draw = n => ({ type: 'draw', amount: n });
const damage = (n, target) => ({ type: 'damage', amount: n, target });
const heal = (n, target) => ({ type: 'heal', amount: n, target });
const buff = (attack, health, target = 'friendlyUnit', keywords = []) => ({ type: 'buff', attack, health, target, keywords });
const summon = (cardId, count = 1) => ({ type: 'summon', cardId, count });
const unit = (id, name, faction, cost, opCost, attack, health, unitType, art, text, flavor, extra = {}) => ({ id, name, faction, kind: 'unit', cost, opCost, attack, health, unitType, art, text, flavor, keywords: [], ...extra });
const event = (id, name, faction, cost, art, text, flavor, effects) => ({ id, name, faction, kind: 'event', cost, art, text, flavor, keywords: [], effects });

export const CARDS = [
  // Science: research, conditional card advantage and one-order-per-turn growth.
  event('s-fresh', '提出猜想', 'science', 1, 'print-math', '抽 1 张牌；若控制前线，再抽 1 张。', '先提出一个值得验证的问题。', [draw(1), { ...draw(1), conditionFrontline: true }]),
  event('s-tutor', '校准方法', 'science', 2, 'notes', '一个友方单位生命 +2，抽 1 张牌。', '方法站稳了，结论才站得住。', [buff(0, 2), draw(1)]),
  unit('s-lab', '基础实验组', 'science', 2, 1, 1, 3, 'infantry', 'lab', '离场：抽 1 张牌。', '每一次失败，都留下有用的数据。', { signature: '实验笔记', onDeath: [draw(1)] }),
  event('s-contest', '排除反例', 'science', 2, 'math', '对一个敌方单位造成 2 点伤害，抽 1 张牌。', '经得住反例，才能更接近答案。', [damage(2, 'enemyUnit'), draw(1)]),
  event('s-stars', '观测窗口', 'science', 3, 'stars', '抽 2 张牌；若控制前线，所有友方单位生命 +1。', '好位置，也是一份研究资源。', [draw(2), { ...buff(0, 1, 'allFriendlyUnits'), conditionFrontline: true }]),
  unit('s-proof', '证明研讨班', 'science', 4, 1, 2, 4, 'infantry', 'math', '你使用指令后，自身 +1/+1（每个己方回合限一次）。', '让每一次推演，都成为下一步的依据。', { signature: '数学归纳', onOrder: [buff(1, 1, 'self')] }),
  event('s-forum', '成果交流', 'science', 4, 'stage', '所有友方单位生命 +1，抽 2 张牌。', '把一个人的发现，变成所有人的起点。', [buff(0, 1, 'allFriendlyUnits'), draw(2)]),
  unit('s-institute', '未名研究所', 'science', 6, 2, 3, 6, 'fighter', 'lab', '登场：抽 1 张牌；若控制前线，再抽 1 张。', '站在前人的工作上，继续向未知追问。', { signature: '前沿突破', onDeploy: [draw(1), { ...draw(1), conditionFrontline: true }] }),
  event('s-night', '通宵推导', 'science', 1, 'clock', '抽 2 张牌，己方基地受到 2 点伤害。', '多一点思路，也要付出一点代价。', [draw(2), damage(2, 'selfHq')]),
  event('s-repeat', '重复实验', 'science', 2, 'lab', '一个友方单位 +1/+1，抽 1 张牌。', '再做一次。这次，我们知道为什么。', [buff(1, 1), draw(1)]),
  event('s-insight', '灵光一现', 'science', 3, 'stars', '对一个敌方单位造成 3 点伤害；另有至少 5 张手牌时，额外造成 2 点。', '储备足够丰富，线索才会连成答案。', [damage(3, 'enemyUnit'), { ...damage(2, 'enemyUnit'), handAtLeast: 5 }]),
  event('s-theory', '统一理论', 'science', 6, 'math', '所有友方单位 +1/+2，抽 2 张牌。', '散落的线索，终于指向同一个解释。', [buff(1, 2, 'allFriendlyUnits'), draw(2)]),

  // Engineering: small mobile bodies, operation efficiency and repeat actions.
  unit('e-night', '机房夜行人', 'engineering', 1, 0, 1, 1, 'infantry', 'print-coder', '速攻。行动费为 0。你使用指令后，自身重新行动（每个己方回合限一次）。', '灯还亮着，就再向前走一步。', { signature: '夜行迭代', keywords: ['blitz'], onOrder: [{ type: 'ready', target: 'self' }] }),
  event('e-open', '模块拼装', 'engineering', 1, 'laptop', '召唤一个 1/2 小小机器人。', '先让最小的原型跑起来。', [summon('t-robot')]),
  unit('e-repair', '维修志愿队', 'engineering', 2, 1, 1, 2, 'infantry', 'robot', '登场：友方目标恢复 2 点生命；若是单位，行动费用再 -1。', '留一点身材，换一次恰到好处的修复。', { signature: '维修协作', onDeploy: [heal(2, 'friendly'), { type: 'discount', amount: 1, target: 'friendly' }] }),
  unit('e-robot', '机器人小队', 'engineering', 3, 1, 3, 2, 'tank', 'robot', '速攻。可以先移动再攻击。', '轮子转起来，想法就有了方向。', { signature: '即刻开动', keywords: ['blitz'] }),
  event('e-flight', '轻装上阵', 'engineering', 2, 'flight', '一个友方单位攻击 +2，并获得速攻。', '精简结构，尽快投入现场。', [buff(2, 0, 'friendlyUnit', ['blitz'])]),
  event('e-server', '算力调度', 'engineering', 2, 'laptop', '所有友方单位行动费用 -1。', '把重复的工作交给系统，把精力留给选择。', [{ type: 'discount', amount: 1, target: 'allFriendlyUnits' }]),
  event('e-hack', '极限交付', 'engineering', 3, 'clock', '一个友方单位行动费用 -1，并重新获得行动机会。', '剩下的时间，还够完成最后一步。', [{ type: 'discount', amount: 1, target: 'friendlyUnit' }, { type: 'ready', target: 'friendlyUnit' }]),
  event('e-build', '整机组装', 'engineering', 6, 'robot', '召唤一个 3/4 原型机和一个 1/2 小小机器人。', '模块连成整体，才有新的可能。', [summon('t-prototype'), summon('t-robot')]),
  event('e-script', '抢课脚本', 'engineering', 2, 'laptop', '一个友方单位攻击 +1，重新获得行动机会。', '只在这张牌里，让下一步先人一步。', [buff(1, 0), { type: 'ready', target: 'friendlyUnit' }]),
  event('e-patch', '开源补丁', 'engineering', 2, 'notes', '所有友方单位恢复 2 点生命，抽 1 张牌。', '修复一处，也给下一次协作留条路。', [heal(2, 'allFriendlyUnits'), draw(1)]),
  event('e-parallel', '并行计算', 'engineering', 3, 'robot', '召唤两个 1/2 小小机器人。', '一个人忙不过来，就让两个模块一起转。', [summon('t-robot', 2)]),
  event('e-launch', '通宵上线', 'engineering', 5, 'clock', '所有友方单位 +1/+1，行动费用 -1。', '天亮了。我们的版本，也亮了。', [buff(1, 1, 'allFriendlyUnits'), { type: 'discount', amount: 1, target: 'allFriendlyUnits' }]),

  // Humanities: formation, recovery and the survival of a shared board.
  event('h-reader', '共读时光', 'humanities', 1, 'print-reader', '一个友方单位恢复 2 点生命，抽 1 张牌。', '读到相同的一页，也给彼此一点喘息。', [heal(2, 'friendlyUnit'), draw(1)]),
  event('h-poetry', '未名诗会', 'humanities', 2, 'lake', '所有友方单位生命 +1。', '把不同的声音，读成彼此的支撑。', [buff(0, 1, 'allFriendlyUnits')]),
  unit('h-restore', '古籍修复组', 'humanities', 3, 1, 1, 4, 'infantry', 'book', '守护。回合开始：相邻友方目标恢复 1 点生命。', '托住一页纸，也托住身边的人。', { signature: '修旧如旧', keywords: ['guard'], onTurnStart: [heal(1, 'adjacentFriendly')] }),
  unit('h-stage', '百讲剧社', 'humanities', 3, 1, 2, 3, 'fighter', 'stage', '登场：己方基地恢复 2 点士气。', '故事响起时，让心里的灯亮一点。', { signature: '戏台回响', onDeploy: [heal(2, 'selfHq')] }),
  event('h-archive', '古籍新编', 'humanities', 3, 'library', '召唤一个 2/3 读书伙伴，抽 1 张牌。', '从旧书里走来，也向新的问题走去。', [summon('t-reader'), draw(1)]),
  event('h-hike', '守望相助', 'humanities', 2, 'hike', '一个友方单位恢复 3 点生命，再获得生命 +1 与守护。', '走得远，也记得照看同行的人。', [heal(3, 'friendlyUnit'), buff(0, 1, 'friendlyUnit', ['guard'])]),
  event('h-think', '静思笃行', 'humanities', 2, 'debate', '所有友方单位恢复 1 点生命，抽 1 张牌。', '缓一缓，才能把接下来的路看清。', [heal(1, 'allFriendlyUnits'), draw(1)]),
  unit('h-lecture', '博雅讲演团', 'humanities', 6, 2, 4, 6, 'bomber', 'stage', '登场：友方单位恢复 2；基地士气不高于 10 时召唤读书伙伴。', '有些声音，会在多年之后仍有回响。', { signature: '弦歌不辍', onDeploy: [heal(2, 'allFriendlyUnits'), { ...summon('t-reader'), hqAtMost: 10 }] }),
  event('h-spring', '春日读诗', 'humanities', 1, 'lake', '己方基地恢复 3 点士气，抽 1 张牌。', '春风到湖边，恰好读到这一句。', [heal(3, 'selfHq'), draw(1)]),
  event('h-inclusive', '兼容并包', 'humanities', 2, 'book', '一个友方单位生命 +3，并获得守护。', '让不同的声音，都有自己的位置。', [buff(0, 3, 'friendlyUnit', ['guard'])]),
  event('h-night', '百讲之夜', 'humanities', 4, 'stage', '所有友方单位 +1/+1，基地恢复 2 点士气。', '掌声落下，心里的灯还亮着。', [buff(1, 1, 'allFriendlyUnits'), heal(2, 'selfHq')]),
  event('h-legacy', '薪火相传', 'humanities', 6, 'book', '召唤两个 2/3 读书伙伴，抽 1 张牌。', '有人留下火种，就有人继续远行。', [summon('t-reader', 2), draw(1)]),

  // Society: public pressure, attack reduction and precise follow-up removal.
  unit('c-fresh', '社科调研员', 'society', 1, 1, 2, 1, 'infantry', 'print-field', '速攻。', '从第一个问题，走进真实的生活。', { signature: '抢先发问', keywords: ['blitz'] }),
  event('c-law', '举证质证', 'society', 2, 'law', '一个敌方单位攻击 -2，抽 1 张牌。攻击最低为 0。', '先核对论据，再判断它还有多少力量。', [{ type: 'weaken', amount: 2, target: 'enemyUnit' }, draw(1)]),
  unit('c-field', '田野调查队', 'society', 3, 1, 2, 2, 'tank', 'map', '隐蔽。推进后抽 1 张牌。', '答案在路上，也在每一次认真倾听里。', { signature: '走进现场', keywords: ['smoke'], onMove: [draw(1)] }),
  event('c-case', '案例对照', 'society', 2, 'notes', '对一个敌方单位造成 2 点伤害，并使其攻击 -1。攻击最低为 0。', '把抽象主张，放到具体情境里检验。', [damage(2, 'enemyUnit'), { type: 'weaken', amount: 1, target: 'enemyUnit' }]),
  event('c-debate', '公开辩论', 'society', 3, 'debate', '所有敌方单位攻击 -1，最低为 0。', '把问题说透，让夸大的声势退去。', [{ type: 'weaken', amount: 1, target: 'allEnemyUnits' }]),
  unit('c-journal', '学刊编辑部', 'society', 4, 1, 1, 4, 'artillery', 'book', '你使用指令后，抽 1 张牌（每个己方回合限一次）。', '一个议题的终点，是下一个问题的起点。', { signature: '议题接力', onOrder: [draw(1)] }),
  event('c-strategy', '关键追问', 'society', 3, 'law', '对一个敌方单位造成 3 点伤害；若其攻击不高于 1，额外造成 2 点。', '找到薄弱的一环，再把问题追到底。', [damage(3, 'enemyUnit'), { ...damage(2, 'enemyUnit'), targetAttackAtMost: 1 }]),
  event('c-forum', '论辩声势', 'society', 4, 'stage', '所有友方单位攻击 +1，所有敌方单位攻击 -1（最低为 0）。', '当观点彼此呼应，局势也开始转向。', [buff(1, 0, 'allFriendlyUnits'), { type: 'weaken', amount: 1, target: 'allEnemyUnits' }]),
  event('c-question', '犀利提问', 'society', 1, 'debate', '对一个敌方目标造成 2 点伤害。', '谢谢分享，我有一个小问题。', [damage(2, 'enemy')]),
  event('c-visit', '实地走访', 'society', 2, 'map', '召唤一个 1/2 志愿伙伴，抽 1 张牌。', '带着问题出门，也带着新的同伴回来。', [summon('t-volunteer'), draw(1)]),
  event('c-cross', '临场质询', 'society', 3, 'law', '对一个敌方单位造成 3 点伤害，抽 1 张牌。', '请正面回应刚才的问题。', [damage(3, 'enemyUnit'), draw(1)]),
  event('c-focus', '舆论聚焦', 'society', 5, 'radio', '所有敌方单位及敌方基地受到 2 点伤害。', '当许多目光汇在一起，改变开始发生。', [damage(2, 'allEnemyUnits'), damage(2, 'enemyHq')]),

  // Shared eight-unit foundation; disciplines do not duplicate these bodies.
  unit('n-library', '图书馆值班生', 'neutral', 1, 1, 1, 3, 'infantry', 'print-librarian', '基础近战单位。', '闭馆的音乐响起，明天还在这里。'),
  unit('n-bike', '燕园骑行队', 'neutral', 2, 1, 2, 2, 'tank', 'print-cyclist', '机动：可以先移动再攻击。', '从宿舍到教室，还有一阵风的距离。'),
  unit('n-tower', '博雅塔守望', 'neutral', 3, 1, 1, 5, 'infantry', 'tower', '守护。', '塔影之下，给身边的人留一个稳固的位置。', { keywords: ['guard'] }),
  unit('n-lake', '湖畔同窗', 'neutral', 2, 1, 2, 3, 'infantry', 'lake', '基础近战单位。', '书页、微风，还有刚认识的朋友。'),
  unit('n-stage', '百讲放映组', 'neutral', 4, 1, 3, 3, 'bomber', 'stage', '远程轰炸，受拦截单位限制。', '今晚的好故事，留一张票给你。'),
  unit('n-keeper', '楼长巡场组', 'neutral', 3, 1, 2, 4, 'fighter', 'debate', '远程攻击；拦截同排敌方轰炸。', '走廊里熟悉的脚步声，让人安心。'),
  unit('n-canteen', '农园后勤组', 'neutral', 2, 1, 1, 3, 'infantry', 'food', '登场：己方基地恢复 2 点士气。', '世界再大，也先好好吃顿饭。', { onDeploy: [heal(2, 'selfHq')] }),
  unit('n-radio', '校园广播站', 'neutral', 4, 1, 2, 4, 'artillery', 'radio', '远程攻击，攻击时不受反击。', '午后的风，把熟悉的旋律带过燕园。'),
  event('n-food', '农园加餐', 'neutral', 1, 'food', '为一个友方目标恢复 4 点生命。', '今天的烦恼，配一份热腾腾的晚饭。', [heal(4, 'friendly')]),
  event('n-break', '课间补给', 'neutral', 1, 'notes', '抽 1 张牌。', '十分钟，足够重新出发。', [draw(1)]),
  unit('n-course', '早八赶路人', 'neutral', 1, 2, 2, 2, 'infantry', 'clock', '基础近战单位。行动费用为 2。', '赶上了第一节课，接下来要省着点精力。'),
  event('n-midterm', '期中突击', 'neutral', 2, 'notes', '对一个敌方单位造成 3 点伤害。', '距离考试，还有可以创造奇迹的一个晚上。', [damage(3, 'enemyUnit')]),
  unit('n-recruit', '社团接力队', 'neutral', 2, 0, 1, 2, 'tank', 'map', '行动费用为 0。可以先移动再攻击。', '一棒接着一棒，轻装向前。'),
  unit('n-rain', '操场冲锋队', 'neutral', 4, 1, 4, 4, 'tank', 'hike', '机动：可以先移动再攻击。', '把呼吸稳住，再向前冲一段。'),
  unit('n-photo', '毕业远行团', 'neutral', 6, 2, 5, 7, 'infantry', 'tower', '基础近战单位。', '走过燕园的四季，也有力量走向更远处。'),
  event('n-finals', '期末周', 'neutral', 6, 'clock', '对双方所有单位造成 3 点伤害。', '无论来自哪个院系，此刻我们感同身受。', [damage(3, 'allUnits')])
];


export const TOKENS = [
  unit('t-robot', '小小机器人', 'engineering', 1, 1, 1, 2, 'tank', 'robot', '召唤单位。可以先移动再攻击。', '滴——协作模式已开启。'),
  unit('t-reader', '读书伙伴', 'humanities', 2, 1, 2, 3, 'infantry', 'book', '召唤单位。', '下次读书会，还坐在一起。'),
  unit('t-volunteer', '志愿伙伴', 'neutral', 1, 1, 1, 2, 'infantry', 'map', '召唤单位。', '有需要，就有我们。'),
  unit('t-prototype', '原型机', 'engineering', 5, 1, 3, 4, 'bomber', 'robot', '召唤单位。远程轰炸，受拦截单位限制。', '第一台原型，是下一次迭代的起点。')
];
export const CARD_MAP = Object.fromEntries([...CARDS, ...TOKENS].map(c => [c.id, c]));
const sharedUnitIds = CARDS.filter(c => c.faction === 'neutral' && c.kind === 'unit').map(c => c.id);
const omittedShared = {
  science: ['n-course','n-recruit'], engineering: ['n-canteen','n-tower'],
  humanities: ['n-course','n-recruit','n-rain'], society: ['n-canteen','n-tower','n-photo']
};
const doubleOrders = {
  science: ['s-fresh','s-contest','s-repeat','s-insight'],
  engineering: ['e-flight','e-script','e-hack','e-patch'],
  humanities: ['h-reader','h-poetry','h-archive','h-spring','h-inclusive','h-night'],
  society: ['c-law','c-case','c-question','c-visit','c-cross','c-focus']
};
export const PRESETS = Object.keys(FACTIONS).filter(f => f !== 'neutral').map(f => ({
  id: 'preset-' + f, name: FACTIONS[f].deckName, faction: f, ally: null, rulesVersion: RULES.version,
  cards: [...sharedUnitIds.filter(id => !omittedShared[f].includes(id)).flatMap(id => [id,id]),
    ...CARDS.filter(c => c.faction === f && c.kind === 'unit').flatMap(c => [c.id,c.id]),
    ...CARDS.filter(c => c.faction === f && c.kind === 'event').map(c => c.id), ...doubleOrders[f]], preset: true
}));

export function validateDeck(deck) {
  const errors = [];
  if (!deck || !Object.hasOwn(FACTIONS, deck.faction) || deck.faction === 'neutral') return ['请选择主阵营'];
  if (!Array.isArray(deck.cards)) return ['套牌数据无效'];
  if (deck.cards.length !== RULES.deckSize) errors.push(`需要 ${RULES.deckSize} 张牌，当前 ${deck.cards.length} 张`);
  if (deck.ally && (!Object.hasOwn(FACTIONS, deck.ally) || deck.ally === deck.faction || deck.ally === 'neutral')) errors.push('副阵营必须与主阵营不同');
  let allied = 0;
  const counts = {};
  for (const id of deck.cards) {
    const c = CARDS.find(card => card.id === id);
    if (!c) { errors.push('套牌包含未知卡牌'); continue; }
    counts[id] = (counts[id] || 0) + 1;
    if (counts[id] === RULES.copies + 1) errors.push(`「${c.name}」最多 ${RULES.copies} 张`);
    if (![deck.faction, deck.ally, 'neutral'].includes(c.faction)) errors.push(`「${c.name}」不属于已选阵营`);
    if (c.faction === deck.ally) allied++;
  }
  if (allied > RULES.allyLimit) errors.push(`副阵营最多 ${RULES.allyLimit} 张，当前 ${allied} 张`);
  return [...new Set(errors)];
}
