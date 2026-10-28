import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayback, playbackStages, describeAction } from '../web/presentation.js';
import { createGame, applyAction, getLegalActions } from '../web/engine.js';
import { PRESETS } from '../web/data.js';
test('cinematic playback reveals, aims, commits once at impact and then unlocks', () => {
  let callback, commits = 0, done = 0; const stages = [];
  const p = createPlayback({ stages: playbackStages({kind:'play',owner:1}), schedule: fn => { callback = fn; return 1; }, cancel() {}, onStage: s=>stages.push(s), onCommit: ()=>commits++, onDone: ()=>done++ });
  p.start(); assert.deepEqual(stages,['reveal']); assert.equal(commits,0);
  callback(); assert.deepEqual(stages,['reveal','aim']); assert.equal(commits,0);
  callback(); assert.equal(commits,1); assert.equal(done,0);
  callback(); p.finish(); callback(); assert.equal(commits,1); assert.equal(done,1);
});
test('skipping at any animation stage cannot double-charge an action', () => {
  for (let skip = 0; skip < 3; skip++) {
    let callback, commits=0, done=0;
    const p=createPlayback({stages:playbackStages({kind:'play',owner:0}),schedule:fn=>{callback=fn;return 1;},cancel(){},onStage(){},onCommit:()=>commits++,onDone:()=>done++});
    p.start(); for(let i=0;i<skip;i++) callback(); p.finish(); p.finish(); callback();
    assert.equal(commits,1);assert.equal(done,1);
  }
});
test('opponent presentation contains exactly its played card and public target, no remaining hand', () => {
  let s=createGame({playerDeck:PRESETS[0],aiDeck:PRESETS[3],seed:102,firstPlayer:1});
  for(const player of [0,1])s=applyAction(s,{type:'mulligan',player,cards:[]}).state;
  s.players[1].hand=[{id:'public-card',cardId:'c-question'},{id:'secret-card',cardId:'c-focus'}];s.players[1].energy=12;
  const a=getLegalActions(s).find(a=>a.card==='public-card'&&a.target==='hq:0');
  const d=describeAction(s,a,applyAction(s,a));
  assert.equal(d.cardId,'c-question');assert.match(d.subtitle,/你的基地/);assert.deepEqual(d.targets,['hq:0']);
  assert.ok(!JSON.stringify(d).includes('c-focus'));assert.equal(d.impacts[0].amount,2);
});
