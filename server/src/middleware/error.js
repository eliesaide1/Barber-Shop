import { ZodError } from 'zod';
import { env } from '../config/env.js';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Wraps an async handler so a rejected promise reaches the error middleware. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function notFound(_req, res) {
  res.status(404).json({ error: 'Route not found' });
}

/* eslint-disable-next-line no-unused-vars -- Express needs the 4-arg shape */
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: 'Check the highlighted fields',
      fields: Object.fromEntries(
        err.issues.map((i) => [i.path.join('.') || '_', i.message]),
      ),
    });
  }

  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || { value: 1 })[0];
    return res.status(409).json({ error: `That ${field} is already taken`, field });
  }

  if (err?.name === 'CastError') {
    return res.status(400).json({ error: 'Malformed id' });
  }

  const status = err.status || 500;
  if (status >= 500) console.error(err);

  return res.status(status).json({
    error: status >= 500 && env.nodeEnv === 'production' ? 'Something went wrong' : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
}
