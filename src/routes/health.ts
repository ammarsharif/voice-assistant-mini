/**
 * src/routes/health.ts
 *
 * GET /health — liveness probe endpoint.
 *
 * WHY: Load balancers (AWS ALB, Kubernetes, Railway, Fly.io) call this
 * endpoint to decide whether the instance is healthy enough to receive traffic.
 * Returning 200 means "I'm alive". A 500 triggers a restart.
 *
 * A deeper "readiness" check would verify DB + Redis connectivity too.
 */

import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'voice-ai-mini-agent',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
    });
});
