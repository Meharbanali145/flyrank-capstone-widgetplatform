const COLS = 'id, public_id, tenant_id, type, title, description, button_text, fields, options, is_active, created_at, updated_at';
export function createWidgetRepo(pool) {
  return {
    async insert(tenantId, publicId, w) {
      const { rows } = await pool.query(
        `INSERT INTO widgets (public_id, tenant_id, type, title, description, button_text, fields, options, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (public_id) DO NOTHING RETURNING ${COLS}`,
        [publicId, tenantId, w.type, w.title, w.description, w.buttonText, JSON.stringify(w.fields), JSON.stringify(w.options ?? {}), w.isActive ?? true],
      );
      return rows[0] ?? null;
    },
    async listByTenant(tenantId) { const { rows } = await pool.query(`SELECT ${COLS} FROM widgets WHERE tenant_id = $1 ORDER BY created_at DESC`, [tenantId]); return rows; },
    async findByIdForTenant(tenantId, id) { const { rows } = await pool.query(`SELECT ${COLS} FROM widgets WHERE tenant_id = $1 AND id = $2`, [tenantId, id]); return rows[0] ?? null; },
    async findByPublicIdActive(publicId) { const { rows } = await pool.query(`SELECT ${COLS} FROM widgets WHERE public_id = $1 AND is_active = true`, [publicId]); return rows[0] ?? null; },
    async update(tenantId, id, patch) {
      const map = { type: 'type', title: 'title', description: 'description', buttonText: 'button_text', fields: 'fields', options: 'options', isActive: 'is_active' };
      const sets = []; const params = [tenantId, id];
      for (const [k, col] of Object.entries(map)) {
        if (patch[k] === undefined) continue;
        params.push(k === 'fields' || k === 'options' ? JSON.stringify(patch[k]) : patch[k]);
        sets.push(`${col} = $${params.length}`);
      }
      if (!sets.length) return this.findByIdForTenant(tenantId, id);
      const { rows } = await pool.query(`UPDATE widgets SET ${sets.join(', ')}, updated_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING ${COLS}`, params);
      return rows[0] ?? null;
    },
    async remove(tenantId, id) { const { rowCount } = await pool.query('DELETE FROM widgets WHERE tenant_id = $1 AND id = $2', [tenantId, id]); return rowCount > 0; },
  };
}
