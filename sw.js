const CACHE='raportichka-v12';
const ASSETS=['./','./index.html','./reference.css','./app.css','./app.js','./telegram.js','./model.js','./roster.js','./navigation.js','./excel.js','./vendor/exceljs.min.js','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/'))return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(hit=>hit||Response.error())));
});
