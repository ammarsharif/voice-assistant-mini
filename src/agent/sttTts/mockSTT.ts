import { latencySimulator } from '../../services/latencySimulator';
import { logger } from '../../utils/logger';

export interface STTResult {
    transcript: string;
    confidence: number;
    tokens: string[];
    processingMs: number;
}

export async function mockSTT(audioInput: string, sessionId: string): Promise<STTResult> {
    const start = Date.now();
    await latencySimulator.sttDelay();
    const transcript = audioInput.replace(/\s+/g, ' ').trim();

    if (!transcript) {
        logger.warn('MockSTT', `Empty transcript — session=${sessionId}`);
        return {
            transcript: '',
            confidence: 0,
            tokens: [],
            processingMs: Date.now() - start,
        };
    }

    const tokens = transcript.split(' ').filter(Boolean);
    const confidence = Math.min(0.98, 0.75 + tokens.length * 0.01);
    const processingMs = Date.now() - start;

    logger.info(
        'MockSTT',
        `Transcribed — session=${sessionId} | tokens=${tokens.length} | conf=${confidence.toFixed(2)} | ${processingMs}ms`
    );

    return { transcript, confidence, tokens, processingMs };
}
