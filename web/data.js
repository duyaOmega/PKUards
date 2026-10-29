export const RULES = Object.freeze({ version: 2, deckSize: 39, copies: 2, allyLimit: 12, hqHealth: 20, maxEnergy: 12, handLimit: 9, frontSlots: 5, hqSlot: 2 });
export const FACTIONS = {
  science: { name: '理学探索', short: '理学', color: '#466e68', motto: '向未知，再进一步。', style: '研究 · 成长', description: '以抽牌积累优势，让研习小组成长为改变战局的力量。', base: '理学研究基地', deckName: '穷理尽微', icon: '∑', art: 'stars' },
  engineering: { name: '工学智造', short: '工学', color: '#a3763c', motto: '想法落地，即刻出发。', style: '机动 · 效率', description: '用速攻与机动抢占前线，让每一点精力都发挥作用。', base: '智造协作基地', deckName: '即刻上线', icon: '⚙', art: 'robot' },
  humanities: { name: '人文思辨', short: '人文', color: '#9b4748', motto: '以思想，回应时代。', style: '守护 · 传承', description: '在守护与恢复中站稳脚跟，用团队强化赢得持久战。', base: '博雅共学基地', deckName: '弦歌不辍', icon: '文', art: 'book' },
  society: { name: '社科纵横', short: '社科', color: '#626581', motto: '于众声之中，找到答案。', style: '事件 · 节奏', description: '配合灵活事件与辩论单位，掌握对局的主动权。', base: '社会观察基地', deckName: '纵横有方', icon: '衡', art: 'law' },
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
  unit('s-fresh', '数院新生', 'science', 1, 1, 1, 3, 'infantry', 'math', '基础近战单位。', '证明写到第三页，故事才刚刚开始。'),
  unit('s-tutor', '高数助教', 'science', 2, 1, 1, 4, 'infantry', 'notes', '守护。', '这一步显然吗？我们再讲一遍。', { keywords: ['guard'] }),
  unit('s-lab', '基础实验组', 'science', 2, 1, 2, 2, 'infantry', 'lab', '离场：抽 1 张牌。', '每一次失败，都留下了有用的数据。', { onDeath: [draw(1)] }),
  unit('s-contest', '物理竞赛队', 'science', 3, 1, 3, 3, 'tank', 'math', '机动：可以先移动再攻击。', '理想条件之外，也有漂亮的解。'),
  unit('s-stars', '天文观测组', 'science', 3, 1, 2, 3, 'artillery', 'stars', '回合开始：若控制前线，抽 1 张牌。', '今夜晴朗，整个宇宙都在场。', { signature: '观测记录', onTurnStart: [{ ...draw(1), conditionFrontline: true }] }),
  unit('s-proof', '证明研讨班', 'science', 4, 1, 3, 5, 'infantry', 'math', '每当你成功抽牌，自身攻击 +1。', '从一个引理，走向更大的世界。', { signature: '数学归纳', onDraw: [buff(1, 0, 'self')] }),
  unit('s-forum', '科学前沿讲坛', 'science', 5, 2, 4, 4, 'bomber', 'stage', '远程轰炸，受拦截单位限制。', '好问题，比标准答案更令人兴奋。'),
  unit('s-institute', '未名研究所', 'science', 6, 2, 4, 7, 'fighter', 'lab', '登场：抽 1 张牌；若控制前线，再抽 1 张。', '把昨天的不可能，写进明天的方法。', { signature: '前沿突破', onDeploy: [draw(1), { ...draw(1), conditionFrontline: true }] }),
  event('s-night', '通宵推导', 'science', 2, 'clock', '抽 2 张牌，己方基地受到 1 点伤害。', '最后一行结果，比第一缕晨光早到。', [draw(2), damage(1, 'selfHq')]),
  event('s-repeat', '重复实验', 'science', 2, 'lab', '一个友方单位 +1/+2，抽 1 张牌。', '再做一次。这次，我们知道为什么。', [buff(1, 2), draw(1)]),
  event('s-insight', '灵光一现', 'science', 3, 'stars', '对一个敌方单位造成 4 点伤害。', '有时候，答案出现在去食堂的路上。', [damage(4, 'enemyUnit')]),
  event('s-theory', '统一理论', 'science', 6, 'math', '所有友方单位 +2/+2，抽 1 张牌。', '原来散落的线索，指向同一个答案。', [buff(2, 2, 'allFriendlyUnits'), draw(1)]),

  unit('e-night', '机房夜行人', 'engineering', 1, 0, 1, 1, 'infantry', 'laptop', '速攻。行动费用为 0。', '凌晨两点，屏幕另一侧还有人在线。', { keywords: ['blitz'] }),
  unit('e-open', '开源协作组', 'engineering', 2, 1, 2, 2, 'tank', 'laptop', '离场：召唤一个 1/2 小小机器人。', '提交记录很长，贡献者名单更长。', { onDeath: [summon('t-robot')] }),
  unit('e-repair', '维修志愿队', 'engineering', 2, 1, 1, 3, 'infantry', 'robot', '登场：为一个友方目标恢复 2 点生命。', '别急着重启，我们先看看接线。', { onDeploy: [heal(2, 'friendly')] }),
  unit('e-robot', '机器人小队', 'engineering', 3, 1, 3, 2, 'tank', 'robot', '速攻。可以先移动再攻击。', '轮子转起来，想法就有了方向。', { keywords: ['blitz'] }),
  unit('e-flight', '航模巡场队', 'engineering', 3, 1, 2, 3, 'fighter', 'flight', '远程攻击；拦截同排敌方轰炸。', '抬头看，新的航线正在形成。'),
  unit('e-server', '算力支援站', 'engineering', 4, 1, 3, 3, 'artillery', 'laptop', '回合开始：友方突击单位攻击 +1。', '算力到位，灵感排队。', { signature: '并行加速', onTurnStart: [{ ...buff(1, 0, 'allFriendlyUnits'), filterType: 'tank' }] }),
  unit('e-hack', '黑客松战队', 'engineering', 4, 1, 4, 3, 'tank', 'clock', '登场：行动费 -1；推进后攻击 +1。', '剩余三分钟？够再改一个功能。', { signature: '极限交付', onDeploy: [{ type: 'discount', amount: 1, target: 'self' }], onMove: [buff(1, 0, 'self')] }),
  unit('e-build', '燕园智造团', 'engineering', 6, 2, 5, 5, 'bomber', 'robot', '登场：召唤一个小小机器人。', '纸上蓝图，终于在阳光下运行。', { onDeploy: [summon('t-robot')] }),
  event('e-script', '抢课脚本', 'engineering', 2, 'laptop', '一个友方单位攻击 +1，重新获得行动机会。', '选课依旧靠手速，这张牌只在燕园争锋里有效。', [buff(1, 0), { type: 'ready', target: 'friendlyUnit' }]),
  event('e-patch', '开源补丁', 'engineering', 2, 'notes', '所有友方单位恢复 2 点生命，抽 1 张牌。', '修复一个问题，也让后来的人少走一段弯路。', [heal(2, 'allFriendlyUnits'), draw(1)]),
  event('e-parallel', '并行计算', 'engineering', 3, 'robot', '召唤两个 1/2 小小机器人。', '一个人想不完的事，就一起想。', [summon('t-robot', 2)]),
  event('e-launch', '通宵上线', 'engineering', 5, 'clock', '所有友方单位 +1/+1，行动费用 -1。', '天亮了。我们的版本，也亮了。', [buff(1, 1, 'allFriendlyUnits'), { type: 'discount', amount: 1, target: 'allFriendlyUnits' }]),

  unit('h-reader', '静园读书人', 'humanities', 1, 1, 1, 3, 'infantry', 'book', '基础近战单位。', '翻过这一页，风也慢了下来。'),
  unit('h-poetry', '未名诗社', 'humanities', 2, 1, 2, 3, 'infantry', 'lake', '基础近战单位。', '把湖光写成诗，把青春读出声。'),
  unit('h-restore', '古籍修复组', 'humanities', 3, 1, 1, 4, 'infantry', 'book', '守护。回合开始：相邻友方目标恢复 1 点生命。', '托住一页纸，也托住一段时间。', { signature: '修旧如旧', keywords: ['guard'], onTurnStart: [heal(1, 'adjacentFriendly')] }),
  unit('h-stage', '百讲剧社', 'humanities', 3, 1, 2, 4, 'fighter', 'stage', '登场：己方基地恢复 2 点士气。', '灯光亮起之前，故事已经开始。', { onDeploy: [heal(2, 'selfHq')] }),
  unit('h-archive', '燕园文献组', 'humanities', 3, 1, 2, 3, 'artillery', 'library', '离场：抽 1 张牌。', '一条注释后面，可能藏着另一个时代。', { onDeath: [draw(1)] }),
  unit('h-hike', '山鹰远行队', 'humanities', 4, 1, 3, 5, 'tank', 'hike', '机动：可以先移动再攻击。', '走出书斋，山川也是一本书。'),
  unit('h-think', '哲学讨论班', 'humanities', 4, 1, 3, 5, 'fighter', 'debate', '远程攻击；拦截同排敌方轰炸。', '这个问题，我们可以从定义谈起。'),
  unit('h-lecture', '博雅讲演团', 'humanities', 6, 2, 5, 6, 'bomber', 'stage', '登场：友方单位恢复 2；基地≤10时召唤读书伙伴。', '有些声音，会在多年之后仍有回响。', { signature: '弦歌不辍', onDeploy: [heal(2, 'allFriendlyUnits'), { ...summon('t-reader'), hqAtMost: 10 }] }),
  event('h-spring', '春日读诗', 'humanities', 1, 'lake', '己方基地恢复 3 点士气，抽 1 张牌。', '春风到湖边，恰好读到这一句。', [heal(3, 'selfHq'), draw(1)]),
  event('h-inclusive', '兼容并包', 'humanities', 2, 'book', '一个友方单位生命 +3，并获得守护。', '让不同的声音，都有自己的位置。', [buff(0, 3, 'friendlyUnit', ['guard'])]),
  event('h-night', '百讲之夜', 'humanities', 4, 'stage', '所有友方单位 +1/+2，基地恢复 2 点士气。', '掌声落下，心里的灯还亮着。', [buff(1, 2, 'allFriendlyUnits'), heal(2, 'selfHq')]),
  event('h-legacy', '薪火相传', 'humanities', 5, 'book', '召唤两个 2/3 读书伙伴，抽 1 张牌。', '有人留下火种，就有人继续远行。', [summon('t-reader', 2), draw(1)]),

  unit('c-fresh', '社科调研员', 'society', 1, 1, 2, 1, 'infantry', 'map', '速攻。', '从第一个问题，走进真实的生活。', { keywords: ['blitz'] }),
  unit('c-law', '模拟法庭', 'society', 3, 1, 2, 3, 'fighter', 'law', '登场：敌方前线全体受到 1 点伤害。', '请允许我补充一份证据。', { signature: '举证质证', onDeploy: [damage(1, 'enemyFront')] }),
  unit('c-field', '田野调查队', 'society', 2, 1, 2, 2, 'tank', 'map', '隐蔽。推进后抽 1 张牌。', '答案在路上，也在每一次认真倾听里。', { signature: '走进现场', keywords: ['smoke'], onMove: [draw(1)] }),
  unit('c-case', '案例研习组', 'society', 3, 1, 3, 3, 'infantry', 'notes', '登场：抽 1 张牌。', '案例读完，讨论才刚进入正题。', { onDeploy: [draw(1)] }),
  unit('c-debate', '校园辩论队', 'society', 3, 1, 3, 3, 'fighter', 'debate', '远程攻击；拦截同排敌方轰炸。', '时间有限，观点有力。'),
  unit('c-journal', '学刊编辑部', 'society', 4, 1, 2, 4, 'artillery', 'book', '每个己方回合首次使用事件后，抽 1 张牌。', '把问题写清楚，就已经前进了一步。', { signature: '议题接力', onOrder: [draw(1)] }),
  unit('c-strategy', '战略研究会', 'society', 5, 1, 4, 5, 'infantry', 'law', '登场：对一个敌方目标造成 2 点伤害。', '看见局部，也要读懂全局。', { onDeploy: [damage(2, 'enemy')] }),
  unit('c-forum', '公共议题论坛', 'society', 6, 2, 5, 5, 'bomber', 'stage', '离场：敌方基地受到 2 点伤害。', '话题结束了，思考没有。', { onDeath: [damage(2, 'enemyHq')] }),
  event('c-question', '犀利提问', 'society', 1, 'debate', '对一个敌方目标造成 2 点伤害。', '谢谢分享，我有一个小问题。', [damage(2, 'enemy')]),
  event('c-visit', '实地走访', 'society', 2, 'map', '抽 2 张牌。', '离开熟悉的坐标，理解才有了新的尺度。', [draw(2)]),
  event('c-cross', '临场质询', 'society', 3, 'law', '对一个敌方单位造成 3 点伤害，抽 1 张牌。', '请正面回应刚才的问题。', [damage(3, 'enemyUnit'), draw(1)]),
  event('c-focus', '舆论聚焦', 'society', 5, 'radio', '所有敌方单位及敌方基地受到 2 点伤害。', '当许多目光汇在一起，改变开始发生。', [damage(2, 'allEnemyUnits'), damage(2, 'enemyHq')]),

  unit('n-library', '图书馆值班生', 'neutral', 1, 1, 1, 2, 'infantry', 'library', '基础近战单位。', '闭馆的音乐响起，明天还在这里。'),
  unit('n-bike', '燕园骑行队', 'neutral', 2, 1, 2, 2, 'tank', 'bike', '机动：可以先移动再攻击。', '从宿舍到教室，还有一阵风的距离。'),
  unit('n-tower', '博雅塔守望', 'neutral', 3, 1, 1, 5, 'infantry', 'tower', '守护。推进后，自身生命 +2。', '湖光流转，塔影长在。', { signature: '塔影长在', keywords: ['guard'], onMove: [buff(0, 2, 'self')] }),
  unit('n-lake', '未名湖畔读书会', 'neutral', 3, 1, 2, 4, 'infantry', 'lake', '回合开始：若在前线，基地恢复 2 点士气。', '书页、微风，还有刚认识的朋友。', { signature: '湖畔长读', onTurnStart: [{ ...heal(2, 'selfHq'), sourceInFront: true }] }),
  unit('n-stage', '百讲放映组', 'neutral', 4, 1, 3, 3, 'bomber', 'stage', '远程轰炸，受拦截单位限制。', '今晚的好故事，留一张票给你。'),
  unit('n-keeper', '楼长巡场组', 'neutral', 3, 1, 2, 4, 'fighter', 'debate', '远程攻击；拦截同排敌方轰炸。', '走廊里熟悉的脚步声，让人安心。'),
  unit('n-canteen', '农园后勤组', 'neutral', 2, 1, 1, 3, 'infantry', 'food', '登场：己方基地恢复 2 点士气。', '世界再大，也先好好吃顿饭。', { onDeploy: [heal(2, 'selfHq')] }),
  unit('n-radio', '校园广播站', 'neutral', 4, 1, 2, 4, 'artillery', 'radio', '远程攻击，攻击时不受反击。', '午后的风，把熟悉的旋律带过燕园。'),
  event('n-food', '农园加餐', 'neutral', 1, 'food', '为一个友方目标恢复 4 点生命。', '今天的烦恼，配一份热腾腾的晚饭。', [heal(4, 'friendly')]),
  event('n-break', '课间补给', 'neutral', 1, 'notes', '抽 1 张牌。', '十分钟，足够重新出发。', [draw(1)]),
  event('n-course', '抢课手速', 'neutral', 1, 'clock', '一个友方单位攻击 +1，并获得速攻。', '倒数三秒，整个宿舍屏住呼吸。', [buff(1, 0, 'friendlyUnit', ['blitz'])]),
  event('n-midterm', '期中突击', 'neutral', 2, 'notes', '对一个敌方单位造成 3 点伤害。', '距离考试，还有可以创造奇迹的一个晚上。', [damage(3, 'enemyUnit')]),
  event('n-recruit', '社团招新', 'neutral', 3, 'map', '召唤两个 1/2 志愿伙伴。', '三角地上，总有一张海报与你有关。', [summon('t-volunteer', 2)]),
  event('n-rain', '雨后燕园', 'neutral', 3, 'lake', '所有友方单位恢复 2 点生命，基地恢复 3 点士气。', '雨停了，连赶路都变得轻快。', [heal(2, 'allFriendlyUnits'), heal(3, 'selfHq')]),
  event('n-photo', '毕业合影', 'neutral', 4, 'tower', '所有友方单位 +1/+1，抽 1 张牌。', '这一帧里，装得下我们共同的四季。', [buff(1, 1, 'allFriendlyUnits'), draw(1)]),
  event('n-finals', '期末周', 'neutral', 6, 'clock', '对双方所有单位造成 3 点伤害。', '无论来自哪个院系，此刻我们感同身受。', [damage(3, 'allUnits')])
];

