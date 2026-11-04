import { getBody, sendJson } from './_http.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      service: 'Рапортичка Telegram Webhook',
      status: 'active'
    });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  // Validate webhook secret token if configured
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (webhookSecret) {
    const receivedSecret = req.headers?.['x-telegram-bot-api-secret-token'];
    if (receivedSecret !== webhookSecret) {
      return sendJson(res, 403, { error: 'Unauthorized webhook request' });
    }
  }

  const token = process.env.BOT_TOKEN;
  const ownerId = process.env.OWNER_ID;

  if (!token) {
    return sendJson(res, 500, { error: 'BOT_TOKEN is not configured' });
  }

  try {
    const raw = await getBody(req);
    const update = typeof raw === 'string' ? JSON.parse(raw) : (Buffer.isBuffer(raw) ? JSON.parse(raw.toString('utf8')) : raw);
    const msg = update?.message;

    if (msg && msg.chat && msg.chat.type === 'private') {
      const fromId = String(msg.from?.id || '');
      const chatId = msg.chat.id;

      // Check if from owner
      if (ownerId && fromId !== String(ownerId)) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: 'Доступ закрыт. Это личное приложение старосты.'
          })
        }).catch(() => {});
        return sendJson(res, 200, { ok: true });
      }

      // Owner message
      const text = (msg.text || '').trim();
      const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'localhost';
      const proto = req.headers?.['x-forwarded-proto'] || 'https';
      const appUrl = process.env.APP_URL || `${proto}://${host}`;

      if (/^\/(start|app|help)(?:@\w+)?(?:\s|$)/.test(text) || text === 'Рапортичка') {
        // Configure chat menu button for quick access
        await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: Number(chatId),
            menu_button: {
              type: 'web_app',
              text: 'Рапортичка',
              web_app: { url: appUrl }
            }
          })
        }).catch(() => {});

        // Send welcome message with button
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: '📋 Рапортичка\n\nОтметки, ведомость и состав группы — в мини-приложении. Данные надёжно сохраняются в облаке.\n\nНажмите кнопку ниже или используйте кнопку меню в левом нижнем углу чата.',
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Открыть Рапортичку', web_app: { url: appUrl } }]
              ]
            }
          })
        });
      } else {
        // Any other message from owner
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: 'Чтобы открыть приложение, нажмите кнопку ниже:',
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Открыть Рапортичку', web_app: { url: appUrl } }]
              ]
            }
          })
        }).catch(() => {});
      }
    }

    return sendJson(res, 200, { ok: true });
  } catch {
    return sendJson(res, 500, { error: 'Failed to process update' });
  }
}
