import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';

export function validateSettings(value) {
  if (!value || typeof value.token !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/.test(value.token)) throw new Error('Вставьте Authtoken из личного кабинета ngrok.');
  const domain = String(value.domain || '').trim().toLowerCase().replace(/^https:\/\//, '').replace(/\/$/, '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:ngrok-free\.app|ngrok-free\.dev|ngrok\.app|ngrok\.dev)$/.test(domain)) throw new Error('Укажите выданный ngrok домен, без пути и номера порта.');
  return { token: value.token, domain };
}
export async function loadSettings(path) {
  try { return validateSettings(JSON.parse(await readFile(path, 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error('Настройки подключения повреждены. Запустите Start-Journal.cmd с параметром --setup.'); }
}
export function createSetupServer(path) {
  const csrf = randomBytes(32).toString('hex');
  const server = http.createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${req.socket.localPort}`;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.headers.host !== new URL(origin).host) { res.writeHead(403).end(); return; }
    if (req.method === 'GET' && req.url === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Подключение Рапортички</title><style>body{font:18px Georgia;background:#211e1a;color:#eee3d2;max-width:640px;margin:40px auto;padding:20px;line-height:1.6}input,button{box-sizing:border-box;width:100%;padding:12px;margin:8px 0 20px;border-radius:12px;border:1px solid #8e8068;background:#302b24;color:inherit;font:inherit}button{background:#c5ab7e;color:#211e1a;cursor:pointer}a{color:#dec598}small{display:block}</style><h1>Рапортичка: первый запуск</h1><p>Один раз привяжите бесплатный аккаунт ngrok. После этого сайт запускается только открытием Start-Journal.cmd.</p><ol><li><a href="https://dashboard.ngrok.com/signup" target="_blank" rel="noreferrer">Создайте бесплатный аккаунт</a>. Платный тариф и покупка домена не нужны.</li><li>Скопируйте <a href="https://dashboard.ngrok.com/get-started/your-authtoken" target="_blank" rel="noreferrer">Authtoken</a> в поле ниже. Не отправляйте его в чат.</li><li>Скопируйте свой бесплатный адрес со страницы <a href="https://dashboard.ngrok.com/domains" target="_blank" rel="noreferrer">Domains</a>.</li></ol><form method="post" action="/save"><input type="hidden" name="csrf" value="${csrf}"><label>Authtoken<input name="token" type="password" required autocomplete="off" maxlength="256"></label><label>Ваш постоянный домен<input name="domain" placeholder="ваш-адрес.ngrok-free.app" required maxlength="253" autocapitalize="none" spellcheck="false"></label><button>Сохранить и запустить сайт</button></form><small>Настройки сохраняются только в .journal-runtime/ngrok-settings.json на ноутбуке. Не передавайте эту папку другим. ngrok обслуживает интернет-соединение; отметки по-прежнему хранятся в браузере телефона.</small></html>`);
      return;
    }
    if (req.method !== 'POST' || req.url !== '/save') { res.writeHead(404).end(); return; }
    if (req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) { res.writeHead(403).end(); return; }
    try {
      let body = '';
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 4096) { res.writeHead(413).end(); return; } }
      const fields = new URLSearchParams(body);
      if (fields.get('csrf') !== csrf) { res.writeHead(403).end(); return; }
      const settings = validateSettings({ token: fields.get('token'), domain: fields.get('domain') });
      await writeFile(path, JSON.stringify(settings), { mode: 0o600 });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<meta charset="utf-8"><h1>Настройки сохранены</h1><p>Вернитесь в окно запуска. Дождитесь сообщения «САЙТ ПОДКЛЮЧЁН» и откройте напечатанную ссылку на телефоне. При ошибке подключения причина будет в окне запуска.</p>');
      server.emit('configured', settings);
    } catch { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Не удалось сохранить. Проверьте Authtoken и домен, вернитесь назад и повторите.'); }
  });
  return server;
}
