import { EventEmitter } from 'events';
import { STTService, TranscriptChunk } from '../audio/sttService';
import { ttsStream, TTSOptions } from '../audio/ttsService';
import { agentEvents } from '../events/eventBus';
import { InterruptService } from '../services/interruptService';
import { MessageChannel } from '../services/messageChannel';
import { logger } from '../utils/logger';

export interface AudioPipelineConfig {
    sessionId: string;
    tenantId: string;
    interruptSvc: InterruptService;
    channel: MessageChannel;
    ttsOptions?: TTSOptions;
    publishAudio?: (pcmBuffer: Buffer) => Promise<void>;
}

export interface AudioPipelineEvents {
    'stt:transcript': (chunk: TranscriptChunk) => void;
    'stt:final': (text: string) => void;
    'tts:chunk:start': (index: number, text: string) => void;
    'tts:chunk:done': (index: number, audioBase64: string, durationMs: number) => void;
    'tts:complete': () => void;
    'tts:interrupted': (atIndex: number) => void;
    'error': (err: Error) => void;
}

export declare interface AudioPipelineService {
    on<E extends keyof AudioPipelineEvents>(event: E, listener: AudioPipelineEvents[E]): this;
    emit<E extends keyof AudioPipelineEvents>(event: E, ...args: Parameters<AudioPipelineEvents[E]>): boolean;
}

export class AudioPipelineService extends EventEmitter {
    private readonly sessionId: string;
    private readonly tenantId: string;
    private readonly interruptSvc: InterruptService;
    private readonly channel: MessageChannel;
    private readonly ttsOptions: TTSOptions;
    private readonly publishAudio: ((pcmBuffer: Buffer) => Promise<void>) | null;
    private sttService: STTService;
    private isSpeaking = false;

    constructor(config: AudioPipelineConfig) {
        super();
        this.sessionId = config.sessionId;
        this.tenantId = config.tenantId;
        this.interruptSvc = config.interruptSvc;
        this.channel = config.channel;
        this.ttsOptions = config.ttsOptions ?? {};
        this.publishAudio = config.publishAudio ?? null;
        this.sttService = new STTService(config.sessionId);
    }

    startSTT(): void {
        this.sttService.start();

        this.sttService.on('transcript', (chunk: TranscriptChunk) => {
            this.emit('stt:transcript', chunk);

            agentEvents.emit('agent.stt.chunk', {
                sessionId: this.sessionId,
                tenantId: this.tenantId,
                text: chunk.text,
                isFinal: chunk.isFinal,
                confidence: chunk.confidence,
            });

            if (chunk.isFinal && this.isSpeaking) {
                logger.warn('AudioPipeline', `Barge-in detected during TTS — session=${this.sessionId} | text="${chunk.text.slice(0, 40)}"`);
                this.interruptSvc.signal(this.sessionId, 'barge-in');
            }

            if (chunk.isFinal) {
                const fullText = this.sttService.flushAndGetTranscript();
                if (fullText) {
                    this.emit('stt:final', fullText);

                    agentEvents.emit('agent.stt.done', {
                        sessionId: this.sessionId,
                        tenantId: this.tenantId,
                        transcript: fullText,
                        confidence: chunk.confidence,
                        processingMs: chunk.durationMs,
                    });

                    logger.info('AudioPipeline', `STT final — session=${this.sessionId} | "${fullText.slice(0, 80)}"`);
                }
            }
        });

        this.sttService.on('error', (err: Error) => {
            logger.error('AudioPipeline', `STT error — session=${this.sessionId} | ${err.message}`);
            this.emit('error', err);
        });

        this.sttService.on('closed', () => {
            logger.info('AudioPipeline', `STT connection closed — session=${this.sessionId}`);
        });

        logger.info('AudioPipeline', `STT started — session=${this.sessionId}`);
    }

    feedAudio(chunk: Buffer): void {
        this.sttService.sendAudio(chunk);
    }

    async runTTS(text: string): Promise<void> {
        if (!text.trim()) return;

        this.isSpeaking = true;
        let chunkIndex = 0;

        logger.info('AudioPipeline', `TTS start — session=${this.sessionId} | text="${text.slice(0, 80)}"`);

        try {
            for await (const chunk of ttsStream(text, this.sessionId, this.interruptSvc, this.ttsOptions)) {
                if (this.interruptSvc.isInterrupted(this.sessionId)) {
                    logger.warn('AudioPipeline', `TTS cancelled at chunk=${chunk.index} — session=${this.sessionId}`);
                    this.emit('tts:interrupted', chunk.index);
                    this.channel.emitInterrupt('barge-in during TTS');
                    break;
                }

                this.emit('tts:chunk:start', chunk.index, chunk.text);

                // Publish raw PCM to LiveKit so the caller (user) hears the AI voice
                if (this.publishAudio && chunk.audio.length > 0) {
                    try {
                        await this.publishAudio(chunk.audio);
                    } catch (pubErr) {
                        logger.warn('AudioPipeline', `Failed to publish TTS audio to LiveKit — session=${this.sessionId} | ${String(pubErr)}`);
                    }
                }

                this.channel.emitAudioChunk(chunk.index, chunk.audioBase64, chunk.text, chunk.durationMs);

                agentEvents.emit('agent.audioChunk', {
                    sessionId: this.sessionId,
                    index: chunk.index,
                    audio: chunk.audioBase64,
                    text: chunk.text,
                    durationMs: chunk.durationMs,
                });

                this.emit('tts:chunk:done', chunk.index, chunk.audioBase64, chunk.durationMs);
                chunkIndex++;
            }

            if (!this.interruptSvc.isInterrupted(this.sessionId)) {
                this.emit('tts:complete');
                logger.info('AudioPipeline', `TTS complete — session=${this.sessionId} | ${chunkIndex} chunks`);
            }
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            logger.error('AudioPipeline', `TTS error — session=${this.sessionId} | ${error.message}`);
            this.emit('error', error);
        } finally {
            this.isSpeaking = false;
        }
    }

    stopSTT(): void {
        this.sttService.stop();
    }

    destroy(): void {
        this.sttService.stop();
        this.removeAllListeners();
        logger.info('AudioPipeline', `Destroyed — session=${this.sessionId}`);
    }
}
