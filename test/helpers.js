import { buildApp } from '../src/app.js';
import { hashApiKey } from '../src/lib/apikey.js';
export async function boot() {
  const ctx = buildApp();
  await ctx.pool.query('TRUNCATE tenants, widgets, submissions, jobs RESTART IDENTITY CASCADE');
  const server = ctx.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const a = await ctx.tenantRepo.create({ name: 'A', email: `a-${Date.now()}@example.com`, apiKeyHash: hashApiKey('key-a-test-0123456789') });
  const b = await ctx.tenantRepo.create({ name: 'B', email: `b-${Date.now()}@example.com`, apiKeyHash: hashApiKey('key-b-test-0123456789') });
  return { ...ctx, base, tenantAKey: 'key-a-test-0123456789', tenantBKey: 'key-b-test-0123456789', tenantAId: a.id, tenantBId: b.id, async close() { server.close(); await ctx.pool.end(); } };
}
export async function call(base, path, { method = 'GET', apiKey, body, headers = {} } = {}) {
  const h = { ...headers };
  if (apiKey) h['x-api-key'] = apiKey;
  let payload;
  if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + path, { method, headers: h, body: payload });
  const text = await res.text();
  let parsed = text; try { parsed = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, body: parsed };
}
export async function makeWidget(base, apiKey, over = {}) {
  const r = await call(base, '/api/widgets', { method: 'POST', apiKey, body: { type: 'signup_form', title: 'Test', fields: [{ name: 'name', label: 'Name', type: 'text', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }], ...over } });
  if (r.status !== 201) throw new Error(`widget create failed: ${JSON.stringify(r.body)}`);
  return r.body.widget;
}
export const submit = (base, publicId, data, extra = {}) => call(base, `/widgets/${publicId}/submissions`, { method: 'POST', body: data, headers: extra.headers });
