import { Router } from 'express';
import { z } from 'zod';
import { requireApiKey } from '../middleware/auth.js';
import { validationError } from '../lib/errors.js';

const fieldSchema = z.object({ name: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), label: z.string().min(1).max(80), type: z.enum(['text', 'email', 'textarea']), required: z.boolean().optional().default(false), maxLength: z.number().int().min(1).max(2000).optional() });
const createSchema = z.object({ type: z.enum(['signup_form', 'contact_form', 'cta']), title: z.string().min(1).max(100), description: z.string().max(300).optional(), buttonText: z.string().min(1).max(30).optional(), fields: z.array(fieldSchema).min(1).max(10), options: z.record(z.string(), z.any()).optional(), isActive: z.boolean().optional() });
const patchSchema = createSchema.partial();
const parse = (schema, body) => { const r = schema.safeParse(body); if (!r.success) throw validationError('Validation failed', r.error.issues.map((i) => ({ field: i.path.join('.') || '(body)', message: i.message }))); return r.data; };

export function createWidgetRoutes({ tenantRepo, widgetService }) {
  const router = Router();
  router.use(requireApiKey(tenantRepo));
  router.post('/', (req, res, next) => widgetService.create(req.tenant.id, parse(createSchema, req.body)).then((w) => res.status(201).json({ widget: w, embed: widgetService.embedSnippet(w.publicId) })).catch(next));
  router.get('/', (req, res, next) => widgetService.list(req.tenant.id).then((widgets) => res.json({ widgets })).catch(next));
  router.get('/:id', (req, res, next) => widgetService.get(req.tenant.id, req.params.id).then((w) => res.json({ widget: w, embed: widgetService.embedSnippet(w.publicId) })).catch(next));
  router.patch('/:id', (req, res, next) => widgetService.update(req.tenant.id, req.params.id, parse(patchSchema, req.body)).then((w) => res.json({ widget: w })).catch(next));
  router.delete('/:id', (req, res, next) => widgetService.remove(req.tenant.id, req.params.id).then(() => res.status(204).end()).catch(next));
  return router;
}
