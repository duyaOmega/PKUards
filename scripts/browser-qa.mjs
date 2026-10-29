/** Real browser QA for a separate, user-authorized headless Edge instance. No packages. */
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createGame, applyAction } from '../web/engine.js';
import { PRESETS } from '../web/data.js';

const arg = (key, fallback) => { const i = process.argv.indexOf(key); return i < 0 ? fallback : process.argv[i + 1]; };
const base = arg('--base', 'http://localhost:4173/PKUards/');
const port = arg('--port', '9223');
const output = new URL('../artifacts/', import.meta.url); await mkdir(output, { recursive: true });
const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let nextId=1;const pending=new Map();const errors=[];
socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(new Error(JSON.stringify(m.error)));else p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+': '+(m.params.exceptionDetails.exception?.description||''));});
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=nextId++;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
const target=await send('Target.createTarget',{url:'about:blank'});
for(const tab of (await send('Target.getTargets')).targetInfos) if(tab.targetId!==target.targetId&&tab.type==='page'&&tab.url.startsWith(base))await send('Target.closeTarget',{targetId:tab.targetId});
const {sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
const cdp=(m,p={})=>send(m,p,sessionId);
const evaluate=async expression=>{const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(expression,timeout=12000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await delay(80);}throw new Error('Timed out: '+expression);}
async function reload(){const previous=await evaluate('performance.timeOrigin');await cdp('Page.reload');await until(`performance.timeOrigin!==${previous}&&document.readyState==='complete'`);}
async function click(selector){assert.ok(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`),selector);await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);}
async function point(selector){return evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing target');const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);}
async function drag(from,to){const a=await point(from),b=await point(to);await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...a});await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...a,button:'left',clickCount:1});for(let i=1;i<=8;i++){await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:a.x+(b.x-a.x)*i/8,y:a.y+(b.y-a.y)*i/8,buttons:1});await delay(20);}await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...b,button:'left',clickCount:1});}
async function shot(name){const {data}=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(new URL(name+'.png',output),Buffer.from(data,'base64'));}
const match=()=>evaluate(`JSON.parse(localStorage.getItem('pkuards:v1:match'))`);
const observeFeedback=()=>evaluate(`(()=>{window.__qaFeedback=[];new MutationObserver(()=>{const el=document.querySelector('.duel-cinema');if(!el)return;const phase=['reveal','aim','impact'].find(p=>el.classList.contains('cinema-'+p));window.__qaFeedback.push({phase,target:document.querySelector('.cinema-target-label')?.textContent,cardWidth:document.querySelector('.cinema-card')?.getBoundingClientRect().width||0,scrim:!!document.querySelector('.cinema-scrim')});}).observe(document.querySelector('#app'),{childList:true});})()`);
const saw=phase=>until(`window.__qaFeedback.some(f=>f.phase===${JSON.stringify(phase)})`);
await cdp('Page.enable');await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
await cdp('Page.navigate',{url:base});await until(`!!document.querySelector('.site-header')`);
await evaluate(`localStorage.removeItem('pkuards:v1:match');localStorage.removeItem('pkuards:v1:draft')`); await reload();await until(`!!document.querySelector('.hero')`);
await until(`[...document.querySelectorAll('.hero img')].every(i=>i.complete&&i.naturalWidth>0)`);
await shot('v12-home');
await click('[data-action="tutorial"]');for(let i=0;i<4;i++)await click('[data-action="tutorial-next"]');
await click('[data-action="route"][data-view="collection"]');await until(`document.querySelectorAll('.card-grid .game-card').length===64`);
const decoded=await evaluate(`(async()=>{const sources=[...new Set([...document.querySelectorAll('.card-grid .painted-art')].map(i=>i.src))];await Promise.all(sources.map(async src=>{const image=new Image();image.src=src;await image.decode();}));return sources.length;})()`);assert.equal(decoded,20,'all twenty paintings decode in Edge');
await shot('v12-collection');
let fixture=createGame({playerDeck:PRESETS[1],aiDeck:PRESETS[3],seed:124,firstPlayer:0});
for(const player of [0,1])fixture=applyAction(fixture,{type:'mulligan',player,cards:[]}).state;
fixture.players[0].maxEnergy=fixture.players[0].energy=12;
fixture.players[0].hand=[{id:'qa-robot-card',cardId:'e-robot'},{id:'qa-event-card',cardId:'n-break'}];
await evaluate(`localStorage.setItem('pkuards:v1:match',${JSON.stringify(JSON.stringify(fixture))})`); await reload();
await until(`!!document.querySelector('.battle-page')`);
await observeFeedback();
await drag('[data-action="hand"][data-id="qa-robot-card"]','[data-action="slot"][data-row="support"][data-owner="0"][data-slot="1"]');
await until(`!!document.querySelector('.duel-cinema')`);
assert.equal((await match()).players[0].energy,12,'reveal stage must not charge early');
await shot('v12-deploy-reveal');
await until(`!document.querySelector('.duel-cinema')`);
let state=await match();assert.equal(state.players[0].energy,9);const unit=state.players[0].support[1];assert.ok(unit);
await drag(`[data-action="unit"][data-id="${unit.id}"]`,'[data-action="slot"][data-row="front"][data-slot="0"]');
await saw('aim');await until(`!document.querySelector('.duel-cinema')`);
assert.equal((await match()).front.owner,0);
await drag(`[data-action="unit"][data-id="${unit.id}"]`,'[data-action="target"][data-id="hq:1"]');
await saw('aim');await saw('impact');
await until(`!document.querySelector('.duel-cinema')`);state=await match();assert.equal(state.players[1].hq,17);assert.equal(state.players[0].energy,7);
// A real AI decision: its targeted event should select the fragile frontline robot.
state.currentPlayer=1;state.players[1].energy=state.players[1].maxEnergy=5;state.players[1].hand=[{id:'qa-opponent-order',cardId:'c-question'}];
await evaluate(`localStorage.setItem('pkuards:v1:match',${JSON.stringify(JSON.stringify(state))})`); await reload();
await until(`!!document.querySelector('.battle-page')`);await observeFeedback();
await until(`!!document.querySelector('.cinema-reveal')`);assert.match(await evaluate(`document.querySelector('.cinema-heading').textContent`),/犀利提问/);assert.equal(await evaluate(`!!document.querySelector('.cinema-scrim')`),false);assert.ok(await evaluate(`document.querySelector('.cinema-card').getBoundingClientRect().width<=145`));await shot('v12-opponent-reveal');
await saw('aim');assert.ok(await evaluate(`window.__qaFeedback.some(f=>f.phase==='aim'&&f.target.includes('你的机器人小队'))`));
await saw('impact');await until(`!document.querySelector('.duel-cinema')`);
assert.ok(await evaluate(`window.__qaFeedback.every(f=>!f.scrim&&f.cardWidth<=145)`));
assert.equal((await match()).front.slots[0],null,'AI event removes exactly its shown target');
await click('[data-action="route"][data-view="home"]');
await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});await shot('v12-home-1280');
await click('[data-action="route"][data-view="battle"]');await shot('v12-battle-1280');
assert.ok(await evaluate(`document.querySelector('.hand-tray').getBoundingClientRect().bottom <= innerHeight`),'hand visible at 1280x720');
await cdp('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:false});await shot('v12-battle-1024');
assert.deepEqual(errors,[],'no browser runtime exceptions');
const report={browser:version.Browser,passed:true,decodedPaintings:decoded,handVisibleAt1280x720:true,checks:['20 paintings decoded in the browser','64-card collection','interactive tutorial','real pointer drag deployment','pre-impact fee remains unchanged','real pointer drag advance','real pointer drag attack','targeted AI card reveal','target label and retirement agree','1280x720 and 1024x768 screenshots'],runtimeErrors:errors};
await writeFile(new URL('browser-qa.json',output),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
await send('Target.closeTarget',{targetId:target.targetId});
if(process.argv.includes('--close-browser')) await send('Browser.close');
socket.close();
