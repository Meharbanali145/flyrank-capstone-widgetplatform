import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { unauthorized } from '../lib/errors.js';

export function createControlRoutes({ config, faults, jobRepo }) {
  const router = Router();
  router.use((req, _res, next) => {
    const given = Buffer.from(req.get('x-control-token') ?? '');
    const want = Buffer.from(config.CONTROL_TOKEN);
    if (given.length !== want.length || !timingSafeEqual(given, want)) return next(unauthorized('Bad control token'));
    next();
  });
  router.get('/state', async (_req, res) => res.json({ faults: faults.snapshot(), jobs: { counts: await jobRepo.counts(), recent: await jobRepo.recent(10) } }));
  router.post('/faults', (req, res) => res.json({ faults: faults.set(req.body ?? {}) }));
  router.post('/reset', (_req, res) => res.json({ faults: faults.reset() }));
  return router;
}
