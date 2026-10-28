import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CARD_MAP, PRESETS } from '../web/data.js';
import { createGame, applyAction, findUnit, allUnits } from '../web/engine.js';
import { createStorage } from '../web/storage.js';
function base(){let s=createGame({playerDeck:PRESETS[0],aiDeck:PRESETS[1],seed:9,firstPlayer:0});for(const player of [0,1])s=applyAction(s,{type:'mulligan',player,cards:[]}).state;s.players[0].energy=s.players[0].maxEnergy=12;return s;}
let next=200;
function place(s,id,row='support',slot=0,extra={}){const c=CARD_MAP[id];const u={id:`qa-${next++}`,cardId:id,owner:0,attack:c.attack,health:c.health,maxHealth:c.health,opCost:c.opCost,keywords:[...c.keywords],row,slot,sick:false,moved:false,attacked:false,...extra};if(row==='support')s.players[0].support[slot]=u;else{s.front.owner=0;s.front.slots[slot]=u;}return u;}
function cast(s,id,target){const h={id:`qa-card-${next++}`,cardId:id};s.players[0].hand=[h];return applyAction(s,{type:'play',player:0,card:h.id,...(target?{target}:{})}).state;}
function cycle(s){s=applyAction(s,{type:'endTurn',player:0}).state;return applyAction(s,{type:'endTurn',player:1}).state;}
test('twelve signature units have distinct named mechanics',()=>{assert.equal(CARDS.filter(c=>c.signature).length,12);assert.equal(new Set(CARDS.filter(c=>c.signature).map(c=>c.signature)).size,12);});
test('proof grows per successful draw, fieldwork draws on advance and tower fortifies once',()=>{
 let s=base(),proof=place(s,'s-proof');s=cast(s,'s-night');assert.equal(findUnit(s,proof.id).attack,5);
 const field=place(s,'c-field','support',1);const hand=s.players[0].hand.length;s=applyAction(s,{type:'move',player:0,unit:field.id,slot:0}).state;assert.equal(s.players[0].hand.length,hand+1);
 const tower=place(s,'n-tower','support',3);s=applyAction(s,{type:'move',player:0,unit:tower.id,slot:1}).state;assert.equal(findUnit(s,tower.id).maxHealth,7);
});
test('editor draws only once per own turn and refresh event enables another attack',()=>{
 let s=base();place(s,'c-journal');const before=s.players[0].deck.length;s=cast(s,'n-break');assert.equal(s.players[0].deck.length,before-2);s=cast(s,'n-break');assert.equal(s.players[0].deck.length,before-3);
 const robot=place(s,'e-robot','front',0,{attacked:true});s=cast(s,'e-script',robot.id);assert.equal(findUnit(s,robot.id).attacked,false);assert.equal(findUnit(s,robot.id).attack,4);
 s=applyAction(s,{type:'attack',player:0,unit:robot.id,target:'hq:1'}).state;assert.equal(s.players[1].hq,16);
});
test('restoration heals adjacent allies and HQ; lake healing requires the unit itself at front',()=>{
 let s=base();place(s,'h-restore','support',1);const friend=place(s,'s-fresh','support',0,{health:1});s.players[0].hq=15;s=cycle(s);assert.equal(s.players[0].hq,16);assert.equal(findUnit(s,friend.id).health,2);
 s=base();const lake=place(s,'n-lake');s.players[0].hq=10;s=cycle(s);assert.equal(s.players[0].hq,10);s=applyAction(s,{type:'move',player:0,unit:lake.id,slot:0}).state;s=cycle(s);assert.equal(s.players[0].hq,12);
});
test('observatory rewards control, server buffs only assault units and lecture summons in crisis',()=>{
 let s=base();place(s,'s-stars');const tank=place(s,'e-robot','support',1);const ordinary=place(s,'s-fresh','front',0);place(s,'e-server','support',3);const deck=s.players[0].deck.length;s=cycle(s);assert.equal(s.players[0].deck.length,deck-2);assert.equal(findUnit(s,tank.id).attack,4);assert.equal(findUnit(s,ordinary.id).attack,1);
 s=base();s.players[0].hq=10;s.players[0].hand=[{id:'lecture',cardId:'h-lecture'}];s=applyAction(s,{type:'play',player:0,card:'lecture',slot:0}).state;assert.equal(allUnits(s,0).length,2);
});
test('old active matches are reset with a specific update notice, other saves survive',()=>{
 const map=new Map([['pkuards:v1:match',JSON.stringify({version:1})],['pkuards:v1:decks',JSON.stringify(PRESETS)]]);const store=createStorage({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)});
 assert.equal(store.loadMatch(),null);assert.match(store.warning(),/技能已升级/);assert.equal(store.loadDecks().length,4);
});
