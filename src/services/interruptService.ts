import { logger } from '../utils/logger';
import { agentEvents } from '../events/eventBus';

export class InterruptService {
    private interrupts = new Map<string, boolean>();

    signal(sessionId: string, reason = 'barge-in'): void {
        this.interrupts.set(sessionId, true);
        logger.warn('InterruptService', `Interrupt signalled — session=${sessionId} | reason=${reason}`);
        agentEvents.emit('agent:interrupted', { sessionId, reason });
    }

    isInterrupted(sessionId: string): boolean {
        return this.interrupts.get(sessionId) === true;
    }

    clear(sessionId: string): void {
        if (this.interrupts.has(sessionId)) {
            this.interrupts.delete(sessionId);
            logger.debug('InterruptService', `Interrupt cleared — session=${sessionId}`);
        }
    }
}

export const interruptService = new InterruptService();
