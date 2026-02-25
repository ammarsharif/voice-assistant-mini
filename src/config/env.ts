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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌  Invalid environment variables:\n', parsed.error.format());
    process.exit(1);
}

export const env = parsed.data;
