import { AppError } from '../lib/errors.js';
export const notFoundHandler = (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
export function createErrorHandler(logger) {
  return (err, req, res, _next) => {
    if (res.headersSent) return;
    if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
    logger.error('unhandled_error', { path: req.path, error: err.message, stack: err.stack?.split('\n').slice(0, 4).join(' | ') });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
  };
}
