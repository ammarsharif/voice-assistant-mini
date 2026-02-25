import { AgentProcess } from '../agent/agentProcess';
import { interruptService } from '../services/interruptService';
import { logger } from '../utils/logger';
import { wsClientManager } from './wsClientManager';
import { agentEvents } from '../events/eventBus';
import type { AudioChunkEvent } from '../services/messageChannel';

interface WsMessagePayload {
    sessionId: string;
    tenantId: string;
    text?: string;
    audioInput?: string;
    stream?: boolean;
}

interface WsInterruptPayload {
    sessionId: string;
    reason?: string;
}

interface WsInboundFrame {
    type: 'message' | 'interrupt';
    payload: WsMessagePayload | WsInterruptPayload;
}

const activeSessions = new Map<string, AgentProcess>();

function sendError(sessionId: string, message: string): void {
    wsClientManager.send(sessionId, {
        type: 'error',
        payload: { sessionId, message },
    });
}

export async function routeWsFrame(raw: string): Promise<void> {
    let frame: WsInboundFrame;

    try {
        frame = JSON.parse(raw) as WsInboundFrame;
    } catch {
        logger.warn('WsMessageRouter', 'Received malformed JSON frame — ignoring');
        return;
    }

    const { type, payload } = frame;

    if (!type || !payload) {
        logger.warn('WsMessageRouter', 'Frame missing type or payload — ignoring');
        return;
    }

    if (type === 'interrupt') {
        const { sessionId, reason } = payload as WsInterruptPayload;

        if (!sessionId) {
            logger.warn('WsMessageRouter', 'Interrupt frame missing sessionId');
            return;
        }

        const active = activeSessions.get(sessionId);
        if (active) {
            active.interrupt(reason ?? 'barge-in');
        } else {
            interruptService.signal(sessionId, reason ?? 'barge-in');
        }

        wsClientManager.send(sessionId, {
            type: 'interrupted',
            payload: { sessionId, reason: reason ?? 'barge-in' },
        });

        logger.warn('WsMessageRouter', `Interrupt routed — session=${sessionId}`);
        return;
    }

    if (type === 'message') {
        const { sessionId, tenantId, text, audioInput } = payload as WsMessagePayload;

        // Require sessionId + tenantId + at least one of text / audioInput
        if (!sessionId || !tenantId || (!text && !audioInput)) {
            logger.warn('WsMessageRouter', 'Message frame missing required fields (sessionId, tenantId, text|audioInput)');
            if (sessionId) sendError(sessionId, 'Missing tenantId, sessionId, or text/audioInput');
            return;
        }

        if (activeSessions.has(sessionId)) {
            logger.warn('WsMessageRouter', `Turn already active — session=${sessionId}`);
            sendError(sessionId, 'A turn is already in progress for this session');
            return;
        }

        const process = new AgentProcess({
            tenantId,
            sessionId,
            message: text,
            audioInput,
        });

        activeSessions.set(sessionId, process);

        const onAudioChunk = (e: AudioChunkEvent) => {
            if (e.sessionId === sessionId) {
                agentEvents.emit('agent.audioChunk', e);
            }
        };
        process.messageChannel.on('agent.audioChunk', onAudioChunk);

        try {
            const result = await process.start();

            wsClientManager.send(sessionId, {
                type: 'complete',
                payload: {
                    sessionId,
                    response: result.response,
                    situation: result.situation,
                    toolUsed: result.toolUsed,
                    interrupted: result.interrupted,
                    durationMs: result.durationMs,
                    audioChunks: result.audioChunks,
                    ...(result.transcript !== undefined && { transcript: result.transcript }),
                },
            });

            logger.info(
                'WsMessageRouter',
                `Turn complete — session=${sessionId} | ${result.durationMs}ms | audioChunks=${result.audioChunks}`
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error('WsMessageRouter', `Turn error — session=${sessionId}`, err);
            sendError(sessionId, message);
        } finally {
            process.messageChannel.off('agent.audioChunk', onAudioChunk);
            activeSessions.delete(sessionId);
        }

        return;
    }

    logger.warn('WsMessageRouter', `Unknown frame type: "${type}" — ignoring`);
}
