export class AppError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}
export const validationError = (message, details) => new AppError(400, 'VALIDATION_FAILED', message, details);
export const unauthorized = (message = 'Missing or invalid API key') => new AppError(401, 'UNAUTHORIZED', message);
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message, code = 'CONFLICT') => new AppError(409, code, message);
