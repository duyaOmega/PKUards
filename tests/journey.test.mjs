import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../web/data.js';
import { applyAction, validateState, getLegalActions, getObservation } from '../web/engine.js';
import { chooseAction } from '../web/ai.js';
import { createStorage } from '../web/storage.js';
import { CHAPTERS, EMPTY_JOURNEY, createJourneyGame, trackJourneyAction, journeyObjectives, recordJourneyResult, chapterUnlocked, validJourneyMatch } from '../web/journey.js';

function start(id = 'west-gate') {
  let game = createJourneyGame({ chapterId: id, playerDeck: PRESETS[1] });
  for (const player of [0, 1]) game = applyAction(game, { type: 'mulligan', player, cards: [] }).state;
  return game;
}
function step(before, action) {
  const result = applyAction(before, action);
  assert.ok(result.ok, result.error);
  const previous = structuredClone(before.journey);
  trackJourneyAction(before, result, action);
  assert.deepEqual(before.journey, previous, 'tracking does not mutate the previous state');
  assert.ok(validateState(result.state)); assert.ok(validJourneyMatch(result.state.journey));
  return result.state;
}
function win(chapter = 'west-gate', turn = 15) {
  const game = start(chapter);
  game.phase = 'finished'; game.winner = 0; game.players[1].hq = 0; game.turn = turn;
  return game;
}

test('four chapters retain version 4 rules and reproducible openings with different opponents', () => {
  assert.equal(new Set(CHAPTERS.map(c => c.opponent)).size, 4);
  for (const chapter of CHAPTERS) {
    const a = createJourneyGame({ chapterId: chapter.id, playerDeck: PRESETS[0] });
    const b = createJourneyGame({ chapterId: chapter.id, playerDeck: PRESETS[0] });
    assert.ok(validateState(a)); assert.ok(validJourneyMatch(a.journey));
    assert.equal(a.version, 4); assert.equal(a.firstPlayer, 0);
    assert.equal(a.players[1].faction, chapter.opponent);
    assert.deepEqual(a.players, b.players);
    assert.equal(getObservation(a, 1).journey, undefined);
  }
});

test('only successful player cards count; summons, enemy actions and failed intents do not', () => {
  let game = start();
  game.players[0].energy = game.players[0].maxEnergy = 12;
  game.players[0].hand = ['e-parallel', 'n-break', 'e-night'].map(cardId => ({ id: 'test-' + cardId, cardId }));
  const failed = applyAction(game, { type: 'play', player: 0, card: 'missing', slot: 0 });
  trackJourneyAction(game, failed, { type: 'play', player: 0 });
  assert.equal(failed.ok, false); assert.equal(game.journey.metrics.units, 0);
  game = step(game, { type: 'play', player: 0, card: 'test-e-parallel' });
  assert.equal(game.journey.metrics.units, 0); assert.equal(game.journey.metrics.orders, 1);
  assert.equal(game.players[0].support.filter(Boolean).length, 2);
  game = step(game, { type: 'play', player: 0, card: 'test-n-break' });
  assert.equal(game.journey.metrics.maxTurnOrders, 2);
  game = step(game, { type: 'play', player: 0, card: 'test-e-night', slot: 3 });
  assert.equal(game.journey.metrics.units, 1);
  const unit = game.players[0].support[3];
  game = step(game, { type: 'move', player: 0, unit: unit.id, slot: 0 });
  assert.equal(game.journey.metrics.frontTurns, 0);
  game = step(game, { type: 'endTurn', player: 0 });
  assert.equal(game.journey.metrics.frontTurns, 1); assert.equal(game.journey.metrics.turnOrders, 0);
  const prior = structuredClone(game.journey.metrics);
  game.players[1].energy = game.players[1].maxEnergy = 12;
  game.players[1].hand = [{ id: 'enemy-night', cardId: 'e-night' }];
  game = step(game, { type: 'play', player: 1, card: 'enemy-night', slot: 0 });
  assert.deepEqual(game.journey.metrics, prior);
});

