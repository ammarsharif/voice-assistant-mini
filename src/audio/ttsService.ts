import OpenAI from 'openai';
import { openaiClient } from '../config/openai';
import { InterruptService } from '../services/interruptService';
import { logger } from '../utils/logger';

export interface TTSChunk {
    index: number;
    audio: Buffer;
    audioBase64: string;
    text: string;
    durationMs: number;
}

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export interface TTSOptions {
    voice?: TTSVoice;
    model?: string;
    speed?: number;
}

const DEFAULT_TTS_OPTIONS: Required<TTSOptions> = {
    voice: 'nova',
    model: 'tts-1',
    speed: 1.0,
};

function estimateDurationMs(text: string, speed: number): number {
    const words = text.trim().split(/\s+/).length;
    const wordsPerMinute = 150 * speed;
    return Math.ceil((words / wordsPerMinute) * 60 * 1000);
}

function splitIntoSentences(text: string): string[] {
    if (!text.trim()) return [];

    const sentences = text
        .split(/(?<=[.?!])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

    if (sentences.length <= 1) {
        const words = text.trim().split(' ');
        const groups: string[] = [];
        for (let i = 0; i < words.length; i += 8) {
            groups.push(words.slice(i, i + 8).join(' '));
        }
        return groups.filter(Boolean);
    }

    return sentences;
}

export async function* ttsStream(
    text: string,
    sessionId: string,
    interruptSvc: InterruptService,
    opts: TTSOptions = {}
): AsyncGenerator<TTSChunk, void, unknown> {
    const options = { ...DEFAULT_TTS_OPTIONS, ...opts };
    const segments = splitIntoSentences(text);

    if (segments.length === 0) {
        logger.warn('TTSService', `Nothing to synthesise — session=${sessionId}`);
        return;
    }

    logger.info('TTSService', `TTS start — session=${sessionId} | segments=${segments.length} | voice=${options.voice}`);

    for (let i = 0; i < segments.length; i++) {
        if (interruptSvc.isInterrupted(sessionId)) {
            logger.warn('TTSService', `TTS interrupted at segment ${i}/${segments.length} — session=${sessionId}`);
            return;
        }

        const segment = segments[i]!;

        try {
            const response = await openaiClient.audio.speech.create({
                model: options.model,
                voice: options.voice,
                input: segment,
                response_format: 'pcm',
                speed: options.speed,
            });

            if (interruptSvc.isInterrupted(sessionId)) {
                logger.warn('TTSService', `TTS interrupted post-synthesis segment=${i} — session=${sessionId}`);
                return;
            }

            const audioBuffer = Buffer.from(await response.arrayBuffer());
            const durationMs = estimateDurationMs(segment, options.speed);

            const chunk: TTSChunk = {
                index: i,
                audio: audioBuffer,
                audioBase64: audioBuffer.toString('base64'),
                text: segment,
                durationMs,
            };

            logger.debug(
                'TTSService',
                `Segment ${i}/${segments.length} synthesised — session=${sessionId} | ${audioBuffer.length} bytes | ${durationMs}ms`
            );

            yield chunk;
        } catch (err) {
            logger.error('TTSService', `Failed to synthesise segment ${i} — session=${sessionId} | ${String(err)}`);
            throw err;
        }
    }

    logger.info('TTSService', `TTS complete — session=${sessionId} | segments=${segments.length}`);
}
