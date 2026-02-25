import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

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
    }

    emitToolDone(toolName: string, result: Record<string, unknown>): void {
        const event: ToolDoneEvent = { sessionId: this.sessionId, toolName, result };
        logger.event('Channel', `Tool done  — session=${this.sessionId} | tool=${toolName}`);
        this.emit('agent.tool.done', event);
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
    }

    get currentBuffer(): string {
        return this.buffer;
    }

    private reset(): void {
        this.buffer = '';
        this.chunkIndex = 0;
    }
}
