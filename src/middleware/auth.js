import { unauthorized } from '../lib/errors.js';
import { hashApiKey } from '../lib/apikey.js';
export function requireApiKey(tenantRepo) {
  return async (req, _res, next) => {
    const key = req.get('x-api-key');
    if (!key) return next(unauthorized('Missing X-API-Key header'));
    const tenant = await tenantRepo.findByApiKeyHash(hashApiKey(key));
    if (!tenant) return next(unauthorized('Invalid API key'));
    req.tenant = tenant;
    next();
  };
}
