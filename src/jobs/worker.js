export const backoffSeconds = (attempts, base) => base * 2 ** (attempts - 1);

export function createWorker(jobRepo, handlers, logger, config) {
  async function runOnce() {
    const job = await jobRepo.claimNext();
    if (!job) return false;
    try {
      const handler = handlers[job.type];
      if (!handler) throw new Error(`no handler for job type "${job.type}"`);
      await handler(job.payload);
      await jobRepo.markDone(job.id);
    } catch (err) {
      if (job.attempts >= job.max_attempts) {
        await jobRepo.markDead(job.id, err.message);
        logger.error('job_dead_lettered', { jobId: job.id, type: job.type, attempts: job.attempts, error: err.message });
      } else {
        const delay = backoffSeconds(job.attempts, config.JOB_BACKOFF_BASE_S);
        await jobRepo.markRetry(job.id, err.message, delay);
        logger.warn('job_retry_scheduled', { jobId: job.id, type: job.type, attempt: job.attempts, retryInSeconds: delay, error: err.message });
      }
    }
    return true;
  }
  let timer = null;
  return {
    runOnce,
    start() { if (timer) return; timer = setInterval(async () => { try { while (await runOnce()); } catch (err) { logger.error('worker_tick_failed', { error: err.message }); } }, config.JOB_POLL_MS); timer.unref?.(); },
    stop() { clearInterval(timer); timer = null; },
  };
}
