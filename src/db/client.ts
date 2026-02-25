/**
 * src/db/client.ts
 *
 * Supabase client (service-role) — used server-side for all DB operations.
 *
 * WHY SERVICE ROLE KEY:
 * The standard "anon" key respects Row Level Security (RLS) and is meant
 * for browser/client use. On the server we use the service-role key which
 * bypasses RLS, giving the backend full table access. This is safe because
 * the key never leaves the server.
 *
 * WHY A SINGLETON:
 * createClient() initialises HTTP/WebSocket connections. Calling it on every
 * request would be wasteful. We export one shared instance for the whole app.
 *
 * MULTI-TENANCY NOTE:
 * We enforce tenant isolation at the query level in every service/tool
 * (WHERE tenant_id = $tenantId) rather than relying on RLS here, which
 * keeps the demo simple while demonstrating the pattern.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

// Typed Supabase client — we use `any` for the generic here because we're
// not generating types from the schema (add supabase gen-types for full safety)
export const supabase: SupabaseClient = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            // Disable auto-refresh — not needed for server-side service role usage
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);

console.log('✅  Supabase client initialised');
