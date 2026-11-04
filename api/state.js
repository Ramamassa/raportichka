import { verifyTelegram } from '../scripts/telegram-auth.mjs';
import { validateState } from '../model.js';
import { getState, saveState } from './_storage.js';
import { getBody, sendJson } from './_http.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    if (typeof res.setHeader === 'function') {
      res.setHeader('Allow', 'GET, PUT, OPTIONS');
    }
    if (typeof res.status === 'function') {
      return res.status(204).end();
    }
    res.writeHead(204, { Allow: 'GET, PUT, OPTIONS' });
    res.end();
    return;
  }

  const token = process.env.BOT_TOKEN;
  const ownerId = process.env.OWNER_ID;

  // Authorization check
  const initData = req.headers?.['x-telegram-init-data'];
  try {
    if (!token || !ownerId) {
      throw new Error('Credentials not configured');
    }
    verifyTelegram(initData, token, ownerId);
  } catch {
    return sendJson(res, 401, {
      error: 'Откройте приложение заново через своего бота. Доступ разрешён только владельцу.'
    });
  }

  if (req.method === 'GET') {
    try {
      const data = await getState();
      return sendJson(res, 200, data);
    } catch {
      return sendJson(res, 500, { error: 'Не удалось загрузить данные из хранилища.' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const raw = await getBody(req);
      const incoming = typeof raw === 'string' ? JSON.parse(raw) : (Buffer.isBuffer(raw) ? JSON.parse(raw.toString('utf8')) : raw);
      const nextState = validateState(incoming.state);
      const rev = Number(incoming.revision);
      if (!Number.isSafeInteger(rev) || rev < 0) {
        return sendJson(res, 400, { error: 'Некорректный номер ревизии.' });
      }

      const result = await saveState(nextState, rev);
      if (result.conflict) {
        return sendJson(res, 409, {
          error: 'Данные изменены в другом окне. Скачайте копию несохранённых изменений и откройте приложение заново.'
        });
      }
      return sendJson(res, 200, { revision: result.revision });
    } catch {
      return sendJson(res, 400, {
        error: 'Не удалось сохранить данные. Проверьте формат данных.'
      });
    }
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
}
