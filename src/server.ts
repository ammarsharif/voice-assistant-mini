import { env } from './config/env';
import './db/client';
import { redis } from './services/redis';
import { registerListeners } from './events/listeners';
import { createApp } from './app';

registerListeners();

const app = createApp();

const server = app.listen(env.PORT, () => {
    console.log(`\n🚀 Voice AI Mini Agent running on port ${env.PORT}`);
    console.log(`   Environment : ${env.NODE_ENV}`);
    console.log(`   Health check: http://localhost:${env.PORT}/health`);
    console.log(`   Chat API    : POST http://localhost:${env.PORT}/chat\n`);
});

async function shutdown(signal: string): Promise<void> {
    console.log(`\n⚡ Received ${signal}. Shutting down gracefully...`);

    server.close(async () => {
        console.log('🔒 HTTP server closed');

        await redis.quit();
        console.log('🔒 Redis disconnected');

        console.log('✅ Shutdown complete. Goodbye!\n');
        process.exit(0);
    });

    setTimeout(() => {
        console.error('⚠️  Forced shutdown after timeout');
        process.exit(1);
    }, 10_000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Promise Rejection:', reason);
});
