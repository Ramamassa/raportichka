import { verifyTelegram } from '../scripts/telegram-auth.mjs';
import { getBody, sendJson } from './_http.js';

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

  const token = process.env.BOT_TOKEN;
  const ownerId = process.env.OWNER_ID;

  const initData = req.headers?.['x-telegram-init-data'];
  try {
    if (!token || !ownerId) throw new Error();
    verifyTelegram(initData, token, ownerId);
  } catch {
    return sendJson(res, 401, {
      error: 'Откройте приложение заново через своего бота. Доступ разрешён только владельцу.'
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

  try {
    const raw = await getBody(req, 5_000_000);
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    const filename = contentType === 'application/json' ? 'Рапортичка.json' : 'Ведомость.xlsx';

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

    return sendJson(res, 200, { ok: true });
  } catch {
    return sendJson(res, 500, {
      error: 'Не удалось отправить файл в Telegram. Попробуйте ещё раз.'
    });
  }
}
