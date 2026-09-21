import { randomBytes } from 'node:crypto';
import { notFound } from '../lib/errors.js';
const newPublicId = () => randomBytes(6).toString('base64url').replace(/[-_]/g, 'x');
const shape = (w) => ({ id: w.id, publicId: w.public_id, type: w.type, title: w.title, description: w.description, buttonText: w.button_text, fields: w.fields, options: w.options, isActive: w.is_active, createdAt: w.created_at, updatedAt: w.updated_at });

export function createWidgetService(widgetRepo, config) {
  return {
    async create(tenantId, input) {
      const values = { type: input.type, title: input.title, description: input.description ?? '', buttonText: input.buttonText ?? 'Submit', fields: input.fields, options: input.options ?? {}, isActive: input.isActive ?? true };
      for (let i = 0; i < 5; i++) { const row = await widgetRepo.insert(tenantId, newPublicId(), values); if (row) return shape(row); }
      throw new Error('could not allocate a unique widget public_id');
    },
    list: async (tenantId) => (await widgetRepo.listByTenant(tenantId)).map(shape),
    async get(tenantId, id) { const w = await widgetRepo.findByIdForTenant(tenantId, id); if (!w) throw notFound('Widget not found'); return shape(w); },
    async update(tenantId, id, patch) { const w = await widgetRepo.update(tenantId, id, patch); if (!w) throw notFound('Widget not found'); return shape(w); },
    async remove(tenantId, id) { if (!(await widgetRepo.remove(tenantId, id))) throw notFound('Widget not found'); },
    embedSnippet(publicId) { const url = `${config.PUBLIC_BASE_URL}/widgets/${publicId}/embed.js`; return { url, html: `<script src="${url}" async></script>` }; },
    async publicConfig(publicId, widgetRepo2 = widgetRepo) {
      const w = await widgetRepo2.findByPublicIdActive(publicId);
      if (!w) return null;
      return { id: w.public_id, type: w.type, title: w.title, description: w.description, buttonText: w.button_text, fields: w.fields, options: w.options };
    },
  };
}
