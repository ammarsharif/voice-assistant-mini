import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

export const db: SupabaseClient = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);

console.log('✅  [DB] Supabase client initialised');
