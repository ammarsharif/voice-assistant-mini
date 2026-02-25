import { Router } from 'express';
import { redisClient } from '../config/redis';
import { db } from '../config/db';
import { getRegisteredToolNames } from '../agent/toolRegistry';
import { logger } from '../utils/logger';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
    const checks: Record<string, 'ok' | 'error'> = {};

    try {
        await redisClient.ping();
        checks.redis = 'ok';
    } catch {
        logger.warn('Health', 'Redis ping failed');
        checks.redis = 'error';
    }

    try {
        const { error } = await db.from('tenants').select('id').limit(1);
        checks.database = error ? 'error' : 'ok';
        if (error) logger.warn('Health', `DB check failed: ${error.message}`);
    } catch {
        checks.database = 'error';
    }

    const allHealthy = Object.values(checks).every(v => v === 'ok');

    res.status(allHealthy ? 200 : 503).json({
        status: allHealthy ? 'ok' : 'degraded',
        service: 'voice-ai-mini-agent',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        checks,
        tools: getRegisteredToolNames(),
    });
});
