import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
    SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(10, 'SUPABASE_SERVICE_ROLE_KEY is required'),
    REDIS_URL: z.string().url('REDIS_URL must be a valid Redis URL'),
    OPENAI_API_KEY: z.string().min(10, 'OPENAI_API_KEY is required'),
    PORT: z.string().default('3000').transform(Number),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    LIVEKIT_API_KEY: z.string().default('devkey'),
    LIVEKIT_API_SECRET: z.string().default('devsecret'),
    LIVEKIT_HOST: z.string().default('ws://localhost:7880'),
    LIVEKIT_REALM: z.string().default('voiceai'),
    LIVEKIT_DEFAULT_ROOM: z.string().default('general'),

    DEEPGRAM_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌  Invalid environment variables:\n', parsed.error.format());
    process.exit(1);
}

export const env = parsed.data;
