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
  const url = process.env.KV_REST_API_URL ||
              process.env.UPSTASH_REDIS_REST_URL ||
              process.env.STORAGE_REST_API_URL ||
              process.env.STORAGE_KV_REST_API_URL ||
              process.env.STORAGE_URL;

  const token = process.env.KV_REST_API_TOKEN ||
                process.env.UPSTASH_REDIS_REST_TOKEN ||
                process.env.STORAGE_REST_API_TOKEN ||
                process.env.STORAGE_KV_REST_API_TOKEN ||
                process.env.STORAGE_TOKEN;

  return { url, token };
}

export async function getState() {
  const { url, token } = getRedisCredentials();

  if (url && token) {
    return getRedisState(url, token);
  }

  if (process.env.STORAGE_FILE === ':memory:') {
    if (memState) return { state: memState, revision: memRevision };
    return { state: initialState(), revision: 0 };
  }
  const filePath = process.env.STORAGE_FILE || resolve('.journal-runtime', 'attendance.json');
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      state: validateState(parsed.state),
      revision: Number(parsed.revision) || 0
    };
  } catch (err) {
    if (memState) {
      return { state: memState, revision: memRevision };
    }
    return { state: initialState(), revision: 0 };
  }
}

export async function saveState(nextState, expectedRevision) {
  const { url, token } = getRedisCredentials();

  if (url && token) {
    return saveRedisState(url, token, nextState, expectedRevision);
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
    // If running in read-only environment without Redis
    memState = nextState;
    memRevision = nextRevision;
  }

  return { ok: true, revision: nextRevision };
}

async function getRedisState(url, token) {
  const cleanUrl = url.replace(/\/$/, '');
  const res = await fetch(`${cleanUrl}/mget/attendance:revision/attendance:state`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    throw new Error(`Upstash Redis error: ${res.status}`);
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

  const payload = [
    LUA_SAVE,
    2,
    'attendance:revision',
    'attendance:state',
    String(expectedRevision),
    JSON.stringify(nextState)
  ];

  const res = await fetch(`${cleanUrl}/eval`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`Upstash Redis error: ${res.status}`);
  }

  const data = await res.json();
  const result = String(data.result || '');

  if (result.startsWith('CONFLICT:')) {
    return { conflict: true, currentRevision: Number(result.slice(9)) };
  }

  const nextRevision = Number(result);
  return { ok: true, revision: nextRevision };
}
