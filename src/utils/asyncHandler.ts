/**
 * src/utils/asyncHandler.ts
 *
 * Wraps async route handlers to forward errors to Express's error middleware.
 *
 * WHY: Express does not catch errors from async functions by default.
 * Without this wrapper, an `await` that throws will silently hang the request.
 *
 * USAGE:
 *   router.post('/chat', asyncHandler(async (req, res) => { ... }))
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function asyncHandler(fn: AsyncRouteHandler): RequestHandler {
    return (req, res, next) => {
        fn(req, res, next).catch(next); // Forward thrown errors to errorHandler middleware
    };
}
