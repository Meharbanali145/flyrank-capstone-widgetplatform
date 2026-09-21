export function createTenantRepo(pool) {
  return {
    async findByApiKeyHash(hash) {
      const { rows } = await pool.query('SELECT id, name, email FROM tenants WHERE api_key_hash = $1', [hash]);
      return rows[0] ?? null;
    },
    async create({ name, email, apiKeyHash }) {
      const { rows } = await pool.query('INSERT INTO tenants (name, email, api_key_hash) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING RETURNING id, name, email', [name, email, apiKeyHash]);
      return rows[0] ?? null;
    },
  };
}
