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
    message: z.string().min(1).max(2000).optional(),
    audioInput: z.string().min(1).max(2000).optional(),
    sessionId: z.string().uuid('sessionId must be a valid UUID').optional(),
    stream: z.boolean().optional().default(false),
}).refine((d) => d.message || d.audioInput, {
    message: 'Either "message" or "audioInput" must be provided',
    path: ['message'],
});

type ChatBody = z.infer<typeof ChatBodySchema>;

chatRouter.post(
    '/',
    validate(ChatBodySchema),
    asyncHandler(withTenant),
    asyncHandler(async (req, res) => {
        const { tenantId, message, audioInput, sessionId: providedSessionId, stream } = req.body as ChatBody;
        const sessionId = providedSessionId ?? randomUUID();

        logger.info(
            'POST /chat',
            `tenant=${req.tenant!.name} | session=${sessionId} | stream=${stream} | ` +
            (audioInput ? `audio="${audioInput.slice(0, 60)}…"` : `msg="${message!.slice(0, 80)}…"`)
        );

        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            const sendEvent = (event: string, data: unknown) => {
                res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            };

            const jobPromise = submitJob(tenantId, sessionId, message ?? audioInput!, audioInput);

            const { agentEvents } = await import('../events/eventBus');

            const onChunk = (e: { sessionId: string; chunk: string; index: number }) => {
                if (e.sessionId === sessionId) {
                    sendEvent('chunk', { chunk: e.chunk, index: e.index });
                }
            };

            const onAudioChunk = (e: { sessionId: string; index: number; audio: string; text: string; durationMs: number }) => {
                if (e.sessionId === sessionId) {
                    sendEvent('audio_chunk', { index: e.index, audio: e.audio, text: e.text, durationMs: e.durationMs });
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

            const onSttDone = (e: { sessionId: string; transcript: string; confidence: number; processingMs: number }) => {
                if (e.sessionId === sessionId) {
                    sendEvent('stt_done', { transcript: e.transcript, confidence: e.confidence, processingMs: e.processingMs });
                }
            };

            agentEvents.on('agent.chunk', onChunk);
            agentEvents.on('agent.audioChunk', onAudioChunk);
            agentEvents.on('agent.tool.start', onToolStart);
            agentEvents.on('agent.tool.done', onToolDone);
            agentEvents.on('agent.interrupted', onInterrupted);
            agentEvents.on('agent.stt.done', onSttDone);

            const cleanup = () => {
                agentEvents.off('agent.chunk', onChunk);
                agentEvents.off('agent.audioChunk', onAudioChunk);
                agentEvents.off('agent.tool.start', onToolStart);
                agentEvents.off('agent.tool.done', onToolDone);
                agentEvents.off('agent.interrupted', onInterrupted);
                agentEvents.off('agent.stt.done', onSttDone);
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
                    audioChunks: result.audioChunks,
                    ...(result.transcript !== undefined && { transcript: result.transcript }),
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

        const result = await submitJob(tenantId, sessionId, message ?? audioInput!, audioInput);

        res.json({
            response: result.response,
            sessionId: result.sessionId,
            situation: result.situation,
            jobId: result.jobId,
            durationMs: result.durationMs,
            interrupted: result.interrupted,
            audioChunks: result.audioChunks,
            ...(result.transcript !== undefined && { transcript: result.transcript }),
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
