import { z } from 'zod';
import { supabase } from '../../db/client';
import { agentEvents } from '../../events/eventBus';

export const UpdateContactSchema = z.object({
    name: z.string().min(1, 'Contact name is required'),
    email: z.string().email('Must be a valid email').optional(),
    phone: z.string().min(7, 'Phone number too short').optional(),
}).refine(
    (data) => data.email !== undefined || data.phone !== undefined,
    { message: 'At least one of email or phone must be provided' }
);

export type UpdateContactInput = z.infer<typeof UpdateContactSchema>;

export async function handleUpdateContact(
    tenantId: string,
    args: UpdateContactInput
): Promise<Record<string, unknown>> {
    const { data, error } = await supabase
        .from('contacts')
        .upsert(
            {
                tenant_id: tenantId,
                name: args.name,
                email: args.email ?? null,
                phone: args.phone ?? null,
                updated_at: new Date().toISOString(),
            },
            {
                onConflict: 'tenant_id,name',
                ignoreDuplicates: false,
            }
        )
        .select('id')
        .single();

    if (error) throw new Error(`update_contact_info DB error: ${error.message}`);

    const contactId = (data as { id: string }).id;

    agentEvents.emit('contact:updated', { tenantId, contactId, ...args });

    return {
        success: true,
        contactId,
        message: `Contact info updated for ${args.name}.`,
    };
}

export const updateContactDefinition = {
    type: 'function' as const,
    function: {
        name: 'update_contact_info',
        description: 'Update or create contact information (email/phone) for a customer.',
        parameters: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Full name of the contact',
                },
                email: {
                    type: 'string',
                    description: 'Email address of the contact',
                },
                phone: {
                    type: 'string',
                    description: 'Phone number of the contact',
                },
            },
            required: ['name'],
        },
    },
};
