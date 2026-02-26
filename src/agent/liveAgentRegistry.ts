import { LiveAgentRunner } from './liveAgentRunner';
import { logger } from '../utils/logger';

class LiveAgentRegistry {
    private readonly runners = new Map<string, LiveAgentRunner>();

    async ensureRunner(tenantId: string, sessionId: string, roomName?: string): Promise<LiveAgentRunner> {
        if (this.runners.has(sessionId)) {
            return this.runners.get(sessionId)!;
        }

        const runner = new LiveAgentRunner({ tenantId, sessionId, roomName });

        this.runners.set(sessionId, runner);

        try {
            await runner.start();
        } catch (err) {
            this.runners.delete(sessionId);
            throw err;
        }

        logger.success('LiveAgentRegistry', `Runner started — session=${sessionId}`);
        return runner;
    }

    getRunner(sessionId: string): LiveAgentRunner | undefined {
        return this.runners.get(sessionId);
    }

    async stopRunner(sessionId: string): Promise<void> {
        const runner = this.runners.get(sessionId);
        if (!runner) return;

        await runner.stop();
        this.runners.delete(sessionId);
        logger.info('LiveAgentRegistry', `Runner stopped & removed — session=${sessionId}`);
    }

    async stopAll(): Promise<void> {
        const ids = [...this.runners.keys()];
        await Promise.all(ids.map((id) => this.stopRunner(id)));
        logger.info('LiveAgentRegistry', `All runners stopped (${ids.length})`);
    }

    get activeCount(): number {
        return this.runners.size;
    }
}

export const liveAgentRegistry = new LiveAgentRegistry();
