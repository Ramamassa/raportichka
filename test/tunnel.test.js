import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { tunnelOptions, isExpectedAddress, safeNgrokError } from '../scripts/start-journal.mjs';

const settings = { token: 'test-only-placeholder', domain: 'quiet-paper.ngrok-free.app' };
test('upstream retains the actual IPv4 port and reaches the listening HTTP service', async t => {
  const server = createServer((req, res) => res.end('local-upstream-ok'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const port = server.address().port;
  const options = tunnelOptions(`http://127.0.0.1:${port}`, settings);
  assert.equal(options.addr, `127.0.0.1:${port}`);
  assert.equal(options.domain, settings.domain);
  assert.equal(options.authtoken, settings.token);
  assert.equal(await (await fetch(`http://${options.addr}`)).text(), 'local-upstream-ok');
});
test('upstream cannot silently fall back to localhost:80 or a different host', () => {
  for (const address of ['http://localhost:80', 'http://[::1]:80', 'http://127.0.0.1', 'https://127.0.0.1:8080', 'http://127.0.0.1:8080/path', 'http://secret@127.0.0.1:8080']) {
    assert.throws(() => tunnelOptions(address, settings));
  }
});
test('ngrok URL comparison accepts a trailing slash but rejects unexpected origins', () => {
  for (const suffix of ['', '/']) assert.ok(isExpectedAddress(`https://${settings.domain}${suffix}`, settings.domain));
  for (const url of [`http://${settings.domain}`, `https://${settings.domain}.evil.test`, `https://${settings.domain}/other`, `https://secret@${settings.domain}`, 'invalid']) {
    assert.equal(isExpectedAddress(url, settings.domain), false);
  }
});
test('diagnostics expose only the ngrok error code, never SDK secrets', () => {
  const secret = 'private-placeholder-not-a-real-token';
  const message = safeNgrokError({ message: `auth ${secret}: ERR_NGROK_8012` });
  assert.match(message, /ERR_NGROK_8012/);
  assert.match(safeNgrokError({ errorCode: 'ERR_NGROK_334' }), /адрес уже занят другой сессией/);
  assert.ok(!message.includes(secret));
  assert.ok(!safeNgrokError({ errorCode: secret, message: secret }).includes(secret));
});
