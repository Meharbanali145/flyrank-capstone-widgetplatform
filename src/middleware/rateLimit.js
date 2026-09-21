import { rateLimit, MemoryStore } from 'express-rate-limit';
export function createRateLimiters(config) {
  const ipLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS, limit: config.RATE_LIMIT_IP_MAX, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests from this IP, slow down and retry shortly.' } }),
  });
  const widgetLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS, limit: config.RATE_LIMIT_WIDGET_MAX, standardHeaders: 'draft-7', legacyHeaders: false,
    keyGenerator: (req) => `widget:${req.params.publicId ?? req.body?.widgetId ?? 'none'}`,
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'This widget is receiving too many submissions right now.' } }),
  });
  return { ipLimiter, widgetLimiter };
}
