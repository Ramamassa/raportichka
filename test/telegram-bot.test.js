import test from 'node:test';
import assert from 'node:assert/strict';
import {createBot} from '../scripts/telegram-bot.mjs';

test('Bot polling only offers Mini App to owner; documents are addressed to owner',async()=>{
 const original=global.fetch, calls=[], abort=new AbortController();
 global.fetch=async(url,options)=>{
  const method=url.split('/').at(-1);const body=options.body instanceof FormData?options.body:JSON.parse(options.body);
  calls.push({method,body});let result=true;
  if(method==='getMe')result={username:'test_bot'};
  if(method==='getUpdates')result=[
   {update_id:1,message:{chat:{id:888,type:'private'},from:{id:888},text:'/start'}},
   {update_id:2,message:{chat:{id:123456789,type:'private'},from:{id:123456789},text:'/start'}}
  ];
  if(method==='sendMessage')abort.abort();
  return {json:async()=>({ok:true,result})};
 };
 try{
  const bot=createBot('test-not-a-real-token');await bot.run('123456789','https://example.ngrok-free.app',abort.signal);
  const messages=calls.filter(c=>c.method==='sendMessage');assert.equal(messages.length,1);
  assert.equal(messages[0].body.chat_id,123456789);
  assert.equal(messages[0].body.reply_markup.inline_keyboard[0][0].web_app.url,'https://example.ngrok-free.app');
  await bot.sendFile('123456789',Buffer.from('{}'),'backup.json','application/json');
  const file=calls.find(c=>c.method==='sendDocument');assert.equal(file.body.get('chat_id'),'123456789');
 }finally{global.fetch=original;}
});
test('Bot API errors never expose credential-bearing URLs',async()=>{
 const original=global.fetch;global.fetch=async()=>{throw new Error('https://api.telegram.org/botSECRET/getMe');};
 try{await assert.rejects(createBot('SECRET').call('getMe',{}),e=>!e.message.includes('SECRET'));}
 finally{global.fetch=original;}
});
