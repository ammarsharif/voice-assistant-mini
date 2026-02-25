import { Request, Response, NextFunction } from 'express';

export function errorHandler(
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
): void {
    console.error('❌ [Error]', err.message);

    const isOperational = err.name === 'ZodError' || err.message.includes('not found');

    res.status(isOperational ? 400 : 500).json({
        error: isOperational ? err.message : 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
}
