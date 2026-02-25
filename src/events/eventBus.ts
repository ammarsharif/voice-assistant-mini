import { EventEmitter } from 'events';

export const agentEvents = new EventEmitter();
agentEvents.setMaxListeners(30);

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
