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
