import { EventEmitter } from 'events';

export const agentEvents = new EventEmitter();

agentEvents.setMaxListeners(20);

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
