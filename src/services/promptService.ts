import { redisClient } from '../config/redis';
import { getTenantById } from './tenantService';
import { logger } from '../utils/logger';

const PROMPT_TTL_SECONDS = 60 * 60;

const promptKey = (tenantId: string): string => `prompt:${tenantId}`;

export async function getCompiledPrompt(tenantId: string): Promise<string> {
    const cached = await redisClient.get(promptKey(tenantId));
    if (cached) {
        logger.info('PromptService', `Cache HIT  — tenant: ${tenantId}`);
        return cached;
    }

    logger.info('PromptService', `Cache MISS — compiling prompt for tenant: ${tenantId}`);
    const tenant = await getTenantById(tenantId);
    if (!tenant) {
        throw new Error(`Tenant "${tenantId}" not found`);
    }

    const compiled = [
        tenant.system_prompt,
        ``,
        `— Runtime context —`,
        `Tenant  : ${tenant.name}`,
        `Date    : ${new Date().toISOString().split('T')[0]}`,
        `Time UTC: ${new Date().toUTCString()}`,
    ].join('\n');

    await redisClient.setex(promptKey(tenantId), PROMPT_TTL_SECONDS, compiled);
    logger.success('PromptService', `Prompt compiled & cached (TTL ${PROMPT_TTL_SECONDS}s)`);

    return compiled;
}

export async function invalidateCachedPrompt(tenantId: string): Promise<void> {
    await redisClient.del(promptKey(tenantId));
    logger.info('PromptService', `Cache invalidated for tenant: ${tenantId}`);
}

export async function checkRateLimit(
    tenantId: string,
    maxRequestsPerMinute = 60
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
    const key = `rl:${tenantId}:${Math.floor(Date.now() / 60_000)}`;

    const count = await redisClient.incr(key);
    if (count === 1) {
        await redisClient.expire(key, 60);
    }

    if (count > maxRequestsPerMinute) {
        const ttl = await redisClient.ttl(key);
        logger.warn('PromptService', `Rate limit exceeded for tenant: ${tenantId} (${count} req/min)`);
        return { allowed: false, retryAfterMs: ttl * 1_000 };
    }

    return { allowed: true };
}
