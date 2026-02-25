import { AgentProcess } from '../agent/agentProcess';
import { interruptService } from '../services/interruptService';
import { logger } from '../utils/logger';
import { wsClientManager } from './wsClientManager';

interface WsMessagePayload {
    sessionId: string;
    tenantId: string;
    text: string;
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
        const { sessionId, tenantId, text } = payload as WsMessagePayload;

        if (!sessionId || !tenantId || !text) {
            logger.warn('WsMessageRouter', 'Message frame missing required fields');
            if (sessionId) sendError(sessionId, 'Missing tenantId, sessionId, or text');
            return;
        }

        if (activeSessions.has(sessionId)) {
            logger.warn('WsMessageRouter', `Turn already active — session=${sessionId}`);
            sendError(sessionId, 'A turn is already in progress for this session');
            return;
        }

        const process = new AgentProcess({ tenantId, sessionId, message: text });
        activeSessions.set(sessionId, process);

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
                },
            });

            logger.info('WsMessageRouter', `Turn complete — session=${sessionId} | ${result.durationMs}ms`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error('WsMessageRouter', `Turn error — session=${sessionId}`, err);
            sendError(sessionId, message);
        } finally {
            activeSessions.delete(sessionId);
        }

        return;
    }

    logger.warn('WsMessageRouter', `Unknown frame type: "${type}" — ignoring`);
}
