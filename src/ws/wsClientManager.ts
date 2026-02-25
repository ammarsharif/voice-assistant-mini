import type WebSocket from 'ws';
import { logger } from '../utils/logger';

interface ClientEntry {
    ws: WebSocket;
    tenantId: string;
    connectedAt: number;
}

class WsClientManager {
    private readonly sessions = new Map<string, Set<ClientEntry>>();

    register(sessionId: string, tenantId: string, ws: WebSocket): void {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, new Set());
        }
        const entry: ClientEntry = { ws, tenantId, connectedAt: Date.now() };
        this.sessions.get(sessionId)!.add(entry);
        logger.info('WsClientManager', `Client registered — session=${sessionId} | tenant=${tenantId}`);

        ws.on('close', () => {
            this.unregister(sessionId, ws);
        });
    }

    unregister(sessionId: string, ws: WebSocket): void {
        const set = this.sessions.get(sessionId);
        if (!set) return;
        for (const entry of set) {
            if (entry.ws === ws) {
                set.delete(entry);
                logger.info('WsClientManager', `Client unregistered — session=${sessionId}`);
                break;
            }
        }
        if (set.size === 0) {
            this.sessions.delete(sessionId);
        }
    }

    send(sessionId: string, payload: object): void {
        const set = this.sessions.get(sessionId);
        if (!set || set.size === 0) return;
        const data = JSON.stringify(payload);
        for (const entry of set) {
            if (entry.ws.readyState === entry.ws.OPEN) {
                entry.ws.send(data);
            }
        }
    }

    has(sessionId: string): boolean {
        const set = this.sessions.get(sessionId);
        return !!set && set.size > 0;
    }

    sessionCount(): number {
        return this.sessions.size;
    }

    clientsForSession(sessionId: string): number {
        return this.sessions.get(sessionId)?.size ?? 0;
    }
}

export const wsClientManager = new WsClientManager();
