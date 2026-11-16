import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_MAP, PRESETS, RULES, validateDeck } from '../web/data.js';
import { createGame, applyAction, getLegalActions, getObservation, validateState } from '../web/engine.js';
import { chooseAction } from '../web/ai.js';
import { encodeDeck, decodeDeck } from '../web/deck-code.js';
import { createStorage } from '../web/storage.js';

function base() {
  let s=createGame({playerDeck:PRESETS[1],aiDeck:PRESETS[3],seed:581,firstPlayer:0});
  for(const player of [0,1])s=applyAction(s,{type:'mulligan',player,cards:[]}).state;
  s.players[0].energy=s.players[0].maxEnergy=12;s.players[0].hand=[{id:'patch-card',cardId:'e-patch'}];return s;
}
function put(s, owner, opCost) {
  const c=CARD_MAP['n-library'];s.players[owner].support[0]={id:'tempo-unit-'+owner,cardId:c.id,owner,attack:c.attack,health:c.health,maxHealth:c.health,opCost,keywords:[],row:'support',slot:0,sick:false,moved:true,attacked:true};
}
test('open-source patch rewards an actually zero-operation friendly unit and respects hand capacity',()=>{
  for(const [ownCost,enemyCost,expected]of [[0,1,2],[1,0,1],[1,1,1]]){
    const s=base();put(s,0,ownCost);put(s,1,enemyCost);
    const result=applyAction(s,{type:'play',player:0,card:'patch-card'});assert.ok(result.ok);assert.ok(validateState(result.state));
    assert.equal(result.state.players[0].hand.length,expected);assert.equal(result.state.players[0].energy,10);
  }
  const s=base();put(s,0,0);
  s.players[0].hand.push(...Array.from({length:8},(_,i)=>({id:'held-patch-'+i,cardId:'n-finals'})));
  const before=s.players[0].deck.length,result=applyAction(s,{type:'play',player:0,card:'patch-card'}).state;
  assert.equal(result.players[0].hand.length,9);assert.equal(result.players[0].deck.length,before-2);assert.equal(result.players[0].discard.length,2);
});
test('AI values the engineering resource condition without granting it for an enemy zero-cost unit',()=>{
  const s=base();s.players[0].energy=2;s.players[0].hand.push({id:'break-card',cardId:'n-break'});put(s,0,1);put(s,1,0);
  assert.equal(chooseAction(getObservation(s,0),getLegalActions(s)).card,'break-card');
  s.players[0].support[0].opCost=0;
  const view=getObservation(s,0),copy=structuredClone(view);
  assert.equal(chooseAction(view,getLegalActions(s)).card,'patch-card');assert.deepEqual(view,copy);
});
test('version-3 PKU2 decks remain editable while future card-pool codes are rejected',()=>{
  const body=JSON.parse(Buffer.from(encodeDeck(PRESETS[0]).slice(5),'base64url').toString('utf8'));
  body.r=3;const code='PKU2.'+Buffer.from(JSON.stringify(body)).toString('base64url');
  const old=decodeDeck(code);assert.equal(old.rulesVersion,3);assert.deepEqual(validateDeck(old),[]);assert.equal(old.cards.length,39);
  body.r=RULES.version+1;assert.throws(()=>decodeDeck('PKU2.'+Buffer.from(JSON.stringify(body)).toString('base64url')),/版本/);
});
test('the old reserve match restarts with a relevant notice and independent records survive',()=>{
  const old=base();old.version=3;const deck={...PRESETS[1],id:'prior-deck',rulesVersion:3};
  const stats={wins:2,losses:1,draws:0,completed:['a','b','c']},journey={version:1,chapters:{'west-gate':{stars:2,rounds:9}}};
  const values=new Map(Object.entries({match:old,decks:[deck],stats,journey}).map(([k,v])=>['pkuards:v1:'+k,JSON.stringify(v)]));
  const storage=createStorage({getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)});
  assert.deepEqual(storage.loadDecks(),[deck]);assert.match(storage.warning(),/开源补丁/);
  assert.equal(storage.loadMatch(),null);assert.match(storage.warning(),/后手补给.*旧对局需要重新开始/);
  assert.deepEqual(storage.loadStats(),stats);assert.deepEqual(storage.loadJourney(),journey);
  assert.equal(JSON.parse(values.get('pkuards:v1:match')).version,3);
});
