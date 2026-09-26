import { Router } from 'express';
import cors from 'cors';
import { notFound } from '../lib/errors.js';
import { IDEMPOTENCY_KEY_RE } from '../lib/idempotency.js';
import { HONEYPOT_FIELD } from '../lib/honeypot.js';
import { normalizeIp } from '../lib/ip.js';
import { runtimeBundle } from '../services/bundle.js';

// Public routes are called from browsers on sites we don't control: CORS wide open,
// no cookies/credentials ever used here, so there is no ambient authority to steal.
const publicCors = cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Idempotency-Key'], exposedHeaders: ['Retry-After'], maxAge: 86400 });
const YEAR = 60 * 60 * 24 * 365;

export function createPublicRoutes({ widgetService, widgetRepo, submissionService, widgetLimiter, config }) {
  const router = Router();
  router.use(publicCors);

  // The shared runtime: one script, cached hard when its version hash matches, shared by
  // every widget embedded on the page (loaded once even if 2 widgets are on the same page).
  router.get('/widget-runtime.js', (req, res) => {
    const pinned = req.query.v === runtimeBundle.hash;
    res.set({
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': pinned ? `public, max-age=${YEAR}, immutable` : 'public, max-age=300, stale-while-revalidate=600',
      ETag: runtimeBundle.etag,
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.fresh) return res.status(304).end();
    res.send(runtimeBundle.source);
  });

  // The one line customers paste. Marks itself so the runtime knows where to mount the form,
  // stashes this widget's config, then loads the shared runtime (once) and renders.
  // apiBase is derived from THIS script's own src (like a CDN snippet would), never from
  // server config — so it's correct however the page reaches us (custom domain, proxy, test port).
  router.get('/widgets/:publicId/embed.js', async (req, res) => {
    const id = req.params.publicId;
    const cfg = await widgetService.publicConfig(id, widgetRepo);
    if (!cfg) throw notFound('Unknown widget');
    res.set('Content-Type', 'application/javascript; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    res.send(`(function(){
  var apiBase = new URL(document.currentScript.src, location.href).origin;
  document.currentScript.setAttribute('data-flyrank-mount', ${JSON.stringify(id)});
  window.__flyrankApiBase = window.__flyrankApiBase || apiBase;
  window.__flyrankWidgetConfig = window.__flyrankWidgetConfig || {};
  window.__flyrankWidgetConfig[${JSON.stringify(id)}] = ${JSON.stringify(cfg)};
  function boot(){ window.__flyrankRender(${JSON.stringify(id)}); }
  if (window.__flyrankRuntimeLoaded) { boot(); return; }
  var s = document.createElement('script');
  s.src = apiBase + '/widget-runtime.js?v=' + ${JSON.stringify(runtimeBundle.hash)};
  s.async = true;
  s.onload = boot;
  document.head.appendChild(s);
})();`);
  });

  router.get('/widgets/:publicId/config', async (req, res) => {
    const cfg = await widgetService.publicConfig(req.params.publicId, widgetRepo);
    if (!cfg) throw notFound('Unknown widget');
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json(cfg);
  });

  router.post('/widgets/:publicId/submissions', widgetLimiter, async (req, res) => {
    const key = req.get('idempotency-key');
    if (key !== undefined && !IDEMPOTENCY_KEY_RE.test(key)) return res.status(400).json({ error: { code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key must be 8-64 chars of A-Z a-z 0-9 _ -' } });
    const { [HONEYPOT_FIELD]: honeypotValue, ...data } = req.body ?? {};
    const result = await submissionService.submit({ widgetPublicId: req.params.publicId, data, honeypotValue, ip: normalizeIp(req.ip), idempotencyKey: key });
    if (result.replay) res.set('Idempotent-Replay', 'true');
    res.status(result.status).json(result.body);
  });
  return router;
}
