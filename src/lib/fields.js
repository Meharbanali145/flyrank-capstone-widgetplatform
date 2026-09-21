import { z } from 'zod';
const DEFAULT_MAX = { text: 200, email: 254, textarea: 2000 };
export function buildFieldsSchema(fields) {
  const shape = {};
  for (const f of fields) {
    const label = f.label || f.name;
    const max = f.maxLength ?? DEFAULT_MAX[f.type] ?? 200;
    let base = z.string({ invalid_type_error: `${label} must be text`, required_error: `${label} is required` }).trim();
    if (f.type === 'email') base = base.email(`${label} must be a valid email`);
    base = base.max(max, `${label} must be at most ${max} characters`);
    shape[f.name] = f.required ? base.min(1, `${label} is required`) : z.union([z.literal(''), base]).optional();
  }
  return z.object(shape).strict();
}
export function compact(data) { return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '' && v !== undefined)); }
export function findEmail(fields, data) { const f = fields.find((x) => x.type === 'email' && typeof data[x.name] === 'string' && data[x.name]); return f ? data[f.name] : null; }
