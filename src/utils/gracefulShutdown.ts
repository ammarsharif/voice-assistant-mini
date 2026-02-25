import { Server } from 'http';
import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { logger } from './logger';

export interface ShutdownDeps {
    httpServer?: Server;
    redis: Redis;
    emitters?: EventEmitter[];
    cleanupFns?: Array<() => Promise<void>>;
}

export function registerShutdownHandlers(deps: ShutdownDeps, timeoutMs = 10_000): void {
    async function shutdown(signal: string): Promise<void> {
        logger.warn('GracefulShutdown', `Received ${signal} — shutting down…`);

        const timer = setTimeout(() => {
            logger.error('GracefulShutdown', 'Forced exit — shutdown took too long');
            process.exit(1);
        }, timeoutMs);
        timer.unref();

        try {
            if (deps.httpServer) {
                await new Promise<void>((resolve, reject) => {
                    deps.httpServer!.close((err) => (err ? reject(err) : resolve()));
                });
                logger.success('GracefulShutdown', 'HTTP server closed');
            }

            for (const fn of deps.cleanupFns ?? []) {
                await fn();
            }

            await deps.redis.quit();
            logger.success('GracefulShutdown', 'Redis disconnected');

            for (const emitter of deps.emitters ?? []) {
                emitter.removeAllListeners();
            }
            logger.success('GracefulShutdown', 'Event emitters cleared');

            clearTimeout(timer);
            logger.success('GracefulShutdown', 'Shutdown complete — goodbye 👋');
            process.exit(0);
        } catch (err) {
            logger.error('GracefulShutdown', 'Error during shutdown', err);
            process.exit(1);
        }
    }

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    process.on('unhandledRejection', (reason) => {
        logger.error('Process', 'Unhandled Promise Rejection', reason);
    });

    process.on('uncaughtException', (err) => {
        logger.error('Process', 'Uncaught Exception', err);
        process.exit(1);
    });
}
