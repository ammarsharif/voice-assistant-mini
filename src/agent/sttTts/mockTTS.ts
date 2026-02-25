import { latencySimulator } from '../../services/latencySimulator';
import { logger } from '../../utils/logger';
import { InterruptService } from '../../services/interruptService';

export interface AudioChunk {
    index: number;
    audio: string;
    text: string;
    durationMs: number;
}

export interface TTSResult {
    chunks: AudioChunk[];
    interrupted: boolean;
    totalMs: number;
}

function splitIntoSegments(text: string): string[] {
    if (!text.trim()) return [];

    const raw = text
        .split(/(?<=[.?!,;])\s+/)
        .map(s => s.trim())
        .filter(Boolean);

    if (raw.length <= 1) {
        const words = text.trim().split(' ');
        const groups: string[] = [];
        for (let i = 0; i < words.length; i += 6) {
            groups.push(words.slice(i, i + 6).join(' '));
        }
        return groups;
    }

    return raw;
}

function encodeAsAudio(segment: string, index: number): string {
    const encoded = Buffer.from(`[AUDIO:${index}] ${segment}`).toString('base64');
    return encoded;
}

export async function* mockTTSStream(
    text: string,
    sessionId: string,
    interruptSvc: InterruptService
): AsyncGenerator<AudioChunk, void, unknown> {
    const segments = splitIntoSegments(text);

    if (segments.length === 0) {
        logger.warn('MockTTS', `Nothing to synthesise — session=${sessionId}`);
        return;
    }

    logger.info('MockTTS', `TTS start — session=${sessionId} | segments=${segments.length}`);

    for (let i = 0; i < segments.length; i++) {
        if (interruptSvc.isInterrupted(sessionId)) {
            logger.warn('MockTTS', `TTS interrupted at segment ${i}/${segments.length} — session=${sessionId}`);
            return;
        }

        const segment = segments[i]!;
        await latencySimulator.ttsDelay(segment.length);

        if (interruptSvc.isInterrupted(sessionId)) {
            logger.warn('MockTTS', `TTS interrupted post-synthesis at segment ${i} — session=${sessionId}`);
            return;
        }

        const chunk: AudioChunk = {
            index: i,
            audio: encodeAsAudio(segment, i),
            text: segment,
            durationMs: Math.ceil((segment.split(' ').length / 12) * 1000),
        };

        yield chunk;
    }

    logger.info('MockTTS', `TTS complete — session=${sessionId} | segments=${segments.length}`);
}

export async function mockTTS(
    text: string,
    sessionId: string,
    interruptSvc: InterruptService
): Promise<TTSResult> {
    const start = Date.now();
    const chunks: AudioChunk[] = [];
    let interrupted = false;

    for await (const chunk of mockTTSStream(text, sessionId, interruptSvc)) {
        chunks.push(chunk);

        if (interruptSvc.isInterrupted(sessionId)) {
            interrupted = true;
            break;
        }
    }

    return {
        chunks,
        interrupted,
        totalMs: Date.now() - start,
    };
}
