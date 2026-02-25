/**
 * src/services/conversationService.ts
 *
 * Persists chat turns to the conversations table via Supabase.
 *
 * WHY: Every user ↔ AI exchange is stored so we have:
 * - Complete audit trail
 * - Future context window building
 * - Analytics on tool usage per tenant
 */

import { supabase } from '../db/client';

export interface SaveConversationInput {
    tenantId: string;
    message: string;   // Original user message
    response: string;  // Final AI response text
    toolUsed?: string; // Tool name if a tool was called
}

/**
 * Save a completed chat turn to the database.
 */
export async function saveConversation(input: SaveConversationInput): Promise<void> {
    const { error } = await supabase.from('conversations').insert({
        tenant_id: input.tenantId,
        message: input.message,
        response: input.response,
        tool_used: input.toolUsed ?? null,
    });

    if (error) {
        // Log but don't crash the response — the user already got their answer
        console.error('⚠️  Failed to save conversation:', error.message);
    }
}
