import { logger } from '../utils/logger';

export interface AudioSessionConfig {
    roomName: string;
    tenantId: string;
    botToken: string;
}

export class AudioSession {
    private readonly config: AudioSessionConfig;
    private running = false;

    constructor(config: AudioSessionConfig) {
        this.config = config;
    }

    async start(): Promise<void> {
        this.running = true;
        logger.info(
            'AudioSession',
            `[STUB] Voice session started for room "${this.config.roomName}" ` +
            `(tenant: ${this.config.tenantId})`
        );
        logger.warn(
            'AudioSession',
            'Real audio pipeline not yet implemented — text-only mode active'
        );
    }

    async stop(): Promise<void> {
        if (!this.running) return;
        this.running = false;
        logger.info(
            'AudioSession',
            `[STUB] Voice session stopped for room "${this.config.roomName}"`
        );
    }

    get isRunning(): boolean {
        return this.running;
    }
}

export async function transcribeAudio(audioChunkBase64: string): Promise<string> {
    logger.warn('STT', '[STUB] transcribeAudio called — returning placeholder transcript');
    void audioChunkBase64;
    return '[Audio transcript placeholder — real STT not yet implemented]';
}

export async function synthesizeSpeech(text: string): Promise<Buffer> {
    logger.warn('TTS', '[STUB] synthesizeSpeech called — returning empty buffer');
    void text;
    return Buffer.alloc(0);
}
