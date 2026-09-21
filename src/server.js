import { buildApp } from './app.js';
import { createWorker } from './jobs/worker.js';
import { sendConfirmationEmail } from './jobs/handlers/sendConfirmationEmail.js';
import { notifyOwner } from './jobs/handlers/notifyOwner.js';

const { app, config, logger, pool, jobRepo, tenantRepo, mailer } = buildApp();
const server = app.listen(config.PORT, () => logger.info('server_listening', { port: config.PORT, geoMode: config.GEO_MODE, testControls: config.ENABLE_TEST_CONTROLS }));

const worker = createWorker(jobRepo, { send_confirmation_email: sendConfirmationEmail(mailer), notify_owner: notifyOwner(mailer, tenantRepo) }, logger, config);
worker.start();

async function shutdown() { logger.info('shutting_down'); worker.stop(); server.close(async () => { await pool.end(); process.exit(0); }); setTimeout(() => process.exit(1), 8000).unref(); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
