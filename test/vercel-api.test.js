import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import stateHandler from '../api/state.js';
import exportHandler from '../api/export.js';
import webhookHandler from '../api/webhook.js';
import { getState, saveState, _resetMemoryStorage } from '../api/_storage.js';
import { initialState, setAbsence } from '../model.js';

const token = '123456789:' + 'x'.repeat(35);
const ownerId = '123456789';

function createMockRes() {
  const headers = {};
  let statusCode = 200;
  let body = '';
  return {
    headers,
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    writeHead(code, h = {}) {
      statusCode = code;
      for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = v;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      headers['content-type'] = 'application/json; charset=utf-8';
      body = JSON.stringify(data);
      return this;
    },
    end(data) {
      if (data !== undefined) body = data;
      return this;
    },
    getStatusCode() { return statusCode; },
    getBody() {
      try { return JSON.parse(body); } catch { return body; }
    },
    getRawBody() { return body; }
  };
}

function signed(user = ownerId, time = Math.floor(Date.now() / 1000)) {
  const data = new URLSearchParams({
    auth_date: String(time),
    user: JSON.stringify({ id: Number(user) }),
    query_id: 'test'
  });
  const check = [...data.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  data.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return data.toString();
}

test('Storage: memory fallback loads initial state, increments revision, and catches conflicts', async () => {
  process.env.STORAGE_FILE = ':memory:';
  _resetMemoryStorage(null, 0);
  const initial = await getState();
  assert.equal(initial.revision, 0);
  assert.ok(Array.isArray(initial.state.students));

  const state1 = structuredClone(initial.state);
  setAbsence(state1, '2026-11-04', 1, state1.students[0].id, true);

  // Normal save
  const save1 = await saveState(state1, 0);
  assert.equal(save1.ok, true);
  assert.equal(save1.revision, 1);

  // Conflict save with old revision
  const conflict = await saveState(state1, 0);
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.currentRevision, 1);

  // Next save with correct revision
  const save2 = await saveState(state1, 1);
  assert.equal(save2.ok, true);
  assert.equal(save2.revision, 2);

  const current = await getState();
  assert.equal(current.revision, 2);
  assert.deepEqual(current.state.marks, state1.marks);
});

test('Storage: Upstash Redis REST API protocol integration', async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options) => {
    calls.push({ url, options });
    const payload = options.body ? JSON.parse(options.body) : [];
    if (payload[0] === 'MGET' || url.includes('/mget/')) {
      return {
        ok: true,
        json: async () => ({
          result: ['5', JSON.stringify({ version: 1, group: 'Тест', students: [], marks: {} })]
        })
      };
    }
    if (payload[0] === 'EVAL' || url.includes('/eval')) {
      const expectedRev = payload[0] === 'EVAL' ? payload[5] : payload[4];
      if (expectedRev === '5') {
        return { ok: true, json: async () => ({ result: '6' }) };
      }
      return { ok: true, json: async () => ({ result: 'CONFLICT:5' }) };
    }
    return { ok: false, status: 404 };
  };

  process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

  try {
    const res = await getState();
    assert.equal(res.revision, 5);
    assert.equal(res.state.group, 'Тест');

    const saveOk = await saveState(res.state, 5);
    assert.equal(saveOk.ok, true);
    assert.equal(saveOk.revision, 6);

    const saveConflict = await saveState(res.state, 4);
    assert.equal(saveConflict.conflict, true);
    assert.equal(saveConflict.currentRevision, 5);
  } finally {
    global.fetch = originalFetch;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
});

