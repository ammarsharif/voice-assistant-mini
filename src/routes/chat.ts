import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { validate } from '../middleware/validate';
import { withTenant } from '../middleware/tenantMiddleware';
import { asyncHandler } from '../utils/asyncHandler';
import { submitJob } from '../worker/worker';
import { interruptService } from '../services/interruptService';
import { logger } from '../utils/logger';

export const chatRouter = Router();

const ChatBodySchema = z.object({
    tenantId: z.string().uuid('tenantId must be a valid UUID'),
    message: z.string().min(1, 'message cannot be empty').max(2000, 'message too long'),
    sessionId: z.string().uuid('sessionId must be a valid UUID').optional(),
    stream: z.boolean().optional().default(false),
});

type ChatBody = z.infer<typeof ChatBodySchema>;

chatRouter.post(
    '/',
    validate(ChatBodySchema),
    asyncHandler(withTenant),
    asyncHandler(async (req, res) => {
        const { tenantId, message, sessionId: providedSessionId, stream } = req.body as ChatBody;
        const sessionId = providedSessionId ?? randomUUID();

        logger.info(
            'POST /chat',
            `tenant=${req.tenant!.name} | session=${sessionId} | stream=${stream} | msg="${message.slice(0, 80)}…"`
        );

        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            const sendEvent = (event: string, data: unknown) => {
                res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            };

            const jobPromise = submitJob(tenantId, sessionId, message);

            const { agentEvents } = await import('../events/eventBus');

            const onChunk = (e: { sessionId: string; chunk: string; index: number }) => {
                if (e.sessionId === sessionId) {
                    sendEvent('chunk', { chunk: e.chunk, index: e.index });
                }
            };

            const onToolStart = (e: { sessionId: string; toolName: string }) => {
                if (e.sessionId === sessionId) {
                    sendEvent('tool_start', { toolName: e.toolName });
                }
            };

            const onToolDone = (e: { sessionId: string; toolName: string }) => {
                if (e.sessionId === sessionId) {
                    sendEvent('tool_done', { toolName: e.toolName });
                }
            };

            const onInterrupted = (e: { sessionId: string; reason: string }) => {
                if (e.sessionId === sessionId) {
                    sendEvent('interrupted', { reason: e.reason });
                }
            };

            agentEvents.on('agent.chunk', onChunk);
            agentEvents.on('agent.tool.start', onToolStart);
            agentEvents.on('agent.tool.done', onToolDone);
            agentEvents.on('agent.interrupted', onInterrupted);

            const cleanup = () => {
                agentEvents.off('agent.chunk', onChunk);
                agentEvents.off('agent.tool.start', onToolStart);
                agentEvents.off('agent.tool.done', onToolDone);
                agentEvents.off('agent.interrupted', onInterrupted);
            };

            req.on('close', () => {
                cleanup();
                interruptService.signal(sessionId, 'client-disconnect');
                logger.warn('POST /chat', `SSE client disconnected — session=${sessionId}`);
            });

            try {
                const result = await jobPromise;
                cleanup();
                sendEvent('complete', {
                    response: result.response,
                    sessionId: result.sessionId,
                    situation: result.situation,
                    jobId: result.jobId,
                    durationMs: result.durationMs,
                    interrupted: result.interrupted,
                    ...(result.toolUsed && { toolUsed: result.toolUsed }),
                });
                res.end();
            } catch (err) {
                cleanup();
                sendEvent('error', { error: err instanceof Error ? err.message : String(err) });
                res.end();
            }

            return;
        }

        const result = await submitJob(tenantId, sessionId, message);

        res.json({
            response: result.response,
            sessionId: result.sessionId,
            situation: result.situation,
            jobId: result.jobId,
            durationMs: result.durationMs,
            interrupted: result.interrupted,
            ...(result.toolUsed && { toolUsed: result.toolUsed }),
        });
    })
);

const InterruptBodySchema = z.object({
    sessionId: z.string().uuid('sessionId must be a valid UUID'),
    reason: z.string().optional().default('manual-interrupt'),
});

chatRouter.post(
    '/interrupt',
    validate(InterruptBodySchema),
    asyncHandler(async (req, res) => {
        const { sessionId, reason } = req.body as z.infer<typeof InterruptBodySchema>;
        interruptService.signal(sessionId, reason);
        logger.warn('POST /chat/interrupt', `Barge-in signalled — session=${sessionId} | reason=${reason}`);
        res.json({ ok: true, sessionId, reason });
    })
);
