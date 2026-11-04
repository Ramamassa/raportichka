import { validateState } from '../model.js';
import { getState, saveState } from './_storage.js';
import { getBody, sendJson } from './_http.js';
import { isAuthorized } from './_auth.js';

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

  // Check authentication (Telegram or Web PIN)
  const auth = isAuthorized(req);
  if (!auth.ok) {
    return sendJson(res, 401, {
      error: 'Доступ закрыт. Откройте приложение через своего бота в Telegram или введите пароль старосты.'
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
