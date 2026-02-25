import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { BookTourSchema, handleBookTour, bookTourDefinition } from './tools/bookTour';
import { TakeNoteSchema, handleTakeNote, takeNoteDefinition } from './tools/takeNote';
import { UpdateContactSchema, handleUpdateContact, updateContactDefinition } from './tools/updateContact';

type ToolHandler = (tenantId: string, rawArgs: unknown) => Promise<Record<string, unknown>>;

interface ToolEntry {
    handler: ToolHandler;
    definition: ChatCompletionTool;
}

const registry = new Map<string, ToolEntry>();

function registerTool(
    name: string,
    definition: ChatCompletionTool,
    handler: ToolHandler
): void {
    registry.set(name, { definition, handler });
}

registerTool('book_tour', bookTourDefinition, async (tenantId, rawArgs) => {
    const args = BookTourSchema.parse(rawArgs);
    return handleBookTour(tenantId, args);
});

registerTool('take_note', takeNoteDefinition, async (tenantId, rawArgs) => {
    const args = TakeNoteSchema.parse(rawArgs);
    return handleTakeNote(tenantId, args);
});

registerTool('update_contact_info', updateContactDefinition, async (tenantId, rawArgs) => {
    const args = UpdateContactSchema.parse(rawArgs);
    return handleUpdateContact(tenantId, args);
});

export function getAllToolDefinitions(): ChatCompletionTool[] {
    return Array.from(registry.values()).map((entry) => entry.definition);
}

export async function executeTool(
    toolName: string,
    tenantId: string,
    rawArgs: unknown
): Promise<Record<string, unknown>> {
    const entry = registry.get(toolName);
    if (!entry) {
        throw new Error(`Tool "${toolName}" is not registered in the tool registry.`);
    }
    return entry.handler(tenantId, rawArgs);
}
