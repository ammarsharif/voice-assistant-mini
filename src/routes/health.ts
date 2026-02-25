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
