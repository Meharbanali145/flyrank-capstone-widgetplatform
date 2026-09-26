import { Router } from 'express';
import { z } from 'zod';
import { requireApiKey } from '../middleware/auth.js';
import { parseOrThrow } from '../lib/parse.js';

const listQuery = z.object({ widgetId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(25), before: z.string().uuid().optional() });
const statsQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(14) });

export function createDashboardRoutes({ tenantRepo, dashboardService, widgetRepo }) {
  const router = Router();
  router.use(requireApiKey(tenantRepo));

  router.get('/submissions', async (req, res, next) => {
    try {
      const q = parseOrThrow(listQuery, req.query);
      res.json(await dashboardService.listSubmissions(req.tenant.id, q));
    } catch (e) { next(e); }
  });

  router.get('/stats', async (req, res, next) => {
    try {
      const q = parseOrThrow(statsQuery, req.query);
      res.json(await dashboardService.stats(req.tenant.id, q.days));
    } catch (e) { next(e); }
  });

  return router;
}
