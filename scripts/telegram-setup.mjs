import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
import { validateSettings as validateNgrok } from './journal-setup.mjs';
export function validateBotSettings(value){
  if(!/^\d{5,16}:[A-Za-z0-9_-]{30,80}$/.test(value?.botToken||''))throw new Error('Проверьте токен BotFather.');
  if(!/^[1-9]\d{3,15}$/.test(String(value.ownerId||'')))throw new Error('Укажите числовой Telegram ID владельца.');
  const ngrok=validateNgrok(value);
  return {...ngrok,botToken:value.botToken,ownerId:String(value.ownerId)};
}
export async function loadBotSettings(path){
  try{return validateBotSettings(JSON.parse(await readFile(path,'utf8')));}
  catch(error){if(error.code==='ENOENT')return null;throw new Error('Настройки повреждены. Запустите Start-Bot.cmd --setup.');}
}
export function createBotSetup(path){
  const csrf=randomBytes(32).toString('hex');
  const server=http.createServer(async(req,res)=>{
    const origin=`http://127.0.0.1:${req.socket.localPort}`;
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
    if(req.headers.host!==new URL(origin).host){res.writeHead(403).end();return;}
    if(req.method==='GET'&&req.url==='/'){
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Рапортичка · Telegram</title><style>body{font:17px/1.6 Georgia;background:#211c18;color:#f1e7d8;max-width:640px;margin:24px auto;padding:24px}h1{font-size:28px}input,button{display:block;width:100%;box-sizing:border-box;min-height:44px;padding:12px;margin:8px 0 20px;border:1px solid #80705f;border-radius:10px;background:#2b241f;color:inherit;font:inherit}button{background:#dec18b;color:#30271f;cursor:pointer}a{color:#dec18b}small{display:block;color:#b9a997}</style><h1>Рапортичка в Telegram</h1><p>Однократная настройка. Секреты вводите только здесь, не в чате.</p><ol><li>В официальном <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> выполните /newbot и получите токен нового бота.</li><li>Укажите свой числовой Telegram ID (например, из @userinfobot). Только этот аккаунт получит доступ.</li><li>В бесплатном аккаунте <a href="https://dashboard.ngrok.com" target="_blank" rel="noreferrer">ngrok</a> скопируйте Authtoken и домен из Domains. Telegram не размещает веб-интерфейс, поэтому HTTPS-туннель всё ещё нужен.</li></ol><form action="/save" method="post"><input type="hidden" name="csrf" value="${csrf}"><label>Токен нового бота<input name="botToken" type="password" required autocomplete="off" maxlength="100"></label><label>Ваш Telegram ID<input name="ownerId" required inputmode="numeric" pattern="[0-9]+" maxlength="16"></label><label>ngrok Authtoken<input name="token" type="password" required autocomplete="off" maxlength="256"></label><label>Постоянный домен ngrok<input name="domain" required placeholder="ваш-адрес.ngrok-free.app" maxlength="253" autocapitalize="none" spellcheck="false"></label><button>Сохранить и запустить бота</button></form><small>Настройки находятся в .journal-runtime/telegram-settings.json, данные — в attendance.json. Не передавайте папку .journal-runtime другим людям. Токен хранится локально без шифрования; используйте защищённую учётную запись Windows. Старый сайт на этом домене одновременно запускать нельзя.</small></html>`);return;
    }
    if(req.method!=='POST'||req.url!=='/save'){res.writeHead(404).end();return;}
    if(req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')){res.writeHead(403).end();return;}
    try{
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096){res.writeHead(413).end();return;}}
      const fields=new URLSearchParams(body);if(fields.get('csrf')!==csrf){res.writeHead(403).end();return;}
      const settings=validateBotSettings(Object.fromEntries(fields));
      await writeFile(path,JSON.stringify(settings),{mode:0o600});
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<meta charset="utf-8"><h1>Настройки сохранены</h1><p>Вернитесь в консоль. Дождитесь сообщения «БОТ ПОДКЛЮЧЁН», затем отправьте боту /start.</p>');
      server.emit('configured',settings);
    }catch{res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'}).end('Не удалось сохранить. Проверьте токены, ID, домен и доступ к диску. Вернитесь назад и повторите.');}
  });return server;
}