export const TOKENS = [
  unit('t-robot', '小小机器人', 'engineering', 1, 1, 1, 2, 'tank', 'robot', '召唤单位。可以先移动再攻击。', '滴——协作模式已开启。'),
  unit('t-reader', '读书伙伴', 'humanities', 2, 1, 2, 3, 'infantry', 'book', '召唤单位。', '下次读书会，还坐在一起。'),
  unit('t-volunteer', '志愿伙伴', 'neutral', 1, 1, 1, 2, 'infantry', 'map', '召唤单位。', '有需要，就有我们。')
];
export const CARD_MAP = Object.fromEntries([...CARDS, ...TOKENS].map(c => [c.id, c]));
const neutralPreset = ['n-library', 'n-bike', 'n-tower', 'n-lake', 'n-keeper', 'n-canteen', 'n-radio', 'n-food', 'n-break', 'n-course', 'n-midterm', 'n-recruit', 'n-rain', 'n-photo', 'n-finals'];
export const PRESETS = Object.keys(FACTIONS).filter(f => f !== 'neutral').map(f => ({ id: `preset-${f}`, name: FACTIONS[f].deckName, faction: f, ally: null, cards: [...CARDS.filter(c => c.faction === f).flatMap(c => [c.id, c.id]), ...neutralPreset], preset: true }));

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
