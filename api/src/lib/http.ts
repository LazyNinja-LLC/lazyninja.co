import type { ErrorRequestHandler, RequestHandler } from 'express';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * CORS without a dependency. Only listed origins get CORS headers; outside
 * production any http://localhost:* / 127.0.0.1:* origin is allowed for dev.
 */
export function cors(
  allowedOrigins: string[],
  { allowLocalhost }: { allowLocalhost: boolean },
): RequestHandler {
  const allowed = new Set(allowedOrigins);
  const isLocal = (o: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
  return (req, res, next) => {
    const origin = req.headers.origin;
    const ok = !!origin && (allowed.has(origin) || (allowLocalhost && isLocal(origin)));
    res.vary('Origin');
    if (ok) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    if (req.method === 'OPTIONS') {
      if (ok) {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Max-Age', '86400');
      }
      res.status(204).end();
      return;
    }
    next();
  };
}

/** JSON 404 for unknown routes. */
export const notFound: RequestHandler = (_req, _res, next) => next(new HttpError(404, 'Not found'));

/** Structured errors. Stack traces are logged, and only included in responses outside production. */
export function errorHandler({ isProd }: { isProd: boolean }): ErrorRequestHandler {
  return (err, req, res, _next) => {
    let status = 500;
    let message = 'Internal server error';
    let details: unknown;

    if (err instanceof HttpError) {
      status = err.status;
      message = err.message;
      details = err.details;
    } else if (err && typeof err === 'object' && 'type' in err) {
      // body-parser errors
      const type = (err as { type?: string }).type;
      if (type === 'entity.too.large') {
        status = 413;
        message = 'Request body too large';
      } else if (type === 'entity.parse.failed') {
        status = 400;
        message = 'Malformed JSON';
      } else if (typeof (err as { status?: number }).status === 'number') {
        status = (err as { status: number }).status;
        message = status < 500 ? 'Bad request' : message;
      }
    }

    if (status >= 500) {
      console.error(
        JSON.stringify({
          level: 'error',
          time: new Date().toISOString(),
          method: req.method,
          path: req.path,
          message: (err as Error)?.message,
          stack: (err as Error)?.stack,
        }),
      );
    }

    res.status(status).json({
      error: message,
      ...(details !== undefined ? { details } : {}),
      ...(!isProd && status >= 500 && err instanceof Error ? { stack: err.stack } : {}),
    });
  };
}
