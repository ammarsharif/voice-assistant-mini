import { logger } from '../utils/logger';
import { agentEvents } from './eventBus';
import type {
    TourBookedEvent,
    NoteCreatedEvent,
    ContactUpdatedEvent,
    SituationSwitchedEvent,
    SessionStartedEvent,
    SessionEndedEvent,
} from './eventBus';

async function simulateColdWork(label: string, delayMs = 80): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    logger.debug('ColdPath', `${label} — async task complete`);
}

export function registerColdPathListeners(): void {
    agentEvents.on('tour:booked', async (event: TourBookedEvent) => {
        logger.event('cold:tour:booked', `tourId=${event.tourId} | tenant=${event.tenantId} | customer=${event.customer_name}`);
        await simulateColdWork('CRM: new lead from tour booking');
        logger.success('cold:tour:booked', `[SIM] Tour lead synced to CRM`);

        await simulateColdWork('SMS: tour confirmation', 50);
        logger.success('cold:tour:booked', `[SIM] Confirmation SMS dispatched to ${event.customer_name}`);
    });

    agentEvents.on('note:created', async (event: NoteCreatedEvent) => {
        logger.event('cold:note:created', `noteId=${event.noteId} | tenant=${event.tenantId}`);
        await simulateColdWork('Vector DB: index note for RAG');
        logger.success('cold:note:created', `[SIM] Note indexed for RAG retrieval`);
    });

    agentEvents.on('contact:updated', async (event: ContactUpdatedEvent) => {
        logger.event('cold:contact:updated', `contactId=${event.contactId} | tenant=${event.tenantId}`);
        await simulateColdWork('CRM: sync contact update');
        logger.success('cold:contact:updated', `[SIM] Contact synced to CRM`);
    });

    agentEvents.on('session:situation:switched', async (event: SituationSwitchedEvent) => {
        logger.event(
            'cold:situation:switched',
            `session=${event.sessionId} | ${event.previousSituation} → ${event.newSituation} | tenant=${event.tenantId}`
        );
        await simulateColdWork('Analytics: situation transition tracked', 30);
        logger.success('cold:situation:switched', `[SIM] Transition analytics emitted`);
    });

    agentEvents.on('session:started', (event: SessionStartedEvent) => {
        logger.event('cold:session:started', `session=${event.sessionId} | tenant=${event.tenantId}`);
    });

    agentEvents.on('session:ended', async (event: SessionEndedEvent) => {
        logger.event('cold:session:ended', `session=${event.sessionId} | tenant=${event.tenantId} | turns=${event.turnCount}`);
        await simulateColdWork('Analytics: session summary stored', 40);
        logger.success('cold:session:ended', `[SIM] Session analytics persisted`);
    });

    logger.success('ColdPath', 'Cold-path event listeners registered');
}
