import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { boot, call, makeWidget, submit } from './helpers.js';

let ctx;
beforeAll(async () => { ctx = await boot(); });
afterAll(() => ctx.close());

test('admin: create/list/get/patch/delete widget', async () => {
  const w = await makeWidget(ctx.base, ctx.tenantAKey);
  expect((await call(ctx.base, `/api/widgets/${w.id}`, { apiKey: ctx.tenantAKey })).status).toBe(200);
  const p = await call(ctx.base, `/api/widgets/${w.id}`, { method: 'PATCH', apiKey: ctx.tenantAKey, body: { title: 'Renamed' } });
  expect(p.body.widget.title).toBe('Renamed');
  expect((await call(ctx.base, `/api/widgets/${w.id}`, { method: 'DELETE', apiKey: ctx.tenantAKey })).status).toBe(204);
});

test('missing/invalid API key -> 401', async () => {
  expect((await call(ctx.base, '/api/widgets')).status).toBe(401);
  expect((await call(ctx.base, '/api/widgets', { apiKey: 'garbage' })).status).toBe(401);
});

test('TENANT ISOLATION: B cannot read A\'s widget', async () => {
  const w = await makeWidget(ctx.base, ctx.tenantAKey);
  expect((await call(ctx.base, `/api/widgets/${w.id}`, { apiKey: ctx.tenantBKey })).status).toBe(404);
  const listB = await call(ctx.base, '/api/widgets', { apiKey: ctx.tenantBKey });
  expect(listB.body.widgets.find((x) => x.id === w.id)).toBeUndefined();
});

test('PROBE 1: cross-origin submission -> 201, stored, CORS headers present', async () => {
  const w = await makeWidget(ctx.base, ctx.tenantAKey);
  const r = await call(ctx.base, `/widgets/${w.publicId}/submissions`, { method: 'POST', body: { name: 'Ada', email: 'ada@example.com' }, headers: { origin: 'http://localhost:5500' } });
  expect(r.status).toBe(201);
  expect(r.headers.get('access-control-allow-origin')).toBe('*');
});

test('PROBE 2: malformed/oversized payloads -> clean 4xx, never 5xx', async () => {
  const w = await makeWidget(ctx.base, ctx.tenantAKey);
  const missing = await submit(ctx.base, w.publicId, { name: '' });
  expect(missing.status).toBe(422);
  expect(missing.body.error.code).toBe('VALIDATION_FAILED');
  const unknownField = await submit(ctx.base, w.publicId, { name: 'x', email: 'a@b.co', extra: 1 });
  expect(unknownField.status).toBe(422);
  const bigRes = await fetch(`${ctx.base}/widgets/${w.publicId}/submissions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(20000), email: 'a@b.co' }) });
  expect(bigRes.status).toBe(413);
  const unknownWidget = await submit(ctx.base, 'does-not-exist', { name: 'x', email: 'a@b.co' });
  expect(unknownWidget.status).toBe(404);
});

test('idempotency: same key twice -> one row, second is 200 replay', async () => {
  const w = await makeWidget(ctx.base, ctx.tenantAKey);
  const headers = { 'idempotency-key': 'retrykey123456' };
  const first = await submit(ctx.base, w.publicId, { name: 'Once', email: 'once@example.com' }, { headers });
  const second = await submit(ctx.base, w.publicId, { name: 'Once', email: 'once@example.com' }, { headers });
  expect(first.status).toBe(201);
  expect(second.status).toBe(200);
  expect(second.headers.get('idempotent-replay')).toBe('true');
  expect(second.body.id).toBe(first.body.id);
});

test('PROBE 6: honeypot filled -> fake success, nothing stored', async () => {
  const w = await makeWidget(ctx.base, ctx.tenantAKey);
  const before = (await call(ctx.base, `/api/widgets/${w.id}`, { apiKey: ctx.tenantAKey })).body;
  const r = await submit(ctx.base, w.publicId, { name: 'Bot', email: 'bot@example.com', website: 'http://spam.example' });
  expect(r.status).toBe(201);
  const rows = await ctx.pool.query('select count(*)::int n from submissions where widget_id=$1', [before.widget.id]);
  expect(rows.rows[0].n).toBe(0);
});

test('config endpoint is public and cached', async () => {
  const w = await makeWidget(ctx.base, ctx.tenantAKey);
  const r = await call(ctx.base, `/widgets/${w.publicId}/config`);
  expect(r.status).toBe(200);
  expect(r.headers.get('cache-control')).toMatch(/max-age/);
  expect(r.headers.get('access-control-allow-origin')).toBe('*');
});

test('bad idempotency key format -> 400', async () => {
  const w = await makeWidget(ctx.base, ctx.tenantAKey);
  const r = await submit(ctx.base, w.publicId, { name: 'x', email: 'a@b.co' }, { headers: { 'idempotency-key': 'short' } });
  expect(r.status).toBe(400);
});
