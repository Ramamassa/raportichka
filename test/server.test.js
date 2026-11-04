import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../scripts/serve.mjs';

test('static server serves only public files, supports HEAD, rejects writes and malformed paths', async () => {
  const root = await mkdtemp(join(tmpdir(),'journal-test-'));
  await writeFile(join(root,'index.html'),'<h1>Journal</h1>');
  const server = createServer(root);
  try {
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const home = await fetch(base);
    assert.equal(home.status,200);
    assert.match(home.headers.get('content-type'),/text\/html/);
    assert.equal(await home.text(),'<h1>Journal</h1>');
    const head = await fetch(base,{method:'HEAD'});
    assert.equal(head.status,200); assert.equal(await head.text(),'');
    assert.equal((await fetch(base,{method:'POST'})).status,405);
    assert.equal((await fetch(base+'/%E0%A4%A')).status,400);
    assert.equal((await fetch(base+'/%2e%2e%5cpackage.json')).status,403);
    assert.equal((await fetch(base+'/package.json')).status,404);
    assert.equal((await fetch(base+'/missing')).status,404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(root,{recursive:true,force:true});
  }
});
