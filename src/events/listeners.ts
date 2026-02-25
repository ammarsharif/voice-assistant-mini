import { agentEvents, TourBookedEvent, NoteCreatedEvent, ContactUpdatedEvent } from './eventBus';

export function registerListeners(): void {

    agentEvents.on('tour:booked', (event: TourBookedEvent) => {
        console.log(
            `📅 [Event: tour:booked] tourId=${event.tourId} | ` +
            `tenant=${event.tenantId} | customer=${event.customer_name} | ` +
            `date=${event.tour_date} | location=${event.location}`
        );
    });

    agentEvents.on('note:created', (event: NoteCreatedEvent) => {
        console.log(
            `📝 [Event: note:created] noteId=${event.noteId} | ` +
            `tenant=${event.tenantId} | preview="${event.content.slice(0, 50)}..."`
        );
    });

    agentEvents.on('contact:updated', (event: ContactUpdatedEvent) => {
        console.log(
            `👤 [Event: contact:updated] contactId=${event.contactId} | ` +
            `tenant=${event.tenantId} | name=${event.name} | ` +
            `email=${event.email ?? 'n/a'} | phone=${event.phone ?? 'n/a'}`
        );
    });

    console.log('✅  Event listeners registered');
}
