/**
 * src/routes/chat.ts
 *
 * POST /chat — the single entry point for all agent interactions.
 *
 * REQUEST:  { tenantId: string, message: string }
 * RESPONSE: { response: string, toolUsed?: string }
 *
 * The route is intentionally thin — it only handles HTTP concerns:
 *   - Parse + validate input
 *   - Delegate to the agent
 *   - Format and send the response
 *
 * All business logic lives in agent.ts.
 */

import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { run } from '../agent/agent';

export const chatRouter = Router();

// ── Input Schema ──────────────────────────────────────────────
// Validated before reaching the handler (see validate middleware)
const ChatBodySchema = z.object({
    tenantId: z.string().uuid('tenantId must be a valid UUID'),
    message: z.string().min(1, 'message cannot be empty').max(2000, 'message too long'),
});

type ChatBody = z.infer<typeof ChatBodySchema>;

// ── Route Handler ─────────────────────────────────────────────
chatRouter.post(
    '/',
    validate(ChatBodySchema),
    asyncHandler(async (req, res) => {
        const { tenantId, message } = req.body as ChatBody;

        console.log(`💬 [POST /chat] tenant=${tenantId} | message="${message.slice(0, 80)}..."`);

        // Delegate all logic to the agent core
        const result = await run({ tenantId, message });

        res.json({
            response: result.response,
            ...(result.toolUsed && { toolUsed: result.toolUsed }),
        });
    })
);
