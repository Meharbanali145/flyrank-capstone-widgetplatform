import { validationError } from './errors.js';
export function parseOrThrow(schema, input) {
  const r = schema.safeParse(input);
  if (!r.success) throw validationError('Validation failed', r.error.issues.map((i) => ({ field: i.path.join('.') || '(query)', message: i.message })));
  return r.data;
}
