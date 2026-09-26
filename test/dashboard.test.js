import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { boot, call, makeWidget, submit } from './helpers.js';

let ctx, widgetA, widgetB;
beforeAll(async () => {
  ctx = await boot();
  widgetA = await makeWidget(ctx.base, ctx.tenantAKey);
  widgetB = await makeWidget(ctx.base, ctx.tenantBKey);
  await submit(ctx.base, widgetA.publicId, { name: 'Ada', email: 'ada@example.com' });
  await submit(ctx.base, widgetA.publicId, { name: 'Bea', email: 'bea@example.com' });
  await submit(ctx.base, widgetB.publicId, { name: 'Cid', email: 'cid@example.com' });
});
afterAll(() => ctx.close());

test('dashboard requires auth', async () => {
  expect((await call(ctx.base, '/api/dashboard/stats')).status).toBe(401);
  expect((await call(ctx.base, '/api/dashboard/submissions')).status).toBe(401);
});

test('TENANT ISOLATION: A only sees A\'s submissions and stats', async () => {
  const subsA = await call(ctx.base, '/api/dashboard/submissions', { apiKey: ctx.tenantAKey });
  expect(subsA.body.items.length).toBe(2);
  expect(subsA.body.items.every((i) => ['Ada', 'Bea'].includes(i.data.name))).toBe(true);

  const subsB = await call(ctx.base, '/api/dashboard/submissions', { apiKey: ctx.tenantBKey });
  expect(subsB.body.items.length).toBe(1);
  expect(subsB.body.items[0].data.name).toBe('Cid');

  const statsA = await call(ctx.base, '/api/dashboard/stats?days=7', { apiKey: ctx.tenantAKey });
  expect(statsA.body.totals.all).toBe(2);
  const statsB = await call(ctx.base, '/api/dashboard/stats?days=7', { apiKey: ctx.tenantBKey });
  expect(statsB.body.totals.all).toBe(1);
});

test('stats: over-time series has exactly `days` entries and today\'s count is right', async () => {
  const r = await call(ctx.base, '/api/dashboard/stats?days=5', { apiKey: ctx.tenantAKey });
  expect(r.body.overTime.series.length).toBe(5);
  const today = r.body.overTime.series[r.body.overTime.series.length - 1];
  expect(today.submissions).toBe(2);
});

test('submissions list supports widgetId filter and pagination limit', async () => {
  const r = await call(ctx.base, `/api/dashboard/submissions?widgetId=${widgetA.id}&limit=1`, { apiKey: ctx.tenantAKey });
  expect(r.body.items.length).toBe(1);
  expect(r.body.nextBefore).toBeTruthy();
});

test('invalid query params are rejected with 400', async () => {
  expect((await call(ctx.base, '/api/dashboard/stats?days=9999', { apiKey: ctx.tenantAKey })).status).toBe(400);
  expect((await call(ctx.base, '/api/dashboard/submissions?limit=0', { apiKey: ctx.tenantAKey })).status).toBe(400);
});
