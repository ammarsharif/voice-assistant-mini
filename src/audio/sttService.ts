import { EventEmitter } from 'events';
import { createClient, DeepgramClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface TranscriptChunk {
    sessionId: string;
    text: string;
    isFinal: boolean;
    confidence: number;
    durationMs: number;
}

export interface STTServiceEvents {
    'transcript': (chunk: TranscriptChunk) => void;
    'error': (err: Error) => void;
    'closed': () => void;
}

export declare interface STTService {
    on<E extends keyof STTServiceEvents>(event: E, listener: STTServiceEvents[E]): this;
    emit<E extends keyof STTServiceEvents>(event: E, ...args: Parameters<STTServiceEvents[E]>): boolean;
}

export class STTService extends EventEmitter {
    private readonly sessionId: string;
    private dgClient: DeepgramClient;
    private connection: ReturnType<DeepgramClient['listen']['live']> | null = null;
    private started = false;
    private connecting = false;
    private preConnectQueue: Buffer[] = [];
    private _transcriptBuffer = '';

    constructor(sessionId: string) {
        super();
        this.sessionId = sessionId;
        this.dgClient = createClient(env.DEEPGRAM_API_KEY ?? 'MISSING_KEY');
    }

    get isStarted(): boolean {
        return this.started;
    }

    get transcriptBuffer(): string {
        return this._transcriptBuffer;
    }

    start(): void {
        if (this.started || this.connecting) return;

        if (!env.DEEPGRAM_API_KEY) {
            logger.warn('STTService', `DEEPGRAM_API_KEY not set — STTService in stub mode | session=${this.sessionId}`);
            this.started = true;
            return;
        }

        logger.info('STTService', `Connecting to Deepgram — session=${this.sessionId}`);
        this.connecting = true;

        this.connection = this.dgClient.listen.live({
            model: 'nova-2',
            language: 'en-US',
            smart_format: true,
            interim_results: true,
            utterance_end_ms: 1000,
            vad_events: true,
            encoding: 'linear16',
            sample_rate: 16000,
            channels: 1,
        });

        this.connection.on(LiveTranscriptionEvents.Open, () => {
            logger.success('STTService', `Deepgram connection open — session=${this.sessionId}`);
            this.started = true;
            this.connecting = false;

            if (this.preConnectQueue.length > 0) {
                logger.info('STTService', `Flushing ${this.preConnectQueue.length} queued audio chunk(s) — session=${this.sessionId}`);
                for (const queued of this.preConnectQueue) {
                    this._sendBuffer(queued);
                }
                this.preConnectQueue = [];
            }
        });

        this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
            const alt = data.channel?.alternatives?.[0];
            if (!alt?.transcript) return;

            const isFinal = data.is_final ?? false;
            const confidence = alt.confidence ?? 0;
            const text = alt.transcript;

            if (isFinal) {
                this._transcriptBuffer += (this._transcriptBuffer ? ' ' : '') + text;
            }

            const chunk: TranscriptChunk = {
                sessionId: this.sessionId,
                text,
                isFinal,
                confidence,
                durationMs: Math.round((data.duration ?? 0) * 1000),
            };

            logger.debug('STTService', `Transcript — session=${this.sessionId} | final=${isFinal} | "${text.slice(0, 60)}"`);
            this.emit('transcript', chunk);
        });

        this.connection.on(LiveTranscriptionEvents.Error, (err: unknown) => {
            const error = err instanceof Error ? err : new Error(String(err));
            logger.error('STTService', `Deepgram error — session=${this.sessionId} | ${error.message}`);
            this.emit('error', error);
        });

        this.connection.on(LiveTranscriptionEvents.Close, () => {
            logger.info('STTService', `Deepgram connection closed — session=${this.sessionId}`);
            this.started = false;
            this.connecting = false;
            this.connection = null;
            this.emit('closed');
        });
    }

    sendAudio(chunk: Buffer): void {
        if (!env.DEEPGRAM_API_KEY) return;

        if (this.connecting) {
            // Connection handshake in progress — queue for flush on Open
            this.preConnectQueue.push(chunk);
            return;
        }

        if (!this.started || !this.connection) {
            // Connection not yet started or dropped — auto-(re)connect and queue
            this.preConnectQueue.push(chunk);
            this.start();
            return;
        }

        this._sendBuffer(chunk);
    }

    private _sendBuffer(chunk: Buffer): void {
        if (!this.connection) return;
        this.connection.send(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer);
    }

    flushAndGetTranscript(): string {
        const result = this._transcriptBuffer.trim();
        this._transcriptBuffer = '';
        return result;
    }

    stop(): void {
        if (this.connection) {
            this.connection.requestClose();
            this.connection = null;
            logger.info('STTService', `STTService stopped — session=${this.sessionId}`);
        }
        this.started = false;
        this.connecting = false;
        this.preConnectQueue = [];
    }
}
