import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import type { SituationName } from '../agent/situations';

const SESSION_TTL_SECONDS = 60 * 60 * 2;
const HISTORY_WINDOW_SIZE = 10;

export interface SessionHistoryEntry {
    role: 'user' | 'assistant';
    content: string;
}

export interface SessionState {
    situation: SituationName;
    history: SessionHistoryEntry[];
    context: {
        callerType: string | null;
    };
    createdAt: string;
    updatedAt: string;
}

function sessionKey(tenantId: string, sessionId: string): string {
    return `session:${tenantId}:${sessionId}`;
}

export async function getOrCreateSession(
    tenantId: string,
    sessionId: string
): Promise<SessionState> {
    const key = sessionKey(tenantId, sessionId);
    const raw = await redisClient.get(key);

    if (raw) {
        logger.debug('SessionService', `Session HIT  — key=${key}`);
        return JSON.parse(raw) as SessionState;
    }

    logger.info('SessionService', `Session MISS — creating new session key=${key}`);
    const fresh: SessionState = {
        situation: 'introduction',
        history: [],
        context: { callerType: null },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    await redisClient.setex(key, SESSION_TTL_SECONDS, JSON.stringify(fresh));
    return fresh;
}

export async function saveSession(
    tenantId: string,
    sessionId: string,
    state: SessionState
): Promise<void> {
    const key = sessionKey(tenantId, sessionId);
    state.updatedAt = new Date().toISOString();

    state.history = state.history.slice(-HISTORY_WINDOW_SIZE);

    await redisClient.setex(key, SESSION_TTL_SECONDS, JSON.stringify(state));
    logger.debug('SessionService', `Session saved — key=${key} | situation=${state.situation} | history=${state.history.length} msgs`);
}

export async function deleteSession(
    tenantId: string,
    sessionId: string
): Promise<void> {
    const key = sessionKey(tenantId, sessionId);
    await redisClient.del(key);
    logger.info('SessionService', `Session deleted — key=${key}`);
}
