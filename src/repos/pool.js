import pg from 'pg';
export function createPool(connectionString, logger) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  pool.on('error', (err) => logger.error('pg_pool_error', { error: err.message }));
  return pool;
}

// Runs fn(client) inside BEGIN/COMMIT so the submission insert and its outbox job rows
// either all land or none do — the job can never be "lost" relative to the submission.
export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
