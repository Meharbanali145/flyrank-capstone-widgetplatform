import { loadConfig } from '../src/config/env.js';
import { createLogger } from '../src/lib/logger.js';
import { createPool } from '../src/repos/pool.js';
import { createTenantRepo } from '../src/repos/tenantRepo.js';
import { createWidgetRepo } from '../src/repos/widgetRepo.js';
import { createWidgetService } from '../src/services/widgetService.js';
import { hashApiKey } from '../src/lib/apikey.js';

const config = loadConfig();
const logger = createLogger('warn');
const pool = createPool(config.DATABASE_URL, logger);
const tenantRepo = createTenantRepo(pool);
const widgetRepo = createWidgetRepo(pool);
const widgetService = createWidgetService(widgetRepo, config);

async function ensureTenant(name, email, apiKey) {
  const existing = await tenantRepo.findByApiKeyHash(hashApiKey(apiKey));
  if (existing) return existing;
  const created = await tenantRepo.create({ name, email, apiKeyHash: hashApiKey(apiKey) });
  return created ?? tenantRepo.findByApiKeyHash(hashApiKey(apiKey));
}

async function main() {
  const a = await ensureTenant('Acme Coffee', 'a@example.com', config.SEED_TENANT_A_API_KEY);
  const b = await ensureTenant('Other Tenant', 'b@example.com', config.SEED_TENANT_B_API_KEY);
  const widgets = await widgetRepo.listByTenant(a.id);
  if (!widgets.length) {
    await widgetService.create(a.id, { type: 'signup_form', title: 'Join our newsletter', fields: [{ name: 'name', label: 'Name', type: 'text', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }] });
  }
  console.log(`\nSeed complete.\n  Tenant A (${a.email}) API key: ${config.SEED_TENANT_A_API_KEY}\n  Tenant B (${b.email}) API key: ${config.SEED_TENANT_B_API_KEY}\n`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
