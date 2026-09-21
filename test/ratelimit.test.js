import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { boot, makeWidget, submit, call } from './helpers.js';

let ctx, widget;
beforeAll(async () => {
  process.env.RATE_LIMIT_WIDGET_MAX = '4';
  process.env.RATE_LIMIT_WINDOW_MS = '10000';
  ctx = await boot();
  widget = await makeWidget(ctx.base, ctx.tenantAKey);
});
afterAll(() => ctx.close());

test('PROBE 3: a burst gets 429s, then the API keeps serving legitimate traffic', async () => {
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => submit(ctx.base, widget.publicId, { name: `Flood${i}`, email: `f${i}@example.com` })));
  const ok = results.filter((r) => r.status === 201).length;
  const limited = results.filter((r) => r.status === 429);
  expect(ok).toBeLessThanOrEqual(4);
  expect(limited.length).toBeGreaterThan(0);
  for (const r of limited) expect(r.body.error.code).toBe('RATE_LIMITED');
  expect((await call(ctx.base, '/health')).status).toBe(200);
  const otherWidget = await makeWidget(ctx.base, ctx.tenantAKey);
  expect((await submit(ctx.base, otherWidget.publicId, { name: 'Fresh', email: 'fresh@example.com' })).status).toBe(201);
});
