export function createSubmissionRepo(pool) {
  return {
    // ON CONFLICT covers the (widget_id, idempotency_key) unique constraint; a NULL key never collides.
    async insert(client, s) {
      const runner = client ?? pool;
      const { rows } = await runner.query(
        `INSERT INTO submissions (widget_id, tenant_id, data, ip_address, country, region, city, geo_provider, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (widget_id, idempotency_key) DO NOTHING RETURNING id, created_at`,
        [s.widgetId, s.tenantId, JSON.stringify(s.data), s.ipAddress, s.country, s.region, s.city, s.geoProvider, s.idempotencyKey],
      );
      if (rows[0]) return { ...rows[0], created: true };
      const existing = await runner.query('SELECT id, created_at FROM submissions WHERE widget_id = $1 AND idempotency_key = $2', [s.widgetId, s.idempotencyKey]);
      return { ...existing.rows[0], created: false };
    },
    async listByTenant(tenantId, { widgetId, limit = 25, before } = {}) {
      const params = [tenantId]; let where = 'tenant_id = $1';
      if (widgetId) { params.push(widgetId); where += ` AND widget_id = $${params.length}`; }
      if (before) { params.push(before); where += ` AND id < $${params.length}`; }
      params.push(limit);
      const { rows } = await pool.query(`SELECT id, widget_id, data, country, region, city, geo_provider, created_at FROM submissions WHERE ${where} ORDER BY id DESC LIMIT $${params.length}`, params);
      return rows;
    },
    async findByIdempotencyKey(widgetId, key) {
      const { rows } = await pool.query('SELECT id, created_at FROM submissions WHERE widget_id = $1 AND idempotency_key = $2', [widgetId, key]);
      return rows[0] ?? null;
    },
  };
}

// Dashboard aggregations: everything scoped by tenant_id in the WHERE clause, never joined
// implicitly through widgets — a query filtered ONLY by a widget owned by someone else
// still returns zero rows, not another tenant's data.
export function createDashboardQueries(pool) {
  return {
    async stats(tenantId, days) {
      const [totals, perWidget, overTime, geo] = await Promise.all([
        pool.query(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS last_24h,
                  count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS last_7d
           FROM submissions WHERE tenant_id = $1`, [tenantId]),
        pool.query(
          `SELECT w.public_id AS widget_id, w.title, count(s.id)::int AS submissions, max(s.created_at) AS last_submission_at
           FROM widgets w LEFT JOIN submissions s ON s.widget_id = w.id AND s.tenant_id = w.tenant_id
           WHERE w.tenant_id = $1 GROUP BY w.id ORDER BY submissions DESC, w.title`, [tenantId]),
        pool.query(
          `SELECT to_char(d::date, 'YYYY-MM-DD') AS day, count(s.id)::int AS submissions
           FROM generate_series((now() AT TIME ZONE 'UTC')::date - ($2::int - 1), (now() AT TIME ZONE 'UTC')::date, interval '1 day') d
           LEFT JOIN submissions s ON s.tenant_id = $1 AND (s.created_at AT TIME ZONE 'UTC')::date = d::date
           GROUP BY d ORDER BY d`, [tenantId, days]),
        pool.query(
          `SELECT coalesce(country, 'Unknown') AS country, count(*)::int AS submissions
           FROM submissions WHERE tenant_id = $1 GROUP BY country ORDER BY submissions DESC LIMIT 50`, [tenantId]),
      ]);
      return { totals: totals.rows[0], perWidget: perWidget.rows, overTime: overTime.rows, geo: geo.rows };
    },
  };
}
