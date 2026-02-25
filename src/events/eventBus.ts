/**
 * src/events/eventBus.ts
 *
 * Simple EventEmitter-based async event bus.
 *
 * WHY THIS EXISTS:
 * In production, this is replaced by Inngest, BullMQ, or a message queue.
 * The EventEmitter simulates the same pattern:
 *   - An action emits an event (fire and forget)
 *   - A listener picks it up asynchronously
 *   - The original HTTP request doesn't wait for the listener to finish
 *
 * This decouples the agent response (fast) from side effects like
 * sending confirmation emails, syncing CRMs, analytics, etc. (slow/optional)
 *
 * HOW TO UPGRADE:
 * Replace `agentEvents.emit(...)` with `inngest.send(...)` and
 * `agentEvents.on(...)` with `inngest.createFunction(...)`.
 */

import { EventEmitter } from 'events';

// Single shared bus — all parts of the app import this instance
export const agentEvents = new EventEmitter();

// Increase the default listener limit to avoid Node warnings
// (one per tool per event type)
agentEvents.setMaxListeners(20);

// ── Event Types ───────────────────────────────────────────────
// Documenting expected event shapes improves maintainability

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
