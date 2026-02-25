/**
 * src/middleware/validate.ts
 *
 * Zod request body validation middleware factory.
 *
 * WHY: Centralising validation in middleware keeps route handlers clean.
 * The route handler can trust that `req.body` is already valid typed data.
 *
 * USAGE:
 *   router.post('/chat', validate(ChatSchema), chatHandler)
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Returns an Express middleware that validates `req.body` against `schema`.
 * On failure it sends a 400 with structured error details.
 */
export function validate<T>(schema: ZodSchema<T>) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.body);

        if (!result.success) {
            const errors = result.error.errors.map((e: ZodError['errors'][number]) => ({
                field: e.path.join('.'),
                message: e.message,
            }));

            res.status(400).json({
                error: 'Validation failed',
                details: errors,
            });
            return;
        }

        // Replace req.body with the parsed (and possibly transformed) data
        req.body = result.data;
        next();
    };
}
