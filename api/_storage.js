import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initialState, validateState } from '../model.js';

let memState = null;
let memRevision = 0;

export function _resetMemoryStorage(state = null, revision = 0) {
  memState = state;
  memRevision = revision;
}

function getRedisCredentials() {
  let url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  let token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    for (const [key, val] of Object.entries(process.env)) {
      if (!url && typeof val === 'string' && val.startsWith('http') && (key.includes('REDIS') || key.includes('KV') || key.includes('STORAGE') || key.includes('UPSTASH'))) {
        url = val;
      }
      if (!token && typeof val === 'string' && (key.includes('TOKEN') || key.includes('SECRET')) && (key.includes('REDIS') || key.includes('KV') || key.includes('STORAGE') || key.includes('UPSTASH'))) {
        token = val;
      }
    }
  }

  return { url, token };
}

export async function getState() {
  const { url, token } = getRedisCredentials();

  if (url && token) {
    try {
      return await getRedisState(url, token);
    } catch (err) {
      console.warn('Redis read failed, fallback to local/memory:', err.message);
    }
  }

  if (process.env.STORAGE_FILE === ':memory:' || !process.env.STORAGE_FILE) {
    if (memState) return { state: memState, revision: memRevision };
  }

  const filePath = process.env.STORAGE_FILE || resolve('.journal-runtime', 'attendance.json');
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      state: validateState(parsed.state),
      revision: Number(parsed.revision) || 0
    };
  } catch {
    if (memState) return { state: memState, revision: memRevision };
    return { state: initialState(), revision: 0 };
  }
}

export async function saveState(nextState, expectedRevision) {
  const { url, token } = getRedisCredentials();

  if (url && token) {
    try {
      return await saveRedisState(url, token, nextState, expectedRevision);
    } catch (err) {
      console.warn('Redis write failed, fallback to memory:', err.message);
      memState = nextState;
      memRevision = expectedRevision + 1;
      return { ok: true, revision: memRevision, fallback: true };
    }
  }

  if (process.env.STORAGE_FILE === ':memory:') {
    if (expectedRevision !== memRevision) {
      return { conflict: true, currentRevision: memRevision };
    }
    const nextRevision = memRevision + 1;
    memState = nextState;
    memRevision = nextRevision;
    return { ok: true, revision: nextRevision };
  }

  const filePath = process.env.STORAGE_FILE || resolve('.journal-runtime', 'attendance.json');
  let currentRev = 0;
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    currentRev = Number(parsed.revision) || 0;
  } catch {
    currentRev = memRevision;
  }

  if (expectedRevision !== currentRev) {
    return { conflict: true, currentRevision: currentRev };
  }

  const nextRevision = currentRev + 1;
  const record = { state: nextState, revision: nextRevision };

  try {
    const dir = resolve(filePath, '..');
    await mkdir(dir, { recursive: true });
    await writeFile(filePath + '.tmp', JSON.stringify(record), 'utf8');
    await rename(filePath + '.tmp', filePath);
    memState = nextState;
    memRevision = nextRevision;
  } catch {
    // Read-only serverless environment fallback (Vercel)
    memState = nextState;
    memRevision = nextRevision;
  }

  return { ok: true, revision: nextRevision };
}

async function getRedisState(url, token) {
  const cleanUrl = url.replace(/\/$/, '');
  const res = await fetch(`${cleanUrl}/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(['MGET', 'attendance:revision', 'attendance:state'])
  });

  if (!res.ok) {
    throw new Error(`Upstash Redis error (${res.status})`);
  }

  const data = await res.json();
  const [revRaw, stateRaw] = data.result || [];
  const revision = revRaw ? Number(revRaw) : 0;
  let state = initialState();
  if (stateRaw) {
    try {
      const parsed = typeof stateRaw === 'string' ? JSON.parse(stateRaw) : stateRaw;
      state = validateState(parsed);
    } catch {
      state = initialState();
    }
  }
  return { state, revision };
}

async function saveRedisState(url, token, nextState, expectedRevision) {
  const cleanUrl = url.replace(/\/$/, '');
  const LUA_SAVE = `
local current_rev = redis.call('get', KEYS[1])
local cur = current_rev and tonumber(current_rev) or 0
local expected = tonumber(ARGV[1])
if cur ~= expected then
  return 'CONFLICT:' .. tostring(cur)
end
local next_rev = cur + 1
redis.call('set', KEYS[1], tostring(next_rev))
redis.call('set', KEYS[2], ARGV[2])
return tostring(next_rev)
`;

  // Standard Upstash REST API command invocation: POST to / with command array
  const payload = [
    'EVAL',
    LUA_SAVE,
    2,
    'attendance:revision',
    'attendance:state',
    String(expectedRevision),
    JSON.stringify(nextState)
  ];

  const res = await fetch(`${cleanUrl}/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    // If EVAL fails, fallback to pipeline SET
    const fallbackRes = await fetch(`${cleanUrl}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([
        ['SET', 'attendance:revision', String(expectedRevision + 1)],
        ['SET', 'attendance:state', JSON.stringify(nextState)]
      ])
    });
    if (fallbackRes.ok) {
      return { ok: true, revision: expectedRevision + 1 };
    }
    throw new Error(`Upstash Redis error (${res.status})`);
  }

  const data = await res.json();
  if (data.error) {
    // Fallback if Lua eval errored
    await fetch(`${cleanUrl}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['SET', 'attendance:revision', String(expectedRevision + 1)],
        ['SET', 'attendance:state', JSON.stringify(nextState)]
      ])
    }).catch(() => {});
    return { ok: true, revision: expectedRevision + 1 };
  }

  const result = String(data.result || '');
  if (result.startsWith('CONFLICT:')) {
    return { conflict: true, currentRevision: Number(result.slice(9)) };
  }

  const nextRevision = Number(result) || (expectedRevision + 1);
  return { ok: true, revision: nextRevision };
}
