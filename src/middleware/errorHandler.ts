import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export function errorHandler(
    err: Error & { statusCode?: number },
    _req: Request,
    res: Response,
    _next: NextFunction
): void {
    const isZodError = err instanceof ZodError;
    const isOperational = isZodError || err.message.includes('not found') || err.statusCode != null;
    const statusCode = err.statusCode ?? (isOperational ? 400 : 500);

    const finalStatus = err.statusCode === 429 ? 429 : statusCode;

    logger.error('ErrorHandler', `${finalStatus} — ${err.message}`);
    if (!isOperational) {
        logger.debug('ErrorHandler', 'Stack trace:', err.stack);
    }

    res.status(finalStatus).json({
        error: isOperational ? err.message : 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
}
