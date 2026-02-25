/**
 * src/events/listeners.ts
 *
 * Async event listeners — the "background workers" of the system.
 *
 * WHY THIS EXISTS:
 * Listeners are registered once at startup. They respond to events
 * emitted by tool handlers without blocking the HTTP response.
 *
 * In Inngest, each listener below would be an `inngest.createFunction(...)`.
 * In BullMQ, each would be a worker processing jobs from a queue.
 *
 * These run asynchronously AFTER the HTTP response has already been sent.
 * Good for: sending emails, syncing to CRM, analytics, webhooks.
 */

import { agentEvents, TourBookedEvent, NoteCreatedEvent, ContactUpdatedEvent } from './eventBus';

/**
 * Register all event listeners.
 * Call this once from server.ts before starting the HTTP server.
 */
export function registerListeners(): void {

    // ── tour:booked ───────────────────────────────────────────
    agentEvents.on('tour:booked', (event: TourBookedEvent) => {
        // In production: send confirmation email, update CRM, trigger calendar invite
        console.log(
            `📅 [Event: tour:booked] tourId=${event.tourId} | ` +
            `tenant=${event.tenantId} | customer=${event.customer_name} | ` +
            `date=${event.tour_date} | location=${event.location}`
        );

        // Example of async work you'd do here in production:
        // await sendEmail({ to: customer.email, subject: 'Tour Confirmed', ... });
        // await crmClient.createDeal({ ... });
    });

    // ── note:created ──────────────────────────────────────────
    agentEvents.on('note:created', (event: NoteCreatedEvent) => {
        // In production: sync note to CRM, tag for follow-up, run NLP
        console.log(
            `📝 [Event: note:created] noteId=${event.noteId} | ` +
            `tenant=${event.tenantId} | preview="${event.content.slice(0, 50)}..."`
        );
    });

    // ── contact:updated ───────────────────────────────────────
    agentEvents.on('contact:updated', (event: ContactUpdatedEvent) => {
        // In production: push to HubSpot/Salesforce, send welcome email
        console.log(
            `👤 [Event: contact:updated] contactId=${event.contactId} | ` +
            `tenant=${event.tenantId} | name=${event.name} | ` +
            `email=${event.email ?? 'n/a'} | phone=${event.phone ?? 'n/a'}`
        );
    });

    console.log('✅  Event listeners registered');
}
