/**
 * src/middleware/errorHandler.ts
 *
 * Global Express error-handling middleware.
 *
 * WHY: Any uncaught error thrown inside a route handler or async middleware
 * bubbles up here instead of crashing the process. We log it and return
 * a clean JSON error response.
 *
 * IMPORTANT: Express identifies error handlers by their 4-argument signature
 * (err, req, res, next) — do NOT remove the `next` parameter even if unused.
 */

import { Request, Response, NextFunction } from 'express';

export function errorHandler(
    err: Error,
    _req: Request,
    res: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: NextFunction
): void {
    console.error('❌ [Error]', err.message);

    // Distinguish known operational errors from unexpected ones
    const isOperational = err.name === 'ZodError' || err.message.includes('not found');

    res.status(isOperational ? 400 : 500).json({
        error: isOperational ? err.message : 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
}
