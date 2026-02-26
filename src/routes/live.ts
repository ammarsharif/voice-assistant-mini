import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { validate } from '../middleware/validate';
import { withTenant } from '../middleware/tenantMiddleware';
import { asyncHandler } from '../utils/asyncHandler';
import { interruptService } from '../services/interruptService';
import { createLiveKitToken, listRoomParticipants } from '../config/livekit';
import { liveAgentRegistry } from '../agent/liveAgentRegistry';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export const liveRouter = Router();

const JoinSchema = z.object({
    tenantId: z.string().uuid('tenantId must be a valid UUID'),
    sessionId: z.string().uuid('sessionId must be a valid UUID').optional(),
    roomName: z.string().min(1).max(120).optional(),
    participantName: z.string().min(1).max(80).optional(),
});

const LeaveSchema = z.object({
    sessionId: z.string().uuid('sessionId must be a valid UUID'),
});

const AudioUploadSchema = z.object({
    tenantId: z.string().uuid('tenantId must be a valid UUID'),
    sessionId: z.string().uuid('sessionId must be a valid UUID').optional(),
    audioBase64: z.string().min(1),
});

liveRouter.post(
    '/join',
    validate(JoinSchema),
    asyncHandler(withTenant),
    asyncHandler(async (req, res) => {
        const { tenantId, sessionId: providedSessionId, roomName, participantName } = req.body as z.infer<typeof JoinSchema>;
        const sessionId = providedSessionId ?? randomUUID();
        const room = roomName ?? env.LIVEKIT_DEFAULT_ROOM;

        logger.info(
            'POST /live/join',
            `tenant=${req.tenant!.name} | session=${sessionId} | room=${room}`
        );

        const token = await createLiveKitToken({
            roomName: room,
            participantIdentity: `client-${sessionId}`,
            participantName: participantName ?? 'User',
            metadata: JSON.stringify({ sessionId, tenantId }),
        });

        await liveAgentRegistry.ensureRunner(tenantId, sessionId, room);

        res.json({
            ok: true,
            sessionId,
            room,
            livekitHost: env.LIVEKIT_HOST,
            token,
            agentIdentity: `agent-${sessionId}`,
        });
    })
);

liveRouter.post(
    '/leave',
    validate(LeaveSchema),
    asyncHandler(async (req, res) => {
        const { sessionId } = req.body as z.infer<typeof LeaveSchema>;

        logger.info('POST /live/leave', `session=${sessionId}`);

        await liveAgentRegistry.stopRunner(sessionId);
        interruptService.signal(sessionId, 'client-leave');

        res.json({ ok: true, sessionId });
    })
);

liveRouter.get(
    '/room/:roomName/participants',
    asyncHandler(async (req, res) => {
        const { roomName } = req.params;
        const participants = await listRoomParticipants(roomName);
        res.json({ roomName, participants });
    })
);

liveRouter.post(
    '/interrupt',
    validate(z.object({
        sessionId: z.string().uuid(),
        reason: z.string().optional().default('manual'),
    })),
    asyncHandler(async (req, res) => {
        const { sessionId, reason } = req.body as { sessionId: string; reason: string };
        interruptService.signal(sessionId, reason);
        liveAgentRegistry.getRunner(sessionId)?.interrupt(reason);
        logger.warn('POST /live/interrupt', `Barge-in — session=${sessionId} | reason=${reason}`);
        res.json({ ok: true, sessionId, reason });
    })
);

liveRouter.post(
    '/audio',
    validate(AudioUploadSchema),
    asyncHandler(withTenant),
    asyncHandler(async (req, res) => {
        const { tenantId, sessionId: providedSessionId, audioBase64 } = req.body as z.infer<typeof AudioUploadSchema>;
        const sessionId = providedSessionId ?? randomUUID();

        logger.info('POST /live/audio', `Fallback audio upload — session=${sessionId} | bytes=${audioBase64.length}`);

        const runner = await liveAgentRegistry.ensureRunner(tenantId, sessionId);
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        runner.feedAudio(audioBuffer);

        res.json({ ok: true, sessionId, bytes: audioBuffer.length });
    })
);

liveRouter.get(
    '/status/:sessionId',
    asyncHandler(async (req, res) => {
        const { sessionId } = req.params;
        const runner = liveAgentRegistry.getRunner(sessionId);
        res.json({
            sessionId,
            active: runner !== undefined,
            state: runner?.currentState ?? 'not-running',
        });
    })
);
