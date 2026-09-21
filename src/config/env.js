import 'dotenv/config';
import { z } from 'zod';
const GEO_NAMES = ['ip-api', 'ipapi-co'];
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  TRUST_PROXY: z.string().default('false'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  MAX_BODY_BYTES: z.coerce.number().int().min(256).default(10240),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(100).default(10000),
  RATE_LIMIT_IP_MAX: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_WIDGET_MAX: z.coerce.number().int().min(1).default(100),
  GEO_PROVIDER_ORDER: z.string().default('ip-api,ipapi-co'),
  GEO_TIMEOUT_MS: z.coerce.number().int().min(100).default(1500),
  GEO_IP_API_URL: z.string().url().default('http://ip-api.com/json'),
  GEO_IPAPI_CO_URL: z.string().url().default('https://ipapi.co'),
  GEO_MODE: z.enum(['mock', 'live']).default('mock'),
  EMAIL_MODE: z.enum(['console']).default('console'),
  FORCE_EMAIL_FAIL: z.enum(['true', 'false']).default('false'),
  JOB_POLL_MS: z.coerce.number().int().min(50).default(2000),
  JOB_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  JOB_BACKOFF_BASE_S: z.coerce.number().min(0).default(5),
  SEED_TENANT_A_API_KEY: z.string().min(16).default('dev-key-tenant-a-change-me'),
  SEED_TENANT_B_API_KEY: z.string().min(16).default('dev-key-tenant-b-change-me'),
  CONTROL_TOKEN: z.string().min(8).default('dev-control-token-change-me'),
  ENABLE_TEST_CONTROLS: z.enum(['true', 'false']).default('false'),
});
function parseTrustProxy(v) { if (v === 'false') return false; if (v === 'true') return true; if (/^\d+$/.test(v)) return Number(v); return v; }
export function loadConfig(env = process.env, overrides = {}) {
  const parsed = schema.safeParse({ ...env, ...overrides });
  if (!parsed.success) { const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`); throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`); }
  const c = parsed.data;
  const order = c.GEO_PROVIDER_ORDER.split(',').map((s) => s.trim()).filter(Boolean);
  const bad = order.filter((n) => !GEO_NAMES.includes(n));
  if (bad.length) throw new Error(`Invalid GEO_PROVIDER_ORDER entries: ${bad.join(', ')} (allowed: ${GEO_NAMES.join(', ')})`);
  if (c.NODE_ENV === 'production' && c.ENABLE_TEST_CONTROLS === 'true') throw new Error('Refusing to start: ENABLE_TEST_CONTROLS=true is not allowed in production.');
  return Object.freeze({ ...c, TRUST_PROXY: parseTrustProxy(c.TRUST_PROXY), GEO_PROVIDER_ORDER: order, FORCE_EMAIL_FAIL: c.FORCE_EMAIL_FAIL === 'true', ENABLE_TEST_CONTROLS: c.ENABLE_TEST_CONTROLS === 'true' });
}
