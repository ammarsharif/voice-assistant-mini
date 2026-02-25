/**
 * src/app.ts
 *
 * Express application factory.
 *
 * WHY SEPARATE FROM server.ts:
 * Keeping the Express app creation separate from the HTTP server startup
 * makes the app testable — test files can import `createApp()` and run
 * supertest against it without binding to a port.
 *
 * The server.ts file is the only entry point that starts the actual listener.
 */

import express from 'express';
import { chatRouter } from './routes/chat';
import { healthRouter } from './routes/health';
import { errorHandler } from './middleware/errorHandler';

export function createApp(): express.Application {
    const app = express();

    // ── Core Middleware ──────────────────────────────────────────
    app.use(express.json({ limit: '10kb' })); // Parse JSON bodies; limit size to prevent DoS

    // ── Routes ───────────────────────────────────────────────────
    app.use('/health', healthRouter);
    app.use('/chat', chatRouter);

    // 404 handler — must come after all routes
    app.use((_req, res) => {
        res.status(404).json({ error: 'Route not found' });
    });

    // ── Global Error Handler ─────────────────────────────────────
    // Must be the LAST middleware registered (4 params = error handler in Express)
    app.use(errorHandler);

    return app;
}
