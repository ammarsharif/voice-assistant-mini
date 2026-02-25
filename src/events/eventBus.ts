import { EventEmitter } from 'events';

export const agentEvents = new EventEmitter();
agentEvents.setMaxListeners(50);

export interface TourBookedEvent {
    tenantId: string;
    tourId: string;
    customer_name: string;
    tour_date: string;
    location: string;
}

export interface NoteCreatedEvent {
    tenantId: string;
    noteId: string;
    content: string;
}

export interface ContactUpdatedEvent {
    tenantId: string;
    contactId: string;
    name: string;
    email?: string;
    phone?: string;
}

export interface JobSubmittedEvent {
    jobId: string;
    tenantId: string;
    message: string;
}

export interface JobStartedEvent {
    jobId: string;
    tenantId: string;
    message: string;
    timestamp: string;
}

export interface JobCompletedEvent {
    jobId: string;
    tenantId: string;
    response: string;
    toolUsed?: string;
    durationMs: number;
    status: 'completed';
}

export interface JobFailedEvent {
    jobId: string;
    tenantId: string;
    durationMs: number;
    status: 'failed';
    error: string;
}

export interface SituationSwitchedEvent {
    sessionId: string;
    tenantId: string;
    previousSituation: string;
    newSituation: string;
}

export interface SessionStartedEvent {
    sessionId: string;
    tenantId: string;
    situation: string;
}

export interface SessionEndedEvent {
    sessionId: string;
    tenantId: string;
    turnCount: number;
}

export interface MessageProcessedEvent {
    sessionId: string;
    tenantId: string;
    situation: string;
    toolUsed?: string;
    durationMs: number;
    interrupted?: boolean;
}

export interface AgentChunkEvent {
    sessionId: string;
    chunk: string;
    index: number;
}

export interface AgentCompleteEvent {
    sessionId: string;
    fullText: string;
    durationMs: number;
}

export interface AgentToolStartEvent {
    sessionId: string;
    toolName: string;
}

export interface AgentToolDoneEvent {
    sessionId: string;
    toolName: string;
    result: Record<string, unknown>;
}

export interface AgentInterruptedEvent {
    sessionId: string;
    reason: string;
}

export interface AgentErrorEvent {
    sessionId: string;
    error: string;
}

export interface AgentToolUsedEvent {
    sessionId: string;
    tenantId: string;
    toolName: string;
    durationMs: number;
}

export interface AgentInterruptedGlobalEvent {
    sessionId: string;
    reason: string;
}
