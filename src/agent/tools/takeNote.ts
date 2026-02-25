import { z } from 'zod';
import { supabase } from '../../db/client';
import { agentEvents } from '../../events/eventBus';

export const TakeNoteSchema = z.object({
    content: z.string().min(1, 'Note content cannot be empty').max(2000, 'Note too long'),
});

export type TakeNoteInput = z.infer<typeof TakeNoteSchema>;

export async function handleTakeNote(
    tenantId: string,
    args: TakeNoteInput
): Promise<Record<string, unknown>> {
    const { data, error } = await supabase
        .from('notes')
        .insert({
            tenant_id: tenantId,
            content: args.content,
        })
        .select('id')
        .single();

    if (error) throw new Error(`take_note DB error: ${error.message}`);

    const noteId = (data as { id: string }).id;

    agentEvents.emit('note:created', { tenantId, noteId, content: args.content });

    return {
        success: true,
        noteId,
        message: `Note saved successfully.`,
    };
}

export const takeNoteDefinition = {
    type: 'function' as const,
    function: {
        name: 'take_note',
        description: 'Save an important note or piece of information for later reference.',
        parameters: {
            type: 'object',
            properties: {
                content: {
                    type: 'string',
                    description: 'The note content to save',
                },
            },
            required: ['content'],
        },
    },
};
