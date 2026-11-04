import http from 'node:http';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer as createStatic } from './serve.mjs';
import { verifyTelegram } from './telegram-auth.mjs';
import { initialState, validateState } from '../model.js';

async function body(req, limit) {
  const chunks=[];let size=0;
  for await (const chunk of req) { size+=chunk.length;if(size>limit)throw new Error('Too large');chunks.push(chunk); }
  return Buffer.concat(chunks);
}
export async function createTelegramServer({root, runtime, token, ownerId, bot, preview=false}) {
  await mkdir(runtime,{recursive:true});
  const file=resolve(runtime,'attendance.json');
  let state=initialState(), revision=0;
  try { const saved=JSON.parse(await readFile(file,'utf8'));state=validateState(saved.state);revision=saved.revision;if(!Number.isSafeInteger(revision)||revision<0)throw new Error(); }
  catch(e) { if(e.code!=='ENOENT')throw new Error('Хранилище повреждено. Исходный файл не перезаписан. Восстановите резервную копию attendance.json.'); }
  const staticServer=createStatic(root);
  let writing=false;
  return http.createServer(async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    if(!path.startsWith('/api/')) {
      // Preview intentionally has no Telegram runtime. Do not request the remote SDK there.
      if(preview && req.method==='GET' && (path==='/'||path==='/index.html')){
        const html=await readFile(resolve(root,'index.html'),'utf8');
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
        res.end(html.replace('<script src="https://telegram.org/js/telegram-web-app.js"></script>',''));return;
      }
      staticServer.emit('request',req,res);return;
    }
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options','nosniff');
    const reply=(code,value)=>{res.writeHead(code);res.end(JSON.stringify(value));};
    // Local preview has no API access and never bypasses Telegram authorization.
    try { if(preview)throw new Error();verifyTelegram(req.headers['x-telegram-init-data'],token,ownerId); }
    catch {reply(401,{error:'Откройте приложение заново через своего бота. Доступ разрешён только владельцу.'});return;}
    try {
      if(path==='/api/state' && req.method==='GET') {reply(200,{state,revision});return;}
      if(path==='/api/state' && req.method==='PUT') {
        const incoming=JSON.parse((await body(req,5_000_000)).toString('utf8'));
        const next=validateState(incoming.state);
        if(writing || incoming.revision!==revision){reply(409,{error:'Данные изменены в другом окне. Скачайте копию несохранённых изменений и откройте приложение заново.'});return;}
        writing=true;
        try {
          const record={state:next,revision:revision+1};
          await writeFile(file+'.tmp',JSON.stringify(record),{mode:0o600});
          await rename(file+'.tmp',file);
          state=next;revision=record.revision;reply(200,{revision});
        } finally {writing=false;}
        return;
      }
      if(path==='/api/export' && req.method==='POST') {
        const type=req.headers['content-type']?.split(';')[0];
        if(!['application/json','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(type)){reply(415,{error:'Неподдерживаемый формат'});return;}
        const bytes=await body(req,5_000_000);
        await bot.sendFile(ownerId,bytes,type==='application/json'?'Рапортичка.json':'Ведомость.xlsx',type);
        reply(200,{ok:true});return;
      }
      reply(404,{error:'Not found'});
    }catch {reply(400,{error:'Не удалось выполнить запрос. Проверьте данные, свободное место на диске и связь с Telegram.'});}
  });
}
