import { logger } from '../utils/logger';

export class LatencySimulator {
    private enabled: boolean;

    constructor(enabled = process.env.NODE_ENV !== 'production') {
        this.enabled = enabled;
    }

    async sttDelay(minMs = 30, maxMs = 120): Promise<void> {
        if (!this.enabled) return;
        const delay = this.jitter(minMs, maxMs);
        logger.debug('LatencySimulator', `STT delay: ${delay}ms`);
        await this.sleep(delay);
    }

    async ttsDelay(charCount = 20): Promise<void> {
        if (!this.enabled) return;
        const base = Math.min(60, Math.max(10, Math.ceil(charCount * 0.8)));
        const delay = this.jitter(Math.max(10, base - 10), base + 10);
        logger.debug('LatencySimulator', `TTS delay: ${delay}ms (chars=${charCount})`);
        await this.sleep(delay);
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
