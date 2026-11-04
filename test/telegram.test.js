import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyTelegram } from '../scripts/telegram-auth.mjs';
import { createTelegramServer } from '../scripts/telegram-server.mjs';
import { initialState,setAbsence } from '../model.js';
import { validateBotSettings } from '../scripts/telegram-setup.mjs';
const token='123456789:'+ 'x'.repeat(35), ownerId='123456789';
function signed(user=ownerId,time=Math.floor(Date.now()/1000)){
 const data=new URLSearchParams({auth_date:String(time),user:JSON.stringify({id:Number(user)}),query_id:'test'});
 const check=[...data.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 data.set('hash',createHmac('sha256',secret).update(check).digest('hex'));return data.toString();
}
test('Telegram signatures, expiry and owner authorization',()=>{
 assert.equal(verifyTelegram(signed(),token,ownerId).id,Number(ownerId));
 assert.throws(()=>verifyTelegram(signed()+'x',token,ownerId));
 assert.throws(()=>verifyTelegram(signed('999999999'),token,ownerId));
 assert.throws(()=>verifyTelegram(signed(ownerId,1),token,ownerId));
 assert.throws(()=>verifyTelegram(signed(ownerId,Math.floor(Date.now()/1000)+120),token,ownerId));
 assert.throws(()=>verifyTelegram(signed()+'&user=x',token,ownerId));
 assert.throws(()=>validateBotSettings({botToken:'wrong'}));
});
test('Authorized state saves survive restart, conflicts and invalid states do not overwrite; export is private',async()=>{
 const runtime=await mkdtemp(join(tmpdir(),'raportichka-'));
 const sent=[];
 const options={root:new URL('../dist',import.meta.url).pathname,runtime,token,ownerId,bot:{sendFile:async(...args)=>sent.push(args)}};
 let server;
 async function start(){server=await createTelegramServer(options);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));return `http://127.0.0.1:${server.address().port}`;}
 async function stop(){server.closeAllConnections();await new Promise(ok=>server.close(ok));}
 try{
  let url=await start();
  assert.equal((await fetch(url+'/api/state')).status,401);
  assert.equal((await fetch(url+'/api/state',{headers:{'X-Telegram-Init-Data':signed('999999999')}})).status,401);
  const headers={'X-Telegram-Init-Data':signed(),'Content-Type':'application/json'};
  let response=await fetch(url+'/api/state',{headers});assert.equal(response.status,200);
  const loaded=await response.json();assert.equal(loaded.revision,0);
  const state=initialState();setAbsence(state,'2026-11-04',1,state.students[0].id,true);
  const save=revision=>fetch(url+'/api/state',{method:'PUT',headers,body:JSON.stringify({state,revision})});
  assert.equal((await save(0)).status,200);
  assert.equal((await save(0)).status,409);
  assert.equal((await fetch(url+'/api/state',{method:'PUT',headers,body:JSON.stringify({state:{bad:true},revision:1})})).status,400);
  assert.equal(JSON.parse(await readFile(join(runtime,'attendance.json'),'utf8')).state.marks['2026-11-04'][1].length,1);
  const parallel=await Promise.all([save(1),save(1)]);assert.deepEqual(parallel.map(r=>r.status).sort(),[200,409]);
  assert.equal((await fetch(url+'/api/export',{method:'POST',headers,body:'{}'})).status,200);
  assert.equal(sent.length,1);assert.equal(sent[0][0],ownerId);
  await stop();url=await start();
  response=await fetch(url+'/api/state',{headers});const restored=await response.json();
  assert.equal(restored.revision,2);assert.deepEqual(restored.state.marks,state.marks);
 }finally{if(server.listening)await stop();await rm(runtime,{recursive:true,force:true});}
});
