import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

const LOCK_TTL_SECONDS = 10;

function lockKey(sessionId: string): string {
    return `lock:${sessionId}`;
}

export async function acquireLock(sessionId: string): Promise<boolean> {
    const key = lockKey(sessionId);
    const result = await redisClient.set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
    const acquired = result === 'OK';

    if (acquired) {
        logger.debug('SessionLock', `Lock acquired — session=${sessionId}`);
    } else {
        logger.warn('SessionLock', `Lock FAILED  — session=${sessionId} is already locked`);
    }

    return acquired;
}

export async function releaseLock(sessionId: string): Promise<void> {
    const key = lockKey(sessionId);
    await redisClient.del(key);
    logger.debug('SessionLock', `Lock released — session=${sessionId}`);
}

export async function withSessionLock<T>(
    sessionId: string,
    fn: () => Promise<T>
): Promise<T> {
    const acquired = await acquireLock(sessionId);
    if (!acquired) {
        throw Object.assign(
            new Error(`Session "${sessionId}" is currently being processed. Please retry shortly.`),
            { statusCode: 429 }
        );
    }
    try {
        return await fn();
    } finally {
        await releaseLock(sessionId);
    }
}
