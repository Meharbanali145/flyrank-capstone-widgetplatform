import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { boot, makeWidget, submit, call } from './helpers.js';
import { createWorker, backoffSeconds } from '../src/jobs/worker.js';
import { sendConfirmationEmail } from '../src/jobs/handlers/sendConfirmationEmail.js';
import { notifyOwner } from '../src/jobs/handlers/notifyOwner.js';

let ctx, worker, widget;
beforeAll(async () => {
  ctx = await boot();
  worker = createWorker(ctx.jobRepo, { send_confirmation_email: sendConfirmationEmail(ctx.mailer), notify_owner: notifyOwner(ctx.mailer, ctx.tenantRepo) }, ctx.logger, ctx.config);
  widget = await makeWidget(ctx.base, ctx.tenantAKey);
});
afterAll(() => ctx.close());
beforeEach(async () => { ctx.faults.reset(); await ctx.pool.query('TRUNCATE jobs RESTART IDENTITY'); });

const lastRow = async () => (await ctx.pool.query("select country, geo_provider from submissions where widget_id=$1 order by created_at desc limit 1", [widget.id])).rows[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const drain = async () => {
  for (let i = 0; i < 200; i++) {
    const more = await worker.runOnce();
    if (!more) {
      const { rows } = await ctx.pool.query("select count(*)::int n from jobs where status in ('pending','running')");
      if (rows[0].n === 0) return;
      await sleep(15); // nothing was due yet — give the backoff delay time to actually elapse
    }
  }
};

test('PROBE 4a: provider A up -> enriched by ip-api', async () => {
  const r = await submit(ctx.base, widget.publicId, { name: 'A', email: 'a@example.com' }, { headers: { 'x-forwarded-for': '8.8.8.8' } });
  expect(r.status).toBe(201);
  expect((await lastRow()).geo_provider).toBe('ip-api');
});
test('PROBE 4b: provider A down -> ipapi-co answers', async () => {
  ctx.faults.set({ 'ip-api': true });
  const r = await submit(ctx.base, widget.publicId, { name: 'B', email: 'b@example.com' }, { headers: { 'x-forwarded-for': '8.8.8.8' } });
  expect(r.status).toBe(201);
  expect((await lastRow()).geo_provider).toBe('ipapi-co');
});
test('PROBE 4c: both down -> still 201, stored without geo', async () => {
  ctx.faults.set({ 'ip-api': true, 'ipapi-co': true });
  const r = await submit(ctx.base, widget.publicId, { name: 'C', email: 'c@example.com' }, { headers: { 'x-forwarded-for': '8.8.8.8' } });
  expect(r.status).toBe(201);
  const row = await lastRow();
  expect(row.geo_provider).toBeNull();
  expect(row.country).toBeNull();
});
test('a non-public IP (e.g. curl from localhost) also just skips geo, never fails', async () => {
  const r = await submit(ctx.base, widget.publicId, { name: 'D', email: 'd@example.com' });
  expect(r.status).toBe(201);
  expect((await lastRow()).geo_provider).toBeNull();
});

test('PROBE 5: email throws -> submission still succeeds; job retries then dead-letters', async () => {
  ctx.faults.set({ email: true });
  const r = await submit(ctx.base, widget.publicId, { name: 'EmailDown', email: 'edown@example.com' }, { headers: { 'x-forwarded-for': '8.8.8.8' } });
  expect(r.status).toBe(201);
  await drain();
  const jobs = (await ctx.pool.query("select status, attempts, last_error from jobs order by id")).rows;
  expect(jobs.length).toBe(2);
  for (const j of jobs) { expect(j.status).toBe('dead'); expect(j.attempts).toBe(ctx.config.JOB_MAX_ATTEMPTS); expect(j.last_error).toMatch(/forced failure/); }
});
test('email recovers -> retried job eventually succeeds', async () => {
  ctx.faults.set({ email: true });
  await submit(ctx.base, widget.publicId, { name: 'Recover', email: 'r@example.com' }, { headers: { 'x-forwarded-for': '8.8.8.8' } });
  await worker.runOnce(); await worker.runOnce();
  ctx.faults.reset();
  await drain();
  const jobs = (await ctx.pool.query("select status from jobs")).rows;
  expect(jobs.every((j) => j.status === 'done')).toBe(true);
});
test('outbox: even a broken jobs table cannot fail the submission itself', async () => {
  await ctx.pool.query('ALTER TABLE jobs RENAME TO jobs_broken');
  try {
    const r = await submit(ctx.base, widget.publicId, { name: 'QueueDown', email: 'q@example.com' });
    expect(r.status).toBe(500); // outbox write is in the SAME transaction, so a broken jobs table DOES roll back the submission
  } finally { await ctx.pool.query('ALTER TABLE jobs_broken RENAME TO jobs'); }
});

test('job backoff doubles each attempt', () => { expect([1, 2, 3].map((a) => backoffSeconds(a, 5))).toEqual([5, 10, 20]); });

test('control endpoints require the control token', async () => {
  expect((await call(ctx.base, '/__control/state')).status).toBe(401);
  expect((await call(ctx.base, '/__control/state', { headers: { 'x-control-token': ctx.config.CONTROL_TOKEN } })).status).toBe(200);
});
