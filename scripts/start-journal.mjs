import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from './serve.mjs';
import { createSetupServer, loadSettings } from './journal-setup.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = resolve(root, '.journal-runtime');
async function exists(path) { try { await access(path); return true; } catch { return false; } }
function command(program, args) {
  const result = spawnSync(program, args, { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('Не удалось установить зависимости или собрать сайт. Проверьте сообщения выше.');
}
function openBrowser(url) {
  if (process.platform === 'win32') {
    const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { stdio: 'ignore', windowsHide: true });
    child.on('error', () => console.log('Откройте адрес настройки вручную в браузере.'));
  }
}
async function listen(server) {
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  return `http://127.0.0.1:${server.address().port}`;
}
// Use an explicit IPv4 socket address, never ngrok's localhost:80 default.
export function tunnelOptions(local, settings) {
  const url = new URL(local);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('Некорректный адрес локального сервера.');
  }
  return { addr: url.host, authtoken: settings.token, domain: settings.domain };
}
export function isExpectedAddress(address, domain) {
  try {
    const url = new URL(address);
    return url.protocol === 'https:' && url.hostname === domain && !url.port && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}
export function safeNgrokError(error) {
  // Only a strictly whitelisted error code can leave the SDK boundary.
  const code = String(error?.errorCode || '').match(/^ERR_NGROK_\d{1,8}$/)?.[0]
    || String(error?.message || '').match(/\bERR_NGROK_\d{1,8}\b/)?.[0];
  if (code === 'ERR_NGROK_334') return 'ngrok не подключился (ERR_NGROK_334): постоянный адрес уже занят другой сессией. Закройте прежнее окно ngrok/Рапортички, использующее этот домен (в том числе на другом компьютере), и запустите Start-Journal.cmd снова. Активные агенты: https://dashboard.ngrok.com/agents. Повторная настройка токена не нужна.';
  return `ngrok не подключился${code ? ` (${code})` : ''}. Проверьте интернет, Authtoken, домен и лимиты аккаунта. Для повторной настройки: Start-Journal.cmd --setup. Секреты и сырые ошибки SDK не выводятся.`;
}
async function main() {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Установите Node.js 24 или новее: https://nodejs.org/');
  await mkdir(runtime, { recursive: true });
  const addressFile = resolve(runtime, 'Internet-Address.txt');
  const settingsFile = resolve(runtime, 'ngrok-settings.json');
  await unlink(addressFile).catch(() => {});
  if (!await exists(resolve(root, 'node_modules/exceljs/dist/exceljs.min.js')) || !await exists(resolve(root, 'node_modules/@ngrok/ngrok/index.js'))) {
    command(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'npm ci --no-audit --no-fund']);
  }
  command(process.execPath, [resolve(root, 'scripts/build.mjs')]);
  const localOnly = process.argv.includes('--local-only');
  let settings;
  if (!localOnly) {
    settings = process.argv.includes('--setup') ? null : await loadSettings(settingsFile);
    if (!settings) {
      const setup = createSetupServer(settingsFile);
      const url = await listen(setup);
      console.log(`ПЕРВЫЙ ЗАПУСК: откройте ${url} и привяжите бесплатный аккаунт ngrok.`);
      const configured = new Promise(resolve => setup.once('configured', resolve));
      openBrowser(url);
      const closeSetup = () => setup.close();
      process.once('SIGINT', closeSetup);
      process.once('SIGTERM', closeSetup);
      settings = await configured;
      setup.close();
      process.removeListener('SIGINT', closeSetup);
      process.removeListener('SIGTERM', closeSetup);
    }
  }
  const server = createServer();
  const local = await listen(server);
  console.log(`На компьютере: ${local}`);
  let listener, stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    await unlink(addressFile).catch(() => {});
    await listener?.close().catch(() => {});
    server.close();
  }
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  if (localOnly) { console.log('Локальная проверка: доступ из интернета не включён. Остановка: Ctrl+C.'); return; }
  let stage = 'Проверка локального сервера';
  try {
    const options = tunnelOptions(local, settings);
    const response = await fetch(local, { signal: AbortSignal.timeout(5000) });
    await response.body?.cancel();
    if (!response.ok) throw new Error('local HTTP check failed');
    console.log(`Локальный сервер отвечает. Адрес для ngrok: ${options.addr}`);
    stage = 'Подключение ngrok';
    const { default: ngrok } = await import('@ngrok/ngrok');
    console.log('Подключение постоянного HTTPS-адреса. Дождитесь подтверждения.');
    listener = await ngrok.forward(options);
    if (stopping) { await listener.close(); return; }
    stage = 'Проверка выданного HTTPS-адреса';
    const address = listener.url();
    if (!isExpectedAddress(address, settings.domain)) throw new Error('unexpected address');
    stage = 'Сохранение ссылки';
    await writeFile(addressFile, `${address}\r\nРаботает, пока открыто окно запуска и ноутбук подключён к интернету.\r\n`);
    console.log(`\nСАЙТ ПОДКЛЮЧЁН. ССЫЛКА ДЛЯ ТЕЛЕФОНА: ${address}`);
    console.log('Адрес сохранён в .journal-runtime/Internet-Address.txt и останется тем же при следующем запуске.');
    console.log('Оставьте это окно открытым. Ноутбук не должен засыпать. Остановка: Ctrl+C.');
    console.log('Отметки хранятся в браузере телефона. Регулярно сохраняйте JSON-копию во вкладке «Группа».');
    console.log('На бесплатном ngrok иногда нужно нажать Visit Site перед открытием сайта.');
  } catch (error) {
    await stop();
    // SDK errors may contain credentials; never echo them into chat or logs.
    throw new Error(`${stage}: ${safeNgrokError(error)}`);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Не удалось запустить Рапортичку: ${error.message}`); process.exitCode = 1; });
}
