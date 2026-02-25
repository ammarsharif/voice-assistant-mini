/**
 * src/server.ts
 *
 * Application entry point — bootstraps everything and starts the HTTP server.
 *
 * BOOT ORDER:
 *   1. Parse & validate env vars (crashes fast if invalid)
 *   2. Initialise Supabase client (module-level side effect in db/client.ts)
 *   3. Connect to Redis (module-level side effect in services/redis.ts)
 *   4. Register async event listeners
 *   5. Create the Express app
 *   6. Start listening on PORT
 *   7. Register SIGINT / SIGTERM handlers for graceful shutdown
 *
 * GRACEFUL SHUTDOWN:
 *   When the process receives SIGINT (Ctrl+C) or SIGTERM (Docker/Kubernetes stop),
 *   we close the HTTP server first (stops new connections), then disconnect Redis.
 *   Supabase JS client is stateless HTTP — no explicit close needed.
 */

import { env } from './config/env';         // Step 1: Validate env (must be first)
import './db/client';                        // Step 2: Initialise Supabase client
import { redis } from './services/redis';    // Step 3: Connect Redis
import { registerListeners } from './events/listeners'; // Step 4
import { createApp } from './app';           // Step 5

// ── Start ─────────────────────────────────────────────────────

registerListeners();

const app = createApp();

const server = app.listen(env.PORT, () => {
    console.log(`\n🚀 Voice AI Mini Agent running on port ${env.PORT}`);
    console.log(`   Environment : ${env.NODE_ENV}`);
    console.log(`   Health check: http://localhost:${env.PORT}/health`);
    console.log(`   Chat API    : POST http://localhost:${env.PORT}/chat\n`);
});

// ── Graceful Shutdown ─────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
    console.log(`\n⚡ Received ${signal}. Shutting down gracefully...`);

    // 1. Stop accepting new HTTP connections
    server.close(async () => {
        console.log('🔒 HTTP server closed');

        // 2. Disconnect Redis (Supabase JS client is stateless — no close needed)
        await redis.quit();
        console.log('🔒 Redis disconnected');

        console.log('✅ Shutdown complete. Goodbye!\n');
        process.exit(0);
    });

    // Force-exit after 10 seconds if graceful shutdown hangs
    setTimeout(() => {
        console.error('⚠️  Forced shutdown after timeout');
        process.exit(1);
    }, 10_000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Catch unhandled promise rejections to prevent silent failures
process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Promise Rejection:', reason);
});
