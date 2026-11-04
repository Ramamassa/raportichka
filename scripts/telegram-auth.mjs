import { createHmac, timingSafeEqual } from 'node:crypto';
export function verifyTelegram(raw, token, ownerId, now = Math.floor(Date.now()/1000)) {
  if (typeof raw !== 'string' || raw.length > 16000) throw new Error('Unauthorized');
  const data = new URLSearchParams(raw);
  if ([...data.keys()].some((key,i,keys)=>keys.indexOf(key)!==i)) throw new Error('Unauthorized');
  const hash = data.get('hash');
  if (!/^[a-f0-9]{64}$/.test(hash || '')) throw new Error('Unauthorized');
  data.delete('hash');
  const check = [...data.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret = createHmac('sha256','WebAppData').update(token).digest();
  const expected = createHmac('sha256',secret).update(check).digest();
  if (!timingSafeEqual(Buffer.from(hash,'hex'),expected)) throw new Error('Unauthorized');
  const authDate = Number(data.get('auth_date'));
  if (!Number.isInteger(authDate) || authDate > now+30 || now-authDate > 86400) throw new Error('Session expired');
  const user = JSON.parse(data.get('user') || 'null');
  if (!user || String(user.id)!==String(ownerId)) throw new Error('Forbidden');
  return user;
}
