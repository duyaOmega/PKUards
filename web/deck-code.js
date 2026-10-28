import { CARDS, validateDeck } from './data.js?v=1.3.3';

const PREFIX = 'PKU1.';
const collectable = new Set(CARDS.map(card => card.id));
function check(deck) {
  if (typeof deck?.name !== 'string' || !deck.name.trim() || deck.name.trim().length > 40) throw new Error('套牌名称需要 1–40 个字符。');
  if (typeof deck.faction !== 'string' || deck.ally !== null && typeof deck.ally !== 'string') throw new Error('分享码中的阵营无效。');
  const errors = validateDeck(deck);
  if (errors.length) throw new Error(errors[0]);
}
/** Codes contain only a deck's name and composition, with stable card IDs. */
export function encodeDeck(deck) {
  const value = { ...deck, ally: deck.ally || null }; check(value);
  const counts = new Map();
  for (const id of value.cards) counts.set(id, (counts.get(id) || 0) + 1);
  const payload = { v: 1, n: value.name.trim(), f: value.faction, a: value.ally, c: [...counts].sort(([a], [b]) => a.localeCompare(b)) };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return PREFIX + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeDeck(code) {
  if (typeof code !== 'string' || code.length > 8192) throw new Error('分享码过长或格式不正确。');
  const text = code.replace(/\s+/g, '');
  if (/^PKU\d+\./.test(text) && !text.startsWith(PREFIX)) throw new Error('暂不支持这个版本的分享码。');
  if (!text.startsWith(PREFIX) || !/^[A-Za-z0-9_-]+$/.test(text.slice(PREFIX.length))) throw new Error('分享码格式不正确，请完整复制以 PKU1. 开头的代码。');
  let value;
  try {
    const binary = atob(text.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/'));
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, ch => ch.charCodeAt(0))));
  } catch { throw new Error('分享码无法读取，请检查是否完整复制。'); }
  if (!value || value.v !== 1 || !Array.isArray(value.c) || value.c.length > 39) throw new Error('分享码内容无效。');
  const cards = [], seen = new Set();
  for (const entry of value.c) {
    if (!Array.isArray(entry) || entry.length !== 2 || !collectable.has(entry[0]) || seen.has(entry[0]) || ![1, 2].includes(entry[1])) throw new Error('分享码包含无效卡牌或重复数量。');
    seen.add(entry[0]); cards.push(...Array(entry[1]).fill(entry[0]));
  }
  const deck = { name: value.n, faction: value.f, ally: value.a, cards, preset: false };
  check(deck); return deck;
}
