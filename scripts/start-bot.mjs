import { spawn,spawnSync } from 'node:child_process';
import { mkdir,access,writeFile,unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createBotSetup,loadBotSettings } from './telegram-setup.mjs';
import { createTelegramServer } from './telegram-server.mjs';
import { createBot } from './telegram-bot.mjs';
import { tunnelOptions,isExpectedAddress,safeNgrokError } from './start-journal.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
async function listen(server){await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});return `http://127.0.0.1:${server.address().port}`;}
function command(program,args){const result=spawnSync(program,args,{cwd:root,stdio:'inherit'});if(result.error||result.status!==0)throw new Error('Установка зависимостей или сборка не завершена.');}
async function main(){
  if(Number(process.versions.node.split('.')[0])<24)throw new Error('Нужен Node.js 24 или новее.');
  try{await access(resolve(root,'node_modules/exceljs/dist/exceljs.min.js'));await access(resolve(root,'node_modules/@ngrok/ngrok/index.js'));}
  catch{command(process.env.ComSpec||'cmd.exe',['/d','/c','npm ci --no-audit --no-fund']);}
  command(process.execPath,[resolve(root,'scripts/build.mjs')]);
  const runtime=resolve(root,'.journal-runtime');await mkdir(runtime,{recursive:true});
  const addressFile=resolve(runtime,'Telegram-Address.txt');await unlink(addressFile).catch(()=>{});
  const preview=process.argv.includes('--preview');
  let settings;
  if(!preview){
    const path=resolve(runtime,'telegram-settings.json');
    settings=process.argv.includes('--setup')?null:await loadBotSettings(path);
    if(!settings){
      const setup=createBotSetup(path);const address=await listen(setup);
      console.log(`НАСТРОЙКА БОТА: ${address}`);
      const configured=new Promise(ok=>setup.once('configured',ok));
      if(process.platform==='win32'){const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',address],{stdio:'ignore',windowsHide:true});child.on('error',()=>{});}
      settings=await configured;setup.close();
    }
  }
  const bot=preview?null:createBot(settings.botToken);
  const server=await createTelegramServer({root:resolve(root,'dist'),runtime,token:settings?.botToken,ownerId:settings?.ownerId,bot,preview});
  const address=await listen(server);console.log(`Локальный сервер: ${address}${preview?'/?preview=1':''}`);
  let tunnel;const abort=new AbortController();
  const stop=async()=>{abort.abort();await tunnel?.close().catch(()=>{});server.closeAllConnections();server.close();};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  if(preview){console.log('Только локальный просмотр. Telegram, API и сохранение на ноутбук отключены.');return;}
  try{
    const response=await fetch(address);await response.body?.cancel();if(!response.ok)throw new Error('Локальный сервер не отвечает.');
    await bot.call('getMe',{});
    const {default:ngrok}=await import('@ngrok/ngrok');
    try{tunnel=await ngrok.forward(tunnelOptions(address,settings));}catch(error){throw new Error(safeNgrokError(error).replaceAll('Start-Journal.cmd','Start-Bot.cmd'));}
    const url=tunnel.url();if(!isExpectedAddress(url,settings.domain))throw new Error('Получен неожиданный адрес туннеля.');
    await writeFile(addressFile,url+'\r\n');
    console.log('HTTPS подключён. Оставьте консоль открытой, ноутбук включённым и без сна.');
    await bot.run(settings.ownerId,url,abort.signal);
  }catch(error){await stop();throw error;}
}
main().catch(error=>{console.error('Запуск остановлен: '+error.message);process.exitCode=1;});
