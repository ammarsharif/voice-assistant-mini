import { logger } from '../utils/logger';

export class LatencySimulator {
    private enabled: boolean;

    constructor(enabled = process.env.NODE_ENV !== 'production') {
        this.enabled = enabled;
    }

    async tokenDelay(minMs = 10, maxMs = 25): Promise<void> {
        if (!this.enabled) return;
        const delay = this.jitter(minMs, maxMs);
        await this.sleep(delay);
    }

    async toolDelay(minMs = 80, maxMs = 200): Promise<void> {
        if (!this.enabled) return;
        const delay = this.jitter(minMs, maxMs);
        logger.debug('LatencySimulator', `Tool delay: ${delay}ms`);
        await this.sleep(delay);
    }

    async networkJitter(chancePercent = 5, maxJitterMs = 150): Promise<void> {
        if (!this.enabled) return;
        if (Math.random() * 100 < chancePercent) {
            const jitter = this.jitter(50, maxJitterMs);
            logger.debug('LatencySimulator', `Network jitter fired: +${jitter}ms`);
            await this.sleep(jitter);
        }
    }

    private jitter(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export const latencySimulator = new LatencySimulator();
