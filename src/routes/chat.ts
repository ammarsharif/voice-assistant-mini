import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { run } from '../agent/agent';

export const chatRouter = Router();

const ChatBodySchema = z.object({
    tenantId: z.string().uuid('tenantId must be a valid UUID'),
    message: z.string().min(1, 'message cannot be empty').max(2000, 'message too long'),
});

type ChatBody = z.infer<typeof ChatBodySchema>;

chatRouter.post(
    '/',
    validate(ChatBodySchema),
    asyncHandler(async (req, res) => {
        const { tenantId, message } = req.body as ChatBody;

        console.log(`💬 [POST /chat] tenant=${tenantId} | message="${message.slice(0, 80)}..."`);

        const result = await run({ tenantId, message });

        res.json({
            response: result.response,
            ...(result.toolUsed && { toolUsed: result.toolUsed }),
        });
    })
);
