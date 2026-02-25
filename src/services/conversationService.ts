import { db } from '../config/db';
import { logger } from '../utils/logger';

export interface SaveConversationInput {
    tenantId: string;
    message: string;
    response: string;
    toolUsed?: string;
    toolResult?: Record<string, unknown>;
}

export async function saveConversation(input: SaveConversationInput): Promise<void> {
    const { error } = await db.from('conversations').insert({
        tenant_id: input.tenantId,
        message: input.message,
        response: input.response,
        tool_used: input.toolUsed ?? null,
        tool_result: input.toolResult ?? null,
    });

    if (error) {
        logger.warn('ConversationService', `Failed to save conversation: ${error.message}`);
    } else {
        logger.debug('ConversationService', `Conversation saved | tenant=${input.tenantId}`);
    }
}
