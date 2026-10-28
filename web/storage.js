import { CARDS, FACTIONS, validateDeck } from './data.js?v=1.3.3';
import { validateState } from './engine.js?v=1.3.3';
const PREFIX = 'pkuards:v1:';
export const DEFAULT_STATS = { wins: 0, losses: 0, draws: 0, completed: [] };
export const DEFAULT_SETTINGS = { reducedMotion: false, aiSpeed: 650 };
const collectable = new Set(CARDS.map(card => card.id));
function validDraft(value) {
  const d = value?.deck;
  if (typeof value?.resume !== 'boolean' || !d || typeof d.id !== 'string' || !d.id || d.id.length > 100 || typeof d.name !== 'string' || d.name.length > 40 || !Object.hasOwn(FACTIONS, d.faction) || d.faction === 'neutral' || d.ally !== null && (!Object.hasOwn(FACTIONS, d.ally) || d.ally === 'neutral') || d.preset !== false || !Array.isArray(d.cards) || d.cards.length > 39) return false;
  const counts = new Map();
  return d.cards.every(id => { counts.set(id, (counts.get(id) || 0) + 1); return collectable.has(id) && counts.get(id) <= 2; });
}
export function createStorage(storage) {
  let warning = '';
  function load(key, fallback, valid) {
    try {
      const raw = storage.getItem(PREFIX + key);
      if (!raw) return structuredClone(fallback);
      const value = JSON.parse(raw);
      if (!valid(value)) throw new Error('Invalid saved data');
      return value;
    } catch {
      if (!warning) warning = '部分本地存档无法读取，已恢复该部分默认数据，其他存档仍然保留。';
      return structuredClone(fallback);
    }
  }
  function save(key, value) {
    try { storage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
    catch { warning = '浏览器未能保存进度。请检查站点存储权限或可用空间。'; return false; }
  }
  return {
    loadDecks: () => {
      const decks = load('decks', [], Array.isArray);
      const valid = decks.filter(d => typeof d?.id === 'string' && typeof d.name === 'string' && d.name.length <= 40 && !validateDeck(d).length);
      if (valid.length !== decks.length) warning = '已跳过无法读取的套牌，其他套牌仍然保留。';
      return valid;
    },
    loadMatch: () => load('match', null, v => {
      if (v?.version === 1) { warning = '本次卡牌技能已升级，旧对局需要重新开始；套牌、战绩和设置仍然保留。'; return false; }
      return v === null || validateState(v);
    }),
    loadStats: () => load('stats', DEFAULT_STATS, v => v && ['wins', 'losses', 'draws'].every(k => Number.isInteger(v[k]) && v[k] >= 0) && Array.isArray(v.completed) && v.completed.every(id => typeof id === 'string')),
    loadSettings: () => load('settings', DEFAULT_SETTINGS, v => v && typeof v.reducedMotion === 'boolean' && [250, 650, 1000].includes(v.aiSpeed)),
    loadDraft: () => load('draft', null, v => v === null || validDraft(v)),
    saveDecks: value => save('decks', value), saveMatch: value => save('match', value), saveStats: value => save('stats', value), saveSettings: value => save('settings', value), saveDraft: value => save('draft', value),
    warning: () => { const value = warning; warning = ''; return value; }
  };
}
