import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDrop, revealedPlays } from '../web/interactions.js';
import { createGame, applyAction, getLegalActions } from '../web/engine.js';
import { PRESETS } from '../web/data.js';
test('drag deploy and advance resolve only legal friendly positions', () => {
  const play = {type:'play',card:'c1',slot:1}, move = {type:'move',unit:'u1',slot:3};
  assert.equal(resolveDrop([play],{kind:'hand',id:'c1'},{row:'support',owner:0,slot:1}),play);
  assert.equal(resolveDrop([play],{kind:'hand',id:'c1'},{row:'support',owner:1,slot:1}),null);
  assert.equal(resolveDrop([play],{kind:'hand',id:'c1'},{row:'support',owner:0,slot:2}),null);
  assert.equal(resolveDrop([move],{kind:'unit',id:'u1'},{row:'front',slot:3}),move);
});
test('drag targets, auto-picked deployment slots and pending deploy skills', () => {
  const attack = {type:'attack',unit:'u1',target:'hq:1'};
  assert.equal(resolveDrop([attack],{kind:'unit',id:'u1'},{target:'hq:1'}),attack);
  assert.equal(resolveDrop([attack],{kind:'unit',id:'u1'},{target:'hq:0'}),null);
  const plays = [0,1,3].map(slot=>({type:'play',card:'c1',slot,target:'u2'}));
  assert.equal(resolveDrop(plays,{kind:'hand',id:'c1'},{target:'u2'}).slot,1);
  assert.equal(resolveDrop(plays,{kind:'hand',id:'c1',slot:3},{target:'u2'}).slot,3);
  assert.deepEqual(resolveDrop(plays,{kind:'hand',id:'c1'},{row:'support',owner:0,slot:3}),{pendingSlot:3});
  const event = {type:'play',card:'c2'};
  assert.equal(resolveDrop([event],{kind:'hand',id:'c2'},{arena:true}),event);
  assert.equal(resolveDrop([event],{kind:'hand',id:'c2'},{row:'support',owner:0,slot:1}),event);
  assert.equal(resolveDrop([event],{kind:'hand',id:'c2'},{target:'hq:1'}),event);
  assert.equal(resolveDrop([event],{kind:'hand',id:'c2'},{arena:false}),null);
});
test('public play records distinguish played units from summons and survive serialization', () => {
  let s=createGame({playerDeck:PRESETS[0],aiDeck:PRESETS[1],seed:99,firstPlayer:1});
  s=applyAction(s,{type:'mulligan',player:0,cards:[]}).state;
  s=applyAction(s,{type:'mulligan',player:1,cards:[]}).state;
  s.players[1].energy=s.players[1].maxEnergy=12;
  s.players[1].hand=[{id:'test',cardId:'e-build'}];
  s=applyAction(s,getLegalActions(s).find(a=>a.type==='play'&&a.slot===1)).state;
  const shown=revealedPlays(JSON.parse(JSON.stringify(s.history)));
  assert.equal(shown.length,1); assert.equal(shown[0].cardId,'e-build');
  assert.equal(s.history.filter(e=>e.kind==='deploy').length,2);
  assert.deepEqual(revealedPlays([{kind:'deploy',owner:1,cardId:'t-robot'},{kind:'play',owner:0,cardId:'s-night'}]),[]);
});
