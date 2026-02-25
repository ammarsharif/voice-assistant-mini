export { redisClient as redis } from '../config/redis';

import { redisClient } from '../config/redis';

const PROMPT_TTL_SECONDS = 60 * 60;

export async function cachePrompt(tenantId: string, prompt: string): Promise<void> {
    await redisClient.setex(`prompt:${tenantId}`, PROMPT_TTL_SECONDS, prompt);
}

export async function getCachedPrompt(tenantId: string): Promise<string | null> {
    return redisClient.get(`prompt:${tenantId}`);
}

export async function invalidatePrompt(tenantId: string): Promise<void> {
    await redisClient.del(`prompt:${tenantId}`);
}
