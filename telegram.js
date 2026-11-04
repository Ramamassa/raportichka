const tg=window.Telegram?.WebApp;
const active=!!tg?.initData;
let revision=0, pending=null, sending=false, failed=false;
let status=()=>{};
export function onSyncStatus(fn){status=fn;}
async function api(path,options={}){
  let response;
  try{response=await fetch(path,{...options,signal:AbortSignal.timeout(30000),headers:{...options.headers,'X-Telegram-Init-Data':tg.initData}});}
  catch{throw new Error('Нет связи с сервером. Проверьте интернет; изменения пока не подтверждены сервером.');}
  const data=await response.json();
  if(!response.ok)throw new Error(data.error || 'Нет связи с сервером.');
  return data;
}
export async function loadTelegramState(){
  if(!active){
    const preview=location.hostname==='127.0.0.1' && new URLSearchParams(location.search).get('preview')==='1';
    if(preview)return null;
    throw new Error('Откройте «Рапортичку» кнопкой в своём Telegram-боте.');
  }
  tg.ready();tg.expand();
  if(tg.isVersionAtLeast('7.7'))tg.disableVerticalSwipes();
  const insets=()=>{
    document.documentElement.style.setProperty('--tg-bottom',`${tg.safeAreaInset?.bottom||0}px`);
    document.documentElement.style.setProperty('--tg-top',`${(tg.safeAreaInset?.top||0)+(tg.contentSafeAreaInset?.top||0)}px`);
  };
  insets();tg.onEvent('safeAreaChanged',insets);tg.onEvent('contentSafeAreaChanged',insets);
  const data=await api('/api/state');revision=data.revision;return data.state;
}
export function queueTelegramSave(state){
  if(!active)return;
  pending=structuredClone(state);failed=false;
  if(tg.isVersionAtLeast('6.2'))tg.enableClosingConfirmation();
  status('Сохранение в облако…');drain();
}
async function drain(){
  if(sending||!pending)return;
  sending=true;const snapshot=pending;pending=null;
  try{
    const data=await api('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:snapshot,revision})});
    revision=data.revision;
    if(!pending){status('Сохранено в облаке');if(tg.isVersionAtLeast('6.2'))tg.disableClosingConfirmation();}
  }catch(error){
    // Retain newest local draft. Do not overwrite a newer server revision on conflict.
    pending=pending||snapshot;failed=true;status(error.message,true);
  }finally{sending=false;if(pending&&!failed)drain();}
}
export function retryTelegramSave(){failed=false;drain();}
window.addEventListener('online',()=>{if(pending&&!failed)drain();});
window.addEventListener('beforeunload',event=>{if(pending||sending){event.preventDefault();event.returnValue='';}});
export async function telegramDownload(blob){
  if(!active)return false;
  await api('/api/export',{method:'POST',headers:{'Content-Type':blob.type},body:blob});
  return true;
}
export const telegramActive=active;
