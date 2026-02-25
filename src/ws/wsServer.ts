import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { wsClientManager } from './wsClientManager';
import { routeWsFrame } from './wsMessageRouter';
import { logger } from '../utils/logger';

export function attachWsServer(httpServer: Server): WebSocketServer {
    const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

    wss.on('connection', (ws: WebSocket, req) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
        const tenantId = url.searchParams.get('tenantId') ?? '';
        const sessionId = url.searchParams.get('sessionId') ?? '';

        if (!tenantId || !sessionId) {
            ws.close(1008, 'Missing tenantId or sessionId query params');
            logger.warn('WsServer', 'Connection rejected — missing tenantId or sessionId');
            return;
        }

        wsClientManager.register(sessionId, tenantId, ws);

        logger.info('WsServer', `Client connected — session=${sessionId} | tenant=${tenantId}`);

        ws.send(JSON.stringify({
            type: 'connected',
            payload: { sessionId, tenantId, timestamp: Date.now() },
        }));

        ws.on('message', async (data) => {
            const raw = data.toString();
            logger.debug('WsServer', `Frame received — session=${sessionId} | size=${raw.length}`);
            await routeWsFrame(raw);
        });

        ws.on('close', (code, reason) => {
            logger.info('WsServer', `Client disconnected — session=${sessionId} | code=${code} | reason=${reason.toString()}`);
        });

        ws.on('error', (err) => {
            logger.error('WsServer', `Socket error — session=${sessionId}`, err);
        });
    });

    wss.on('error', (err) => {
        logger.error('WsServer', 'WebSocket server error', err);
    });

    logger.success('WsServer', 'WebSocket server attached at /ws');

    return wss;
}
