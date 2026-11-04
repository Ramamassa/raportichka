import { randomBytes } from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log('========================================================');
  console.log('   Настройка Telegram Webhook для Рапортички на Vercel');
  console.log('========================================================\n');

  const envToken = process.env.BOT_TOKEN;
  const envOwnerId = process.env.OWNER_ID;
  const envAppUrl = process.env.APP_URL;
  const envSecret = process.env.WEBHOOK_SECRET;

  const botToken = (envToken || await rl.question('1. Токен бота из @BotFather (BOT_TOKEN): ')).trim();
  if (!botToken || !botToken.includes(':')) {
    console.error('Ошибка: неверный формат токена бота.');
    process.exit(1);
  }

  const ownerId = (envOwnerId || await rl.question('2. Ваш числовой Telegram ID (OWNER_ID, из @userinfobot): ')).trim();
  if (!ownerId || !/^\d+$/.test(ownerId)) {
    console.error('Ошибка: Telegram ID должен состоять только из цифр.');
    process.exit(1);
  }

  let appUrl = (envAppUrl || await rl.question('3. URL вашего проекта на Vercel (например, https://raportichka.vercel.app): ')).trim();
  if (!appUrl.startsWith('http://') && !appUrl.startsWith('https://')) {
    appUrl = 'https://' + appUrl;
  }
  appUrl = appUrl.replace(/\/$/, '');

  const webhookSecret = (envSecret || randomBytes(24).toString('hex')).trim();

  rl.close();

  const webhookUrl = `${appUrl}/api/webhook`;
  console.log(`\nПодключение Webhook к Telegram (${webhookUrl})...`);

  // 1. setWebhook
  const setRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ['message'],
      drop_pending_updates: true
    })
  });
  const setData = await setRes.json();
  if (!setData.ok) {
    console.error('Ошибка установки webhook в Telegram:', setData.description);
    process.exit(1);
  }
  console.log('✓ Webhook успешно установлен в Telegram!');

  // 2. setChatMenuButton for owner
  const menuRes = await fetch(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: Number(ownerId),
      menu_button: {
        type: 'web_app',
        text: 'Рапортичка',
        web_app: { url: appUrl }
      }
    })
  });
  const menuData = await menuRes.json();
  if (menuData.ok) {
    console.log('✓ Кнопка меню «Рапортичка» настроена для вашего чата!');
  }

  // 3. getMe
  const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const meData = await meRes.json();
  const username = meData.result?.username;

  console.log('\n========================================================');
  console.log('               УСПЕШНО НАСТРОЕНО!');
  console.log(`Бот: @${username}`);
  console.log(`Адрес Web App: ${appUrl}`);
  console.log('========================================================\n');
  console.log('Убедитесь, что в Vercel (Settings -> Environment Variables) заданы переменные:');
  console.log(`BOT_TOKEN = ${botToken}`);
  console.log(`OWNER_ID = ${ownerId}`);
  console.log(`WEBHOOK_SECRET = ${webhookSecret}`);
  console.log(`APP_URL = ${appUrl}`);
  console.log('\nТеперь откройте своего бота в Telegram и отправьте команду /start !');
}

main().catch(err => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
