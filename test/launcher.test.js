import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createSetupServer, validateSettings, loadSettings } from '../scripts/journal-setup.mjs';

const token = 'test_only_not_a_real_token_123456789';
test('settings require a token and an official domain without paths or injected YAML', () => {
  assert.deepEqual(validateSettings({ token, domain: 'https://quiet-paper.ngrok-free.app/' }), { token, domain: 'quiet-paper.ngrok-free.app' });
  for (const domain of ['example.com', 'a.ngrok-free.app.evil.test', 'a.ngrok-free.app/path', 'a.ngrok-free.app:8080']) {
    assert.throws(() => validateSettings({ token, domain }));
  }
  assert.throws(() => validateSettings({ token: '', domain: 'a.ngrok-free.app' }));
});
test('local setup rejects cross-origin requests and persists valid settings without echoing the secret', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'journal-setup-'));
  const path = join(dir, 'settings.json');
  const server = createSetupServer(path);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(ok => server.close(ok)); await rm(dir, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal(await loadSettings(path), null);
  const page = await fetch(url);
  const html = await page.text();
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const csrf = html.match(/name="csrf" value="([a-f0-9]+)"/)[1];
  const send = (origin, nonce, domain = 'quiet-paper.ngrok-free.app') => fetch(url + '/save', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: nonce, token, domain })
  });
  assert.equal((await send('https://evil.test', csrf)).status, 403);
  assert.equal((await send(url, 'bad')).status, 403);
  assert.equal((await send(url, csrf, 'evil.test')).status, 400);
  const configured = once(server, 'configured');
  const result = await send(url, csrf);
  assert.equal(result.status, 200);
  assert.ok(!(await result.text()).includes(token));
  assert.deepEqual((await configured)[0], { token, domain: 'quiet-paper.ngrok-free.app' });
  assert.deepEqual(await loadSettings(path), { token, domain: 'quiet-paper.ngrok-free.app' });
  assert.equal(JSON.parse(await readFile(path, 'utf8')).token, token);
});
