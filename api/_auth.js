import { verifyTelegram } from '../scripts/telegram-auth.mjs';

export function isAuthorized(req) {
  const token = process.env.BOT_TOKEN;
  const ownerId = process.env.OWNER_ID;
  const ownerPin = process.env.OWNER_PIN;

  // 1. Telegram WebApp authentication
  const initData = req.headers?.['x-telegram-init-data'];
  if (initData && token && ownerId) {
    try {
      verifyTelegram(initData, token, ownerId);
      return { ok: true, type: 'telegram' };
    } catch {}
  }

  // 2. Web browser (Safari / Chrome) PIN authentication
  const pin = req.headers?.['x-owner-pin'] || req.headers?.['authorization']?.replace(/^Bearer\s+/i, '');
  if (ownerPin && pin && String(pin).trim() === String(ownerPin).trim()) {
    return { ok: true, type: 'pin' };
  }

  return { ok: false };
}
