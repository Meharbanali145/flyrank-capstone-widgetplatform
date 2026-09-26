import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { boot, call, makeWidget } from './helpers.js';

let ctx, widget;
beforeAll(async () => {
  ctx = await boot();
  widget = await makeWidget(ctx.base, ctx.tenantAKey);
});
afterAll(() => ctx.close());

async function openCustomerPage() {
  const template = readFileSync('demo/customer-site/index.html', 'utf8');
  const page = template.replaceAll('{{API_BASE}}', ctx.base).replaceAll('{{WIDGET_ID}}', widget.publicId);
  const dom = new JSDOM(page, { url: 'http://localhost:5500/', runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true });
  await new Promise((resolve, reject) => {
    const t = Date.now();
    const iv = setInterval(() => {
      if (dom.window.document.querySelector(`[data-flyrank-widget="${widget.publicId}"]`)) { clearInterval(iv); resolve(); }
      if (Date.now() - t > 4000) { clearInterval(iv); reject(new Error('widget never rendered')); }
    }, 25);
  });
  return dom;
}

test('PROBE 1 (browser): widget renders on a genuinely different origin from a one-line embed, and submits cross-origin', async () => {
  const dom = await openCustomerPage();
  expect(dom.window.location.origin).toBe('http://localhost:5500');
  expect(new URL(ctx.base).origin).not.toBe(dom.window.location.origin);
  const host = dom.window.document.querySelector(`[data-flyrank-widget="${widget.publicId}"]`);
  const root = host.shadowRoot;
  expect(root.querySelector('h3').textContent).toBe('Test');
  root.querySelector('input[type=text]').value = 'Ada Lovelace';
  root.querySelector('input[type=email]').value = 'ada@example.com';
  root.querySelector('button.go').click();
  await new Promise((resolve, reject) => {
    const t = Date.now();
    const iv = setInterval(() => { if (root.querySelector('.msg').textContent) { clearInterval(iv); resolve(); } if (Date.now() - t > 4000) { clearInterval(iv); reject(new Error('submit timed out')); } }, 25);
  });
  expect(root.querySelector('.msg').className).toBe('msg ok');
  const row = await ctx.pool.query("select count(*)::int n from submissions where widget_id = $1 and data->>'name' = 'Ada Lovelace'", [
    (await call(ctx.base, `/api/widgets/${widget.id}`, { apiKey: ctx.tenantAKey })).body.widget.id,
  ]);
  expect(row.rows[0].n).toBe(1);
  dom.window.close();
});

test('widget renders server-provided text as TEXT, never HTML (XSS-safe)', async () => {
  const evil = await makeWidget(ctx.base, ctx.tenantAKey, { title: '<img src=x onerror="window.__pwned=1">' });
  const template = readFileSync('demo/customer-site/index.html', 'utf8');
  const page = template.replaceAll('{{API_BASE}}', ctx.base).replaceAll('{{WIDGET_ID}}', evil.publicId);
  const dom = new JSDOM(page, { url: 'http://localhost:5500/', runScripts: 'dangerously', resources: 'usable' });
  await new Promise((resolve) => {
    const iv = setInterval(() => { if (dom.window.document.querySelector(`[data-flyrank-widget="${evil.publicId}"]`)) { clearInterval(iv); resolve(); } }, 25);
  });
  const root = dom.window.document.querySelector(`[data-flyrank-widget="${evil.publicId}"]`).shadowRoot;
  expect(root.querySelector('h3').textContent).toBe('<img src=x onerror="window.__pwned=1">');
  expect(root.querySelector('img')).toBeNull();
  expect(dom.window.__pwned).toBeUndefined();
  dom.window.close();
});

test('CONTROL: jsdom really enforces CORS — a request without CORS headers is blocked cross-origin', async () => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost:5500/', runScripts: 'outside-only' });
  const outcome = await new Promise((resolve) => {
    const xhr = new dom.window.XMLHttpRequest();
    xhr.open('GET', `${ctx.base}/api/widgets`); // admin route: no CORS headers on purpose
    xhr.setRequestHeader('X-API-Key', ctx.tenantAKey);
    xhr.onload = () => resolve(`loaded:${xhr.status}`);
    xhr.onerror = () => resolve('blocked');
    xhr.send();
  });
  expect(outcome).toBe('blocked');
  dom.window.close();
});
