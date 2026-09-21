export function createJobRepo(pool) {
  return {
    // Writing the job row in the SAME transaction as the submission is the outbox pattern: the
    // side effect can never be "lost" because the DB commit is the single source of truth.
    async enqueue(client, type, payload, maxAttempts) {
      const runner = client ?? pool;
      const { rows } = await runner.query('INSERT INTO jobs (type, payload, max_attempts) VALUES ($1,$2,$3) RETURNING id', [type, JSON.stringify(payload), maxAttempts]);
      return rows[0].id;
    },
    async claimNext() {
      const { rows } = await pool.query(
        `UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_at = now()
         WHERE id = (SELECT id FROM jobs WHERE (status = 'pending' AND run_at <= now()) OR (status = 'running' AND locked_at < now() - interval '60 seconds')
                     ORDER BY run_at FOR UPDATE SKIP LOCKED LIMIT 1)
         RETURNING id, type, payload, attempts, max_attempts`);
      return rows[0] ?? null;
    },
    markDone: (id) => pool.query(`UPDATE jobs SET status = 'done', locked_at = NULL, last_error = NULL WHERE id = $1`, [id]),
    markRetry: (id, error, delaySeconds) => pool.query(`UPDATE jobs SET status = 'pending', locked_at = NULL, last_error = $2, run_at = now() + ($3::float * interval '1 second') WHERE id = $1`, [id, error.slice(0, 500), delaySeconds]),
    markDead: (id, error) => pool.query(`UPDATE jobs SET status = 'dead', locked_at = NULL, last_error = $2 WHERE id = $1`, [id, error.slice(0, 500)]),
    async counts() { const { rows } = await pool.query('SELECT status, count(*)::int n FROM jobs GROUP BY status'); return Object.fromEntries(rows.map((r) => [r.status, r.n])); },
    async recent(limit = 10) { const { rows } = await pool.query('SELECT id, type, status, attempts, max_attempts, last_error FROM jobs ORDER BY id DESC LIMIT $1', [limit]); return rows; },
  };
}
