import { logger } from '../utils/logger';
import {
    agentEvents,
    TourBookedEvent,
    NoteCreatedEvent,
    ContactUpdatedEvent,
    JobSubmittedEvent,
    JobStartedEvent,
    JobCompletedEvent,
    JobFailedEvent,
} from './eventBus';

async function simulateAsync(label: string, delayMs = 80): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    logger.debug('Simulator', `${label} — simulated async task complete`);
}

function registerDomainListeners(): void {
    agentEvents.on('tour:booked', async (event: TourBookedEvent) => {
        logger.event(
            'tour:booked',
            `tourId=${event.tourId} | tenant=${event.tenantId} | ` +
            `customer=${event.customer_name} | date=${event.tour_date} | location=${event.location}`
        );
        await simulateAsync(`SMS confirmation to ${event.customer_name}`);
        logger.success('tour:booked', `[SIM] Confirmation SMS sent to ${event.customer_name}`);
    });

    agentEvents.on('note:created', async (event: NoteCreatedEvent) => {
        logger.event(
            'note:created',
            `noteId=${event.noteId} | tenant=${event.tenantId} | ` +
            `preview="${event.content.slice(0, 60)}…"`
        );
        await simulateAsync('Vector index update for note');
        logger.success('note:created', `[SIM] Note indexed for RAG retrieval`);
    });

    agentEvents.on('contact:updated', async (event: ContactUpdatedEvent) => {
        logger.event(
            'contact:updated',
            `contactId=${event.contactId} | tenant=${event.tenantId} | ` +
            `name=${event.name} | email=${event.email ?? 'n/a'} | phone=${event.phone ?? 'n/a'}`
        );
        await simulateAsync('CRM sync for contact update');
        logger.success('contact:updated', `[SIM] Contact synced to CRM`);
    });
}

function registerLifecycleListeners(): void {
    agentEvents.on('worker:job:submitted', (event: JobSubmittedEvent) => {
        logger.worker(
            'worker:job:submitted',
            `jobId=${event.jobId} | tenant=${event.tenantId}`
        );
    });

    agentEvents.on('agent:job:started', (event: JobStartedEvent) => {
        logger.worker(
            'agent:job:started',
            `jobId=${event.jobId} | tenant=${event.tenantId} | ts=${event.timestamp}`
        );
    });

    agentEvents.on('agent:job:completed', async (event: JobCompletedEvent) => {
        logger.worker(
            'agent:job:completed',
            `jobId=${event.jobId} | ${event.durationMs}ms` +
            (event.toolUsed ? ` | tool=${event.toolUsed}` : '')
        );
        await simulateAsync(`Metrics emit for job ${event.jobId}`, 20);
    });

    agentEvents.on('agent:job:failed', (event: JobFailedEvent) => {
        logger.error(
            'agent:job:failed',
            `jobId=${event.jobId} | ${event.durationMs}ms | error=${event.error}`
        );
        logger.warn('agent:job:failed', `[SIM] Alert would be sent to on-call engineer`);
    });
}

export function registerListeners(): void {
    registerDomainListeners();
    registerLifecycleListeners();
    logger.success('Listeners', 'All event listeners registered');
}
