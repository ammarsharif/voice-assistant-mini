import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { withTenant } from '../middleware/tenantMiddleware';
import { asyncHandler } from '../utils/asyncHandler';
import { submitJob } from '../worker/worker';
import { logger } from '../utils/logger';

export const chatRouter = Router();

const ChatBodySchema = z.object({
    tenantId: z.string().uuid('tenantId must be a valid UUID'),
    message: z.string().min(1, 'message cannot be empty').max(2000, 'message too long'),
});

type ChatBody = z.infer<typeof ChatBodySchema>;

chatRouter.post(
    '/',
    validate(ChatBodySchema),
    asyncHandler(withTenant),
    asyncHandler(async (req, res) => {
        const { tenantId, message } = req.body as ChatBody;

        logger.info('POST /chat', `tenant=${req.tenant!.name} | msg="${message.slice(0, 80)}…"`);

        const result = await submitJob(tenantId, message);

        res.json({
            response: result.response,
            jobId: result.jobId,
            durationMs: result.durationMs,
            ...(result.toolUsed && { toolUsed: result.toolUsed }),
        });
    })
);
