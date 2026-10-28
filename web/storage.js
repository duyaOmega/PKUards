import { validateDeck } from './data.js';
import { validateState } from './engine.js';
const PREFIX = 'pkuards:v1:';
export const DEFAULT_STATS = { wins: 0, losses: 0, draws: 0, completed: [] };
export const DEFAULT_SETTINGS = { reducedMotion: false, aiSpeed: 650 };
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
      warning = '部分本地存档无法读取，已恢复该部分默认数据，其他存档仍然保留。';
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
    loadMatch: () => load('match', null, v => v === null || validateState(v)),
    loadStats: () => load('stats', DEFAULT_STATS, v => v && ['wins', 'losses', 'draws'].every(k => Number.isInteger(v[k]) && v[k] >= 0) && Array.isArray(v.completed) && v.completed.every(id => typeof id === 'string')),
    loadSettings: () => load('settings', DEFAULT_SETTINGS, v => v && typeof v.reducedMotion === 'boolean' && [250, 650, 1000].includes(v.aiSpeed)),
    saveDecks: value => save('decks', value), saveMatch: value => save('match', value), saveStats: value => save('stats', value), saveSettings: value => save('settings', value),
    warning: () => { const value = warning; warning = ''; return value; }
  };
}