test('API /api/state: Auth, validation, revision conflict, and atomic updates', async () => {
  process.env.BOT_TOKEN = token;
  process.env.OWNER_ID = ownerId;
  process.env.STORAGE_FILE = ':memory:';
  _resetMemoryStorage(null, 0);

  try {
    // 1. Missing auth
    const req1 = { method: 'GET', headers: {} };
    const res1 = createMockRes();
    await stateHandler(req1, res1);
    assert.equal(res1.getStatusCode(), 401);

    // 2. Wrong user
    const req2 = { method: 'GET', headers: { 'x-telegram-init-data': signed('999999999') } };
    const res2 = createMockRes();
    await stateHandler(req2, res2);
    assert.equal(res2.getStatusCode(), 401);

    // 3. Authorized GET
    const authHeaders = { 'x-telegram-init-data': signed() };
    const req3 = { method: 'GET', headers: authHeaders };
    const res3 = createMockRes();
    await stateHandler(req3, res3);
    assert.equal(res3.getStatusCode(), 200);
    assert.equal(res3.getBody().revision, 0);

    // 4. Authorized PUT
    const state = initialState();
    setAbsence(state, '2026-11-04', 1, state.students[0].id, true);
    const req4 = {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ state, revision: 0 })
    };
    const res4 = createMockRes();
    await stateHandler(req4, res4);
    assert.equal(res4.getStatusCode(), 200);
    assert.equal(res4.getBody().revision, 1);

    // 5. Conflicting PUT
    const req5 = {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ state, revision: 0 })
    };
    const res5 = createMockRes();
    await stateHandler(req5, res5);
    assert.equal(res5.getStatusCode(), 409);

    // 6. Malformed state PUT
    const req6 = {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ state: { invalid: true }, revision: 1 })
    };
    const res6 = createMockRes();
    await stateHandler(req6, res6);
    assert.equal(res6.getStatusCode(), 400);

    // 7. OPTIONS
    const req7 = { method: 'OPTIONS', headers: {} };
    const res7 = createMockRes();
    await stateHandler(req7, res7);
    assert.equal(res7.getStatusCode(), 204);

    // 8. Safari / Web PIN auth
    process.env.OWNER_PIN = '438291';

    // Wrong PIN fails
    const reqPinBad = { method: 'GET', headers: { 'x-owner-pin': '000000' } };
    const resPinBad = createMockRes();
    await stateHandler(reqPinBad, resPinBad);
    assert.equal(resPinBad.getStatusCode(), 401);

    // Correct PIN GET succeeds
    const reqPinOk = { method: 'GET', headers: { 'x-owner-pin': '438291' } };
    const resPinOk = createMockRes();
    await stateHandler(reqPinOk, resPinOk);
    assert.equal(resPinOk.getStatusCode(), 200);
    assert.equal(resPinOk.getBody().revision, 1);

    // Correct PIN PUT succeeds
    const reqPinPut = {
      method: 'PUT',
      headers: { 'x-owner-pin': '438291' },
      body: JSON.stringify({ state, revision: 1 })
    };
    const resPinPut = createMockRes();
    await stateHandler(reqPinPut, resPinPut);
    assert.equal(resPinPut.getStatusCode(), 200);
    assert.equal(resPinPut.getBody().revision, 2);
  } finally {
    delete process.env.BOT_TOKEN;
    delete process.env.OWNER_ID;
    delete process.env.OWNER_PIN;
  }
});

test('API /api/export: sends document to owner via Telegram Bot API', async () => {
  process.env.BOT_TOKEN = token;
  process.env.OWNER_ID = ownerId;

  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ ok: true, result: {} }) };
  };

  try {
    const authHeaders = {
      'x-telegram-init-data': signed(),
      'content-type': 'application/json'
    };
    const req = {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ test: true })
    };
    const res = createMockRes();
    await exportHandler(req, res);
    assert.equal(res.getStatusCode(), 200);
    assert.equal(res.getBody().ok, true);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('sendDocument'));
  } finally {
    global.fetch = originalFetch;
    delete process.env.BOT_TOKEN;
    delete process.env.OWNER_ID;
  }
});

test('API /api/webhook: processes Telegram updates and validates secrets', async () => {
  process.env.BOT_TOKEN = token;
  process.env.OWNER_ID = ownerId;
  process.env.WEBHOOK_SECRET = 'secret123';
  process.env.APP_URL = 'https://raportichka.vercel.app';

  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    return { ok: true, json: async () => ({ ok: true, result: {} }) };
  };

  try {
    // 1. GET health check
    const reqGet = { method: 'GET' };
    const resGet = createMockRes();
    await webhookHandler(reqGet, resGet);
    assert.equal(resGet.getStatusCode(), 200);

    // 2. Missing secret
    const reqNoSecret = {
      method: 'POST',
      headers: {},
      body: JSON.stringify({})
    };
    const resNoSecret = createMockRes();
    await webhookHandler(reqNoSecret, resNoSecret);
    assert.equal(resNoSecret.getStatusCode(), 403);

    // 3. Owner /start command
    const reqStart = {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'secret123' },
      body: JSON.stringify({
        update_id: 1,
        message: {
          chat: { id: 123456789, type: 'private' },
          from: { id: 123456789 },
          text: '/start'
        }
      })
    };
    const resStart = createMockRes();
    await webhookHandler(reqStart, resStart);
    assert.equal(resStart.getStatusCode(), 200);

    // Should configure menu button and send welcome message
    assert.equal(calls.length, 2);
    const menuCall = calls.find(c => c.url.includes('setChatMenuButton'));
    assert.ok(menuCall);
    assert.equal(menuCall.body.menu_button.web_app.url, 'https://raportichka.vercel.app');

    const msgCall = calls.find(c => c.url.includes('sendMessage'));
    assert.ok(msgCall);
    assert.equal(msgCall.body.reply_markup.inline_keyboard[0][0].web_app.url, 'https://raportichka.vercel.app');
  } finally {
    global.fetch = originalFetch;
    delete process.env.BOT_TOKEN;
    delete process.env.OWNER_ID;
    delete process.env.WEBHOOK_SECRET;
    delete process.env.APP_URL;
  }
});
