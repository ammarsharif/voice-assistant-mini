import { supabase } from '../db/client';

export interface SaveConversationInput {
    tenantId: string;
    message: string;
    response: string;
    toolUsed?: string;
}

export async function saveConversation(input: SaveConversationInput): Promise<void> {
    const { error } = await supabase.from('conversations').insert({
        tenant_id: input.tenantId,
        message: input.message,
        response: input.response,
        tool_used: input.toolUsed ?? null,
    });

    if (error) {
        console.error('⚠️  Failed to save conversation:', error.message);
    }
}