test('win unlocks one chapter; goals and fastest records are monotone and idempotent', () => {
  const game = win(); game.journey.metrics.units = 5;
  const progress = recordJourneyResult(EMPTY_JOURNEY, game);
  assert.deepEqual(progress.chapters['west-gate'], { stars: 3, rounds: 8 });
  assert.ok(chapterUnlocked(progress, 'weiming-lake')); assert.equal(chapterUnlocked(progress, 'library'), false);
  assert.equal(chapterUnlocked(progress, 'missing'), false);
  assert.equal(recordJourneyResult(progress, game), progress);
  const quick = win('west-gate', 9); quick.players[0].hq = 4;
  const improved = recordJourneyResult(progress, quick);
  assert.deepEqual(improved.chapters['west-gate'], { stars: 3, rounds: 5 });
  const draw = win(); draw.winner = 'draw'; draw.players[0].hq = 0;
  assert.equal(recordJourneyResult(improved, draw), improved);
  const loss = win(); loss.winner = 1;
  assert.equal(recordJourneyResult(improved, loss), improved);
});

test('chapter-specific goals use persistent metrics and final outcomes, including round limits', () => {
  for (const [id, metric, value] of [['weiming-lake', 'frontTurns', 2], ['library', 'orders', 4], ['auditorium', 'maxTurnOrders', 2]]) {
    const game = win(id); game.journey.metrics[metric] = value;
    game.journey.metrics.orders = Math.max(game.journey.metrics.orders, value);
    game.history = []; // A short public history must not erase accumulated goals.
    assert.equal(journeyObjectives(game).filter(g => g.met).length, 3);
    assert.equal(recordJourneyResult(EMPTY_JOURNEY, game).chapters[id].stars, 3);
  }
  const late = win('library', 29); late.journey.metrics.orders = 4;
  assert.equal(recordJourneyResult(EMPTY_JOURNEY, late).chapters.library.stars, 2);
  const active = start();
  assert.equal(journeyObjectives(active).at(-1).met, false, 'health goal waits for an actual win');
});

test('journey progress and match metadata recover independently from unrelated saves', () => {
  const data = new Map(), backing = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const store = createStorage(backing), game = start();
  const progress = recordJourneyResult(EMPTY_JOURNEY, win());
  store.saveDecks(PRESETS); store.saveMatch(game); store.saveJourney(progress);
  assert.deepEqual(store.loadMatch(), game); assert.deepEqual(store.loadJourney(), progress);
  data.set('pkuards:v1:journey', JSON.stringify({ version: 1, chapters: { unknown: { stars: 8, rounds: 0 } } }));
  assert.deepEqual(store.loadJourney(), EMPTY_JOURNEY); assert.deepEqual(store.loadMatch(), game);
  assert.deepEqual(store.loadDecks(), PRESETS);
  game.journey.metrics.units = -1; store.saveMatch(game); store.saveJourney(progress);
  assert.equal(store.loadMatch(), null); assert.deepEqual(store.loadJourney(), progress); assert.ok(store.warning());
});

test('all four chapters and all four player presets finish through legal public actions', () => {
  for (const chapter of CHAPTERS) for (const playerDeck of PRESETS) {
    let game = createJourneyGame({ chapterId: chapter.id, playerDeck });
    for (let actions = 0; game.phase !== 'finished' && actions < 1600; actions++) {
      const action = chooseAction(getObservation(game, game.currentPlayer), getLegalActions(game));
      assert.ok(action); game = step(game, action);
    }
    assert.equal(game.phase, 'finished', chapter.id + ':' + playerDeck.id);
    if (game.winner === 0) assert.ok(recordJourneyResult(EMPTY_JOURNEY, game).chapters[chapter.id].stars >= 1);
  }
});
