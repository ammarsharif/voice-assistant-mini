import express from 'express';
import { chatRouter } from './routes/chat';
import { healthRouter } from './routes/health';
import { liveRouter } from './routes/live';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

export function createApp(): express.Application {
    const app = express();

    app.use(express.json({ limit: '50mb' }));
    app.use(express.static('public'));

    app.use((req, _res, next) => {
        logger.info('HTTP', `${req.method} ${req.path}`);
        next();
    });

    app.use('/health', healthRouter);
    app.use('/chat', chatRouter);
    app.use('/live', liveRouter);

    app.get('/', (_req, res) => {
        const path = require('path');
        res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    app.use((_req, res) => {
        res.status(404).json({ error: 'Route not found' });
    });

    app.use(errorHandler);

    return app;
}
