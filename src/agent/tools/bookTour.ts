/**
 * src/agent/tools/bookTour.ts
 *
 * "book_tour" tool — writes to the `tours` table via Supabase and emits an event.
 *
 * ARCHITECTURE NOTE:
 * Each tool is a self-contained module with:
 *   1. A Zod schema (runtime validation of AI-provided args)
 *   2. A handler function (side-effect: DB write + event emit)
 *   3. An OpenAI function definition (describes the tool to the LLM)
 */

import { z } from 'zod';
import { supabase } from '../../db/client';
import { agentEvents } from '../../events/eventBus';

// ── 1. Zod Schema ─────────────────────────────────────────────
// Validates the arguments OpenAI returns before we trust them.
export const BookTourSchema = z.object({
    customer_name: z.string().min(1, 'Customer name is required'),
    tour_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    location: z.string().min(1, 'Location is required'),
});

export type BookTourInput = z.infer<typeof BookTourSchema>;

// ── 2. Handler ────────────────────────────────────────────────
export async function handleBookTour(
    tenantId: string,
    args: BookTourInput
): Promise<Record<string, unknown>> {
    const { data, error } = await supabase
        .from('tours')
        .insert({
            tenant_id: tenantId,
            customer_name: args.customer_name,
            tour_date: args.tour_date,
            location: args.location,
        })
        .select('id')
        .single();

    if (error) throw new Error(`book_tour DB error: ${error.message}`);

    const tourId = (data as { id: string }).id;

    // Emit async event — the listener handles downstream work (emails, CRM, etc.)
    // This simulates how Inngest triggers background functions
    agentEvents.emit('tour:booked', { tenantId, tourId, ...args });

    return {
        success: true,
        tourId,
        message: `Tour booked for ${args.customer_name} on ${args.tour_date} at ${args.location}.`,
    };
}

// ── 3. OpenAI Function Definition ─────────────────────────────
// This object is passed to OpenAI so the model knows the tool exists
// and what parameters to provide when calling it.
export const bookTourDefinition = {
    type: 'function' as const,
    function: {
        name: 'book_tour',
        description: 'Book a tour for a customer on a specific date and location.',
        parameters: {
            type: 'object',
            properties: {
                customer_name: {
                    type: 'string',
                    description: 'Full name of the customer booking the tour',
                },
                tour_date: {
                    type: 'string',
                    description: 'Tour date in YYYY-MM-DD format',
                },
                location: {
                    type: 'string',
                    description: 'Tour location or destination',
                },
            },
            required: ['customer_name', 'tour_date', 'location'],
        },
    },
};
