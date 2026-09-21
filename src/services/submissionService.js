import { randomUUID } from 'node:crypto';
import { notFound } from '../lib/errors.js';
import { buildFieldsSchema, compact, findEmail } from '../lib/fields.js';
import { honeypotTripped } from '../lib/honeypot.js';
import { withTransaction } from '../repos/pool.js';

// The fake success a bot sees when it trips the honeypot. It must be indistinguishable from
// a real 201 so the bot's script gets no signal to adapt around — the row is never written.
const fakeSuccess = () => ({ status: 201, body: { ok: true, id: randomUUID() } });

export function createSubmissionService({ pool, widgetRepo, submissionRepo, jobRepo, geoChain, logger, config }) {
  return {
    async submit({ widgetPublicId, data, honeypotValue, ip, idempotencyKey }) {
      const widget = await widgetRepo.findByPublicIdActive(widgetPublicId);
      if (!widget) throw notFound('Unknown widget');

      // 1. Honeypot — checked BEFORE validation, so a bot filling garbage into every real
      //    field still gets the fake success instead of a helpful 422 that teaches it what's wrong.
      if (honeypotTripped(honeypotValue)) {
        logger.info('spam_dropped', { reason: 'honeypot', widgetId: widget.id });
        return fakeSuccess();
      }

      // 2. Validate the payload against exactly this widget's own field definitions.
      const schema = buildFieldsSchema(widget.fields);
      const parsed = schema.safeParse(data ?? {});
      if (!parsed.success) {
        const details = parsed.error.issues.map((i) => ({ field: i.path.join('.') || '(body)', message: i.message }));
        return { status: 422, body: { error: { code: 'VALIDATION_FAILED', message: 'Validation failed', details } } };
      }
      const clean = compact(parsed.data);

      // 3. Idempotency: check BEFORE enrichment/side-effect work, so a retried request is cheap
      //    and never double-queues an email.
      if (idempotencyKey) {
        const prior = await submissionRepo.findByIdempotencyKey(widget.id, idempotencyKey);
        if (prior) return { status: 200, replay: true, body: { ok: true, id: prior.id } };
      }

      // 4. Geo enrichment. Contract: NEVER throws — a broken provider degrades the record, not the request.
      const geo = await geoChain.enrich(ip);

      // 5. Store submission + enqueue side-effect jobs in ONE transaction (outbox pattern):
      //    either both land or neither does, so an email can never be silently lost relative to the row.
      const result = await withTransaction(pool, async (client) => {
        const stored = await submissionRepo.insert(client, {
          widgetId: widget.id, tenantId: widget.tenant_id, data: clean, ipAddress: ip,
          country: geo?.country ?? null, region: geo?.region ?? null, city: geo?.city ?? null,
          geoProvider: geo?.provider ?? null, idempotencyKey: idempotencyKey ?? null,
        });
        if (!stored.created) return { replay: true, id: stored.id };
        const visitorEmail = findEmail(widget.fields, clean);
        if (visitorEmail) await jobRepo.enqueue(client, 'send_confirmation_email', { to: visitorEmail, widgetTitle: widget.title }, config.JOB_MAX_ATTEMPTS);
        await jobRepo.enqueue(client, 'notify_owner', { widgetId: widget.id, submissionId: stored.id, widgetTitle: widget.title }, config.JOB_MAX_ATTEMPTS);
        return { replay: false, id: stored.id };
      });

      return { status: result.replay ? 200 : 201, replay: result.replay, body: { ok: true, id: result.id } };
    },
  };
}
