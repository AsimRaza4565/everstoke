import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fetchBuffer } from '../lib/fetch-safe.mjs';

test('#65 fetchBuffer aborts when the BODY stalls past the deadline', async () => {
  // server sends headers, then 2 bytes and goes quiet (never ends the body)
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Length': '1000' });
    res.write('ab');
    // no res.end() — body stalls forever
  });
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const started = Date.now();
  try {
    await assert.rejects(
      fetchBuffer(`http://127.0.0.1:${port}/x`, { timeoutMs: 400 }),
      /deadline|abort/i,
      'stalled body must trip the deadline'
    );
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 5000, `abort took ${elapsed}ms — deadline not enforced through the body`);
  } finally {
    srv.close();
  }
});

test('#65 fetchBuffer returns the buffer for a healthy response', async () => {
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(Buffer.alloc(64 * 1024, 7));
  });
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  try {
    const { buf, status } = await fetchBuffer(`http://127.0.0.1:${port}/ok`, { timeoutMs: 5000 });
    assert.equal(status, 200);
    assert.equal(buf.length, 64 * 1024);
  } finally {
    srv.close();
  }
});

test('#65 non-2xx throws with the HTTP status', async () => {
  const srv = http.createServer((req, res) => { res.writeHead(403); res.end(); });
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  try {
    await assert.rejects(fetchBuffer(`http://127.0.0.1:${port}/x`, { timeoutMs: 5000 }), /HTTP 403/);
  } finally {
    srv.close();
  }
});
