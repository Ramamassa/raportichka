import { getBody, sendJson } from './_http.js';
import { isAuthorized } from './_auth.js';

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    if (typeof res.setHeader === 'function') {
      res.setHeader('Allow', 'POST, OPTIONS');
    }
    if (typeof res.status === 'function') {
      return res.status(204).end();
    }
    res.writeHead(204, { Allow: 'POST, OPTIONS' });
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const auth = isAuthorized(req);
  if (!auth.ok) {
    return sendJson(res, 401, {
      error: 'Доступ закрыт. Откройте приложение через своего бота в Telegram или введите пароль старосты.'
    });
  }

  const contentType = (req.headers['content-type'] || '').split(';')[0];
  const allowed = [
    'application/json',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  if (!allowed.includes(contentType)) {
    return sendJson(res, 415, { error: 'Неподдерживаемый формат файла' });
  }

  const token = process.env.BOT_TOKEN;
  const ownerId = process.env.OWNER_ID;

  try {
    const raw = await getBody(req, 5_000_000);
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    const filename = contentType === 'application/json' ? 'Рапортичка.json' : 'Ведомость.xlsx';

    // If bot token and owner ID are present, send document to Telegram chat
    if (token && ownerId) {
      const form = new FormData();
      form.set('chat_id', String(ownerId));
      form.set('document', new Blob([buffer], { type: contentType }), filename);

      const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
        method: 'POST',
        body: form
      });
      const tgData = await tgRes.json();
      if (!tgData.ok) {
        throw new Error(tgData.description || 'Telegram API error');
      }
    }

    return sendJson(res, 200, { ok: true });
  } catch {
    return sendJson(res, 500, {
      error: 'Не удалось отправить файл в Telegram. Попробуйте ещё раз.'
    });
  }
}
