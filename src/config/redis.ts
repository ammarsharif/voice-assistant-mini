import Redis from 'ioredis';
import { env } from './env';

export const redisClient = new Redis(env.REDIS_URL, {
    retryStrategy: (times) => Math.min(times * 100, 3_000),
    maxRetriesPerRequest: 3,
    lazyConnect: false,
});

redisClient.on('connect', () =>
    console.log('✅  [Redis] Connected to', env.REDIS_URL.replace(/:\/\/.*@/, '://***@'))
);
redisClient.on('ready', () => console.log('✅  [Redis] Ready to accept commands'));
redisClient.on('error', (err: Error) => console.error('❌  [Redis] Error:', err.message));
redisClient.on('close', () => console.log('🔒  [Redis] Connection closed'));
