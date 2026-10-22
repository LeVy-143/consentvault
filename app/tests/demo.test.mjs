import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { openDemoStore } from '../demo/store.mjs';
import { createDemoApp } from '../demo/app.mjs';
import { createApp } from '../server/app.mjs';
import { openStore } from '../server/store.mjs';
import { DEMO_BANNER, samples } from '../demo/model.mjs';

async function start(path = ':memory:', key = randomBytes(32)) {
  const db = openDemoStore(path), app = createDemoApp({ db, storageKey: key });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function api(actor, path, body, extra = {}) {
    const response = await fetch(base + '/api/demo' + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'X-ConsentVault-Demo': 'local-simulation', 'X-Demo-Identity': actor, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  }
  return { db, api, base, async close() { await new Promise(resolve => server.close(resolve)); db.close(); } };
}

test('demo config identifies simulation; requests require loopback host, allowed origin and explicit demo identity', async () => {
  const f = await start();
  try {
    const config = await (await fetch(f.base + '/api/config')).json();
    assert.equal(config.banner, DEMO_BANNER); assert.equal(config.mode, 'demo'); assert.equal(config.configured, false);
    assert.equal((await f.api('invented-admin', '/identity', {})).status, 401);
    assert.equal((await f.api('lan', '/records?scope=catalog', undefined, { Origin: 'https://attacker.invalid' })).status, 403);
    // Node fetch replaces Host; use a wire-level request for the rebinding check.
    const hostileHostStatus = await new Promise((resolve, reject) => {
      const request = httpRequest(f.base + '/api/config', { headers: { Host: 'attacker.invalid' } }, response => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject); request.end();
    });
    assert.equal(hostileHostStatus, 403);
    assert.equal((await f.api('lan', '/identity', {}, { 'X-ConsentVault-Demo': '' })).status, 403);
    assert.equal((await f.api('lan', '/identity', {}, { Origin: 'http://127.0.0.1:5174' })).status, 200);
    assert.equal((await f.api('lan', '/identities')).data.length, 6);
  } finally { await f.close(); }
});

test('demo consent needs two distinct admins; recipient/record access and denied audit are actual state transitions', async () => {
  const f = await start();
  try {
    const first = (await f.api('lan', '/records', { kind: 'Vietnamese text' })).data;
    const second = (await f.api('lan', '/records', { kind: 'Private survey' })).data;
    assert.equal((await f.api('lan', `/records/${first.id}/open`, {})).data.content, samples['Vietnamese text']);
    assert.equal((await f.api('lan', `/records/${second.id}/open`, {})).data.content, samples['Private survey']);
    assert.equal((await f.api('an', `/records/${first.id}/open`, {})).status, 403);
    assert.equal((await f.api('operator', '/records', { kind: 'Vietnamese text' })).status, 403);
    assert.equal((await f.api('lan', '/records', { kind: 'Vietnamese text', plaintext: 'must not store arbitrary content' })).status, 400);
    for (const actor of ['an', 'binh', 'operator', 'admin-1', 'admin-2']) {
      assert.equal((await f.api(actor, `/records/${first.id}/requests`, { recipient: actor })).status, 403);
    }
    const request = await f.api('lan', `/records/${first.id}/requests`, { recipient: 'an' });
    assert.equal(request.status, 201); assert.equal(request.data.status, 'pending');
    const id = request.data.id;
    assert.equal((await f.api('operator', `/requests/${id}/approve`, {})).status, 403);
    assert.equal((await f.api('lan', `/requests/${id}/approve`, {})).status, 403);
    assert.equal((await f.api('admin-1', `/requests/${id}/approve`, { admin: 'admin-2' })).status, 400);
    const approved = await f.api('admin-1', `/requests/${id}/approve`, {});
    assert.equal(approved.data.status, 'pending'); assert.deepEqual(approved.data.approvals, ['admin-1']);
    assert.equal((await f.api('an', `/records/${first.id}/open`, {})).status, 403);
    assert.equal((await f.api('admin-1', `/requests/${id}/approve`, {})).status, 409);
    assert.equal((await f.api('an', '/records?scope=shared')).data.length, 0);
    const active = await f.api('admin-2', `/requests/${id}/approve`, {});
    assert.equal(active.data.status, 'active'); assert.equal(active.data.approvals.length, 2);
    assert.equal((await f.api('an', `/records/${first.id}/open`, {})).data.content, samples['Vietnamese text']);
    assert.equal((await f.api('an', `/records/${second.id}/open`, {})).status, 403);
    assert.deepEqual((await f.api('an', '/records?scope=shared')).data.map(r => r.id), [first.id]);
    for (const actor of ['binh', 'operator', 'admin-1', 'admin-2']) {
      assert.equal((await f.api(actor, '/records?scope=shared')).data.length, 0);
      for (const row of [first, second]) assert.equal((await f.api(actor, `/records/${row.id}/open`, {})).status, 403);
    }
    const catalog = JSON.stringify((await f.api('binh', '/records?scope=catalog')).data);
    assert.ok(!catalog.includes(samples['Vietnamese text']) && !catalog.includes('sealed'));
    const events = (await f.api('lan', '/audit')).data;
    assert.ok(events.some(e => e.action === 'record.opened' && e.actor === 'an' && e.outcome === 'allowed'));
    assert.ok(events.some(e => e.action === 'record.read_denied' && e.actor === 'binh' && e.outcome === 'denied'));
    assert.ok(events.some(e => e.action === 'approval.duplicate_denied'));
    assert.ok(events.some(e => e.action === 'grant.activated'));
    assert.ok(!JSON.stringify(events).includes(samples['Private survey']));
  } finally { await f.close(); }
});

test('replaying one demo admin concurrently cannot activate a request', async () => {
  const f = await start();
  try {
    const record = (await f.api('lan', '/records', { kind: 'Vietnamese text' })).data;
    const request = (await f.api('lan', `/records/${record.id}/requests`, { recipient: 'an' })).data;
    const results = await Promise.all([f.api('admin-1', `/requests/${request.id}/approve`, {}), f.api('admin-1', `/requests/${request.id}/approve`, {})]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    assert.equal((await f.api('an', `/records/${record.id}/open`, {})).status, 403);
  } finally { await f.close(); }
});

test('demo storage persists approvals, is encrypted locally and resets only demo tables', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'consentvault-demo-test-')), path = join(directory, 'demo.sqlite'), key = randomBytes(32);
  const livePath = join(directory, 'live.sqlite'), live = openStore(livePath);
  live.prepare('INSERT INTO members VALUES(?,?,?,?,?)').run('live-owner', 'live-public-key', 'Live owner', 0, new Date().toISOString());
  live.close();
  const originalLiveBytes = readFileSync(livePath);
  let f = await start(path, key);
  try {
    const record = (await f.api('lan', '/records', { kind: 'Vietnamese text' })).data;
    const request = (await f.api('lan', `/records/${record.id}/requests`, { recipient: 'an' })).data;
    await f.api('admin-1', `/requests/${request.id}/approve`, {});
    await f.close(); f = await start(path, key);
    assert.equal((await f.api('an', `/records/${record.id}/open`, {})).status, 403);
    await f.api('admin-2', `/requests/${request.id}/approve`, {});
    assert.equal((await f.api('an', `/records/${record.id}/open`, {})).status, 200);
    const bytes = Buffer.concat(readdirSync(directory).map(name => readFileSync(join(directory, name))));
    assert.ok(!bytes.includes(Buffer.from(samples['Vietnamese text'])) && !bytes.includes(key));
    assert.equal((await f.api('lan', '/reset', {})).status, 400);
    assert.equal((await f.api('lan', '/reset', { confirmation: 'RESET_SYNTHETIC_DEMO' })).status, 200);
    assert.equal((await f.api('an', `/records/${record.id}/open`, {})).status, 404);
    assert.equal((await f.api('lan', '/requests')).data.length, 0);
    assert.deepEqual(readFileSync(livePath), originalLiveBytes, 'Live database bytes survive demo reset unchanged');
  } finally { await f.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('live API never enables synthetic identities, demo reset or demo config', async () => {
  const db = openStore(':memory:'), server = createApp({ db, getConfig: () => null }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const config = await (await fetch(base + '/api/config?mode=demo')).json();
    assert.notEqual(config.mode, 'demo'); assert.equal(config.configured, false);
    for (const path of ['/api/demo/identity', '/api/demo/reset']) {
      const r = await fetch(base + path, { method: 'POST', headers: { 'X-Demo-Identity': 'admin-1', 'X-ConsentVault-Demo': 'local-simulation', 'Content-Type': 'application/json' }, body: '{}' });
      assert.notEqual(r.status, 200);
    }
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'demo_%'").get().n, 0);
  } finally { await new Promise(resolve => server.close(resolve)); db.close(); }
});
