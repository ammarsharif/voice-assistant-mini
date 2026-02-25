import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { validate } from '../middleware/validate';
import { withTenant } from '../middleware/tenantMiddleware';
import { asyncHandler } from '../utils/asyncHandler';
import { submitJob } from '../worker/worker';
import { logger } from '../utils/logger';

export const chatRouter = Router();

const ChatBodySchema = z.object({
    tenantId: z.string().uuid('tenantId must be a valid UUID'),
    message: z.string().min(1, 'message cannot be empty').max(2000, 'message too long'),
    sessionId: z.string().uuid('sessionId must be a valid UUID').optional(),
});

type ChatBody = z.infer<typeof ChatBodySchema>;

chatRouter.post(
    '/',
    validate(ChatBodySchema),
    asyncHandler(withTenant),
    asyncHandler(async (req, res) => {
        const { tenantId, message, sessionId: providedSessionId } = req.body as ChatBody;

        const sessionId = providedSessionId ?? randomUUID();

        logger.info('POST /chat', `tenant=${req.tenant!.name} | session=${sessionId} | msg="${message.slice(0, 80)}…"`);

        const result = await submitJob(tenantId, sessionId, message);

        res.json({
            response: result.response,
            sessionId: result.sessionId,
            situation: result.situation,
            jobId: result.jobId,
            durationMs: result.durationMs,
            ...(result.toolUsed && { toolUsed: result.toolUsed }),
        });
    })
);
