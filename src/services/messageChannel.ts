import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { wsClientManager } from '../ws/wsClientManager';

export interface ChunkEvent {
    sessionId: string;
    chunk: string;
    index: number;
}

export interface CompleteEvent {
    sessionId: string;
    fullText: string;
    durationMs: number;
}

export interface ToolStartEvent {
    sessionId: string;
    toolName: string;
}

export interface ToolDoneEvent {
    sessionId: string;
    toolName: string;
    result: Record<string, unknown>;
}

export interface InterruptEvent {
    sessionId: string;
    reason: string;
}

export interface AudioChunkEvent {
    sessionId: string;
    index: number;
    audio: string;
    text: string;
    durationMs: number;
}

export interface ErrorEvent {
    sessionId: string;
    error: string;
}

export class MessageChannel extends EventEmitter {
    private readonly sessionId: string;
    private chunkIndex = 0;
    private buffer = '';

    constructor(sessionId: string) {
        super();
        this.sessionId = sessionId;
    }

    emitChunk(chunk: string): void {
        this.buffer += chunk;
        const event: ChunkEvent = {
            sessionId: this.sessionId,
            chunk,
            index: this.chunkIndex++,
        };
        this.emit('agent.chunk', event);

        if (wsClientManager.has(this.sessionId)) {
            wsClientManager.send(this.sessionId, {
                type: 'token',
                payload: { sessionId: this.sessionId, text: chunk, index: event.index },
            });
        }
    }

    emitComplete(durationMs: number): void {
        const event: CompleteEvent = {
            sessionId: this.sessionId,
            fullText: this.buffer,
            durationMs,
        };
        logger.event('Channel', `Turn complete — session=${this.sessionId} | ${durationMs}ms | ${this.chunkIndex} chunks`);
        this.emit('agent.complete', event);
        this.reset();
    }

    emitToolStart(toolName: string): void {
        const event: ToolStartEvent = { sessionId: this.sessionId, toolName };
        logger.event('Channel', `Tool start — session=${this.sessionId} | tool=${toolName}`);
        this.emit('agent.tool.start', event);

        if (wsClientManager.has(this.sessionId)) {
            wsClientManager.send(this.sessionId, {
                type: 'tool_call',
                payload: { sessionId: this.sessionId, name: toolName },
            });
        }
    }

    emitToolDone(toolName: string, result: Record<string, unknown>): void {
        const event: ToolDoneEvent = { sessionId: this.sessionId, toolName, result };
        logger.event('Channel', `Tool done  — session=${this.sessionId} | tool=${toolName}`);
        this.emit('agent.tool.done', event);

        if (wsClientManager.has(this.sessionId)) {
            wsClientManager.send(this.sessionId, {
                type: 'tool_result',
                payload: { sessionId: this.sessionId, name: toolName, result },
            });
        }
    }

    emitAudioChunk(index: number, audio: string, text: string, durationMs: number): void {
        const event: AudioChunkEvent = { sessionId: this.sessionId, index, audio, text, durationMs };
        this.emit('agent.audioChunk', event);

        if (wsClientManager.has(this.sessionId)) {
            wsClientManager.send(this.sessionId, {
                type: 'audio_chunk',
                payload: { sessionId: this.sessionId, index, audio, text, durationMs },
            });
        }
    }

    emitInterrupt(reason: string): void {
        const event: InterruptEvent = { sessionId: this.sessionId, reason };
        logger.warn('Channel', `Interrupt  — session=${this.sessionId} | reason=${reason}`);
        this.emit('agent.interrupted', event);
        this.reset();
    }

    emitError(error: string): void {
        const event: ErrorEvent = { sessionId: this.sessionId, error };
        logger.error('Channel', `Error      — session=${this.sessionId} | ${error}`);
        this.emit('agent.error', event);

        if (wsClientManager.has(this.sessionId)) {
            wsClientManager.send(this.sessionId, {
                type: 'error',
                payload: { sessionId: this.sessionId, message: error },
            });
        }
    }

    get currentBuffer(): string {
        return this.buffer;
    }

    private reset(): void {
        this.buffer = '';
        this.chunkIndex = 0;
    }
}
