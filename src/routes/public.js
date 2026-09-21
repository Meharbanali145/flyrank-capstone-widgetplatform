import { Router } from 'express';
import cors from 'cors';
import { notFound } from '../lib/errors.js';
import { IDEMPOTENCY_KEY_RE } from '../lib/idempotency.js';
import { HONEYPOT_FIELD } from '../lib/honeypot.js';
import { normalizeIp } from '../lib/ip.js';

// Public routes are called from browsers on sites we don't control: CORS wide open,
// no cookies/credentials ever used here, so there is no ambient authority to steal.
const publicCors = cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Idempotency-Key'], exposedHeaders: ['Retry-After'], maxAge: 86400 });

export function createPublicRoutes({ widgetService, widgetRepo, submissionService, widgetLimiter }) {
  const router = Router();
  router.use(publicCors);

  router.get('/widgets/:publicId/embed.js', async (req, res) => {
    const cfg = await widgetService.publicConfig(req.params.publicId, widgetRepo);
    if (!cfg) throw notFound('Unknown widget');
    res.set('Content-Type', 'application/javascript; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    res.send(`window.__flyrankWidgetConfig=window.__flyrankWidgetConfig||{};window.__flyrankWidgetConfig[${JSON.stringify(req.params.publicId)}]=${JSON.stringify(cfg)};`);
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
