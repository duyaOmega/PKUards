import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { CARDS } from '../web/data.js';
import { PAINTED_MOTIFS, illustration } from '../web/art.js';
test('every card resolves to art; all 31 small WebP assets are valid and cached offline', async()=>{
 assert.equal(PAINTED_MOTIFS.length,31);
 const worker=await readFile(new URL('../web/sw.js',import.meta.url),'utf8');
 for(const c of CARDS){assert.ok(PAINTED_MOTIFS.includes(c.art),c.id);assert.match(illustration(c.art),/assets\/art\//);}
 for(const id of PAINTED_MOTIFS){const url=new URL(`../web/assets/art/${id}.webp`,import.meta.url),data=await readFile(url);assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');assert.ok((await stat(url)).size<256*1024,id);assert.ok(worker.includes(`'${id}'`),id+' is in the offline cache');}
});
