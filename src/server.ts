import { env } from './config/env';
import './config/db';
import { redisClient } from './config/redis';
import { registerListeners } from './events/listeners';
import { registerColdPathListeners } from './events/coldPathListeners';
import { createApp } from './app';
import { attachWsServer } from './ws/wsServer';
import { registerShutdownHandlers } from './utils/gracefulShutdown';
import { drainWorker } from './worker/worker';
import { agentEvents } from './events/eventBus';
import { liveAgentRegistry } from './agent/liveAgentRegistry';
import { logger } from './utils/logger';

registerListeners();
registerColdPathListeners();

const app = createApp();

const server = app.listen(env.PORT, () => {
    logger.success('Server', `Voice AI Mini Agent running on port ${env.PORT}`);
    logger.info('Server', `Environment : ${env.NODE_ENV}`);
});

const wss = attachWsServer(server);

registerShutdownHandlers({
    httpServer: server,
    redis: redisClient,
    emitters: [agentEvents],
    cleanupFns: [
        async () => { await drainWorker(); },
        async () => { await liveAgentRegistry.stopAll(); },
        async () => {
            await new Promise<void>((resolve) => wss.close(() => resolve()));
            logger.success('Server', 'WebSocket server closed');
        },
    ],
});
