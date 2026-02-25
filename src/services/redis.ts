import Redis from 'ioredis';
import { env } from '../config/env';

export const redis = new Redis(env.REDIS_URL, {
    retryStrategy: (times) => Math.min(times * 100, 3000),
    maxRetriesPerRequest: 3,
    lazyConnect: false,
});

redis.on('connect', () => console.log('✅  Redis connected'));
redis.on('error', (err) => console.error('❌  Redis error:', err.message));

const PROMPT_TTL_SECONDS = 60 * 60;

export async function cachePrompt(tenantId: string, prompt: string): Promise<void> {
    await redis.setex(`prompt:${tenantId}`, PROMPT_TTL_SECONDS, prompt);
}

export async function getCachedPrompt(tenantId: string): Promise<string | null> {
    return redis.get(`prompt:${tenantId}`);
}

export async function invalidatePrompt(tenantId: string): Promise<void> {
    await redis.del(`prompt:${tenantId}`);
}
