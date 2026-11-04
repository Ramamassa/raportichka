import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const defaultRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
export function createServer(root = defaultRoot) {
  root = resolve(root);
  return http.createServer(async (req, res) => {
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405, {Allow:'GET, HEAD'}); res.end(); return; }
    let path;
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      path = resolve(root, '.' + pathname.replace(/\/$/, '/index.html'));
      if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    } catch { res.writeHead(400); res.end('Bad request'); return; }
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lan = process.argv.includes('--lan');
  const host = lan ? '0.0.0.0' : '127.0.0.1';
  const port = lan ? 8080 : 0;
  const server = createServer();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE'
      ? 'Порт 8080 уже занят. Если журнал уже запущен, используйте его окно. Другие программы автоматически не останавливаются.'
      : `Не удалось запустить сервер: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    const actualPort = server.address().port;
    console.log(`На компьютере: http://127.0.0.1:${actualPort}`);
    if (lan) {
      console.log('На телефоне (подключитесь к той же Wi-Fi-сети):');
      for (const addresses of Object.values(networkInterfaces())) {
        for (const address of addresses || []) {
          if (address.family === 'IPv4' && !address.internal && !address.address.startsWith('169.254.')) console.log(`http://${address.address}:${actualPort}`);
        }
      }
      console.log('Порт постоянный: 8080. Для постоянного IP закрепите адрес компьютера в роутере.');
      console.log('Оставьте это окно открытым. Остановка: Ctrl+C. Данные хранятся в браузере, не на сервере.');
    }
  });
}
