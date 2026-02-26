import { EventEmitter } from 'events';
import {
    Room,
    RoomEvent,
    AudioSource,
    AudioStream,
    LocalAudioTrack,
    AudioFrame,
    RemoteParticipant,
    RemoteTrackPublication,
    RemoteAudioTrack,
    Track,
    TrackKind,
    TrackPublishOptions,
    TrackSource
} from '@livekit/rtc-node';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// Sample rate expected by Deepgram STT
const STT_SAMPLE_RATE = 16000;
// Sample rate used by OpenAI TTS PCM output
const TTS_SAMPLE_RATE = 24000;

export interface AudioFrameEvent {
    sessionId: string;
    participantIdentity: string;
    frame: Buffer;
    sampleRate: number;
    channels: number;
}

export interface LiveKitClientEvents {
    'audio:frame': (event: AudioFrameEvent) => void;
    'participant:joined': (identity: string) => void;
    'participant:left': (identity: string) => void;
    'room:connected': () => void;
    'room:disconnected': () => void;
    'error': (err: Error) => void;
}

export declare interface LiveKitClient {
    on<E extends keyof LiveKitClientEvents>(event: E, listener: LiveKitClientEvents[E]): this;
    emit<E extends keyof LiveKitClientEvents>(event: E, ...args: Parameters<LiveKitClientEvents[E]>): boolean;
}

export interface LiveKitClientConfig {
    roomName: string;
    participantIdentity: string;
    sessionId: string;
    token: string;
}

export class LiveKitClient extends EventEmitter {
    private readonly config: LiveKitClientConfig;
    private room: Room | null = null;
    private audioSource: AudioSource | null = null;
    private localTrack: LocalAudioTrack | null = null;
    private _connected = false;

    constructor(config: LiveKitClientConfig) {
        super();
        this.config = config;
    }

    get isConnected(): boolean {
        return this._connected;
    }

    get roomName(): string {
        return this.config.roomName;
    }

    async connect(): Promise<void> {
        if (this._connected) return;

        logger.info(
            'LiveKitClient',
            `Connecting to Real WebRTC room="${this.config.roomName}" | session=${this.config.sessionId}`
        );

        this.room = new Room();

        this.room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
            this.emit('participant:joined', participant.identity);
        });

        this.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
            this.emit('participant:left', participant.identity);
        });

        this.room.on(RoomEvent.TrackSubscribed, (track: Track, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
            if (track.kind === TrackKind.KIND_AUDIO) {
                logger.info('LiveKitClient', `Subscribed to audio from ${participant.identity}`);
                this._readAudioTrack(track as RemoteAudioTrack, participant.identity);
            }
        });

        this.room.on(RoomEvent.Disconnected, () => {
            this._connected = false;
            this.emit('room:disconnected');
        });

        try {
            await this.room.connect(env.LIVEKIT_HOST, this.config.token);
            this._connected = true;
            this.emit('room:connected');

            // Publish the agent's TTS audio track
            this.audioSource = new AudioSource(TTS_SAMPLE_RATE, 1);
            this.localTrack = LocalAudioTrack.createAudioTrack('agent-tts', this.audioSource);

            const opts = new TrackPublishOptions();
            opts.source = TrackSource.SOURCE_MICROPHONE;
            await this.room.localParticipant?.publishTrack(this.localTrack, opts);

            // Subscribe to any remote participants that are already in the room
            for (const [, participant] of this.room.remoteParticipants) {
                for (const [, publication] of participant.trackPublications) {
                    if (publication.track && publication.track.kind === TrackKind.KIND_AUDIO) {
                        logger.info('LiveKitClient', `Catching up existing audio track from ${participant.identity}`);
                        this._readAudioTrack(publication.track as RemoteAudioTrack, participant.identity);
                    }
                }
            }

            logger.success('LiveKitClient', `Agent WebRTC connected | session=${this.config.sessionId} | room=${this.config.roomName}`);
        } catch (err) {
            logger.error('LiveKitClient', `WebRTC connect failed: ${String(err)}`);
            throw err;
        }
    }

    /**
     * Reads PCM frames from a remote audio track via AudioStream and
     * emits them as `audio:frame` events for the STT pipeline.
     * AudioStream automatically resamples to STT_SAMPLE_RATE (16000 Hz).
     */
    private _readAudioTrack(track: RemoteAudioTrack, participantIdentity: string): void {
        const sessionId = this.config.sessionId;
        const stream = new AudioStream(track, STT_SAMPLE_RATE, 1);
        const reader = stream.getReader();

        (async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done || !this._connected) break;

                    const frame = value as AudioFrame;
                    const pcm = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
                    this.emit('audio:frame', {
                        sessionId,
                        participantIdentity,
                        frame: pcm,
                        sampleRate: frame.sampleRate,
                        channels: frame.channels,
                    });
                }
            } catch (err) {
                if (this._connected) {
                    logger.error('LiveKitClient', `Audio stream read error from ${participantIdentity}: ${String(err)}`);
                }
            } finally {
                reader.releaseLock();
            }
        })();
    }

    // Keep the HTTP fallback method for testing /live/audio
    feedAudioIn(pcmBuffer: Buffer, participantIdentity: string, sampleRate = STT_SAMPLE_RATE, channels = 1): void {
        if (!this._connected) {
            logger.warn('LiveKitClient', `feedAudioIn called while not connected | session=${this.config.sessionId}`);
            return;
        }
        this.emit('audio:frame', {
            sessionId: this.config.sessionId,
            participantIdentity,
            frame: pcmBuffer,
            sampleRate,
            channels,
        });
    }

    async publishAudioBuffer(pcmBuffer: Buffer, sampleRate = TTS_SAMPLE_RATE, channels = 1): Promise<void> {
        if (!this._connected || !this.audioSource) {
            logger.warn('LiveKitClient', `Cannot publish, not connected | session=${this.config.sessionId}`);
            return;
        }

        try {
            const samplesPerChannel = pcmBuffer.length / 2 / channels;
            const int16 = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);
            const frame = new AudioFrame(int16, sampleRate, channels, samplesPerChannel);

            await this.audioSource.captureFrame(frame);
            logger.debug('LiveKitClient', `Published ${pcmBuffer.length} bytes to WebRTC room`);
        } catch (err) {
            logger.error('LiveKitClient', `Failed to publish buffer: ${String(err)}`);
        }
    }

    async disconnect(): Promise<void> {
        if (!this._connected || !this.room) return;

        this.room.disconnect();
        this._connected = false;
        this.room = null;
        this.audioSource = null;
        this.localTrack = null;
        this.emit('room:disconnected');
        logger.info('LiveKitClient', `Disconnected — room=${this.config.roomName} | session=${this.config.sessionId}`);
    }
}
