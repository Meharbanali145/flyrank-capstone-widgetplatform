import express from 'express';
import { loadConfig } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { createPool } from './repos/pool.js';
import { createTenantRepo } from './repos/tenantRepo.js';
import { createWidgetRepo } from './repos/widgetRepo.js';
import { createSubmissionRepo } from './repos/submissionRepo.js';
import { createJobRepo } from './repos/jobRepo.js';
import { createGeoChain } from './providers/geo/index.js';
import { createConsoleMailer } from './providers/mailer/console.js';
import { createFaults } from './lib/faults.js';
import { createWidgetService } from './services/widgetService.js';
import { createSubmissionService } from './services/submissionService.js';
import { createRateLimiters } from './middleware/rateLimit.js';
import { notFoundHandler, createErrorHandler } from './middleware/errorHandler.js';
import { createWidgetRoutes } from './routes/widgets.js';
import { createPublicRoutes } from './routes/public.js';
import { createControlRoutes } from './routes/control.js';
import { createDashboardRoutes } from './routes/dashboard.js';
import { createDashboardService } from './services/dashboardService.js';
import { createDashboardQueries } from './repos/submissionRepo.js';

export function buildApp(overrides = {}) {
  const config = overrides.config ?? loadConfig();
  const logger = overrides.logger ?? createLogger(config.LOG_LEVEL);
  const pool = overrides.pool ?? createPool(config.DATABASE_URL, logger);
  const faults = overrides.faults ?? createFaults();

  const tenantRepo = createTenantRepo(pool);
  const widgetRepo = createWidgetRepo(pool);
  const submissionRepo = createSubmissionRepo(pool);
  const jobRepo = createJobRepo(pool);
  const geoChain = createGeoChain(config, logger, faults);
  const mailer = createConsoleMailer(config, logger, faults);

  const widgetService = createWidgetService(widgetRepo, config);
  const submissionService = createSubmissionService({ pool, widgetRepo, submissionRepo, jobRepo, geoChain, logger, config });
  const dashboardQueries = createDashboardQueries(pool);
  const dashboardService = createDashboardService(submissionRepo, dashboardQueries);
  const { ipLimiter, widgetLimiter } = createRateLimiters(config);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);
  app.use(express.json({ limit: config.MAX_BODY_BYTES, strict: true }));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/widgets', ipLimiter, createWidgetRoutes({ tenantRepo, widgetService, submissionRepo }));
  app.use('/api/dashboard', ipLimiter, createDashboardRoutes({ tenantRepo, dashboardService, widgetRepo }));
  app.use('/', createPublicRoutes({ widgetService, widgetRepo, submissionService, widgetLimiter, config }));
  if (config.ENABLE_TEST_CONTROLS) app.use('/__control', createControlRoutes({ config, faults, jobRepo }));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return { app, config, logger, pool, tenantRepo, widgetRepo, submissionRepo, jobRepo, faults, mailer };
}
