/**
 * src/agent/toolRegistry.ts
 *
 * Tool Registry — the central lookup for all available agent tools.
 *
 * WHY THIS PATTERN:
 * Instead of a giant if/else chain in the agent, we register each tool once.
 * The agent looks up the right handler dynamically by name. This means adding
 * a new tool only requires:
 *   1. Creating the tool file
 *   2. Registering it here
 * Nothing else changes.
 *
 * This is the "Strategy Pattern" applied to AI tool dispatch.
 */

import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { BookTourSchema, handleBookTour, bookTourDefinition } from './tools/bookTour';
import { TakeNoteSchema, handleTakeNote, takeNoteDefinition } from './tools/takeNote';
import { UpdateContactSchema, handleUpdateContact, updateContactDefinition } from './tools/updateContact';

// ── Type Definitions ──────────────────────────────────────────

/** A handler receives tenantId + raw JSON args, returns a structured result */
type ToolHandler = (tenantId: string, args: unknown) => Promise<Record<string, unknown>>;

interface ToolEntry {
    /** The handler that executes the tool logic */
    handler: ToolHandler;
    /** The OpenAI-format function definition sent to the model */
    definition: ChatCompletionTool;
}

// ── Registry Map ──────────────────────────────────────────────
// Maps tool name → { handler, definition }
const registry = new Map<string, ToolEntry>();

/**
 * Register a tool with the registry.
 * Each tool wraps its handler with Zod validation before execution.
 */
function registerTool(
    name: string,
    definition: ChatCompletionTool,
    handler: ToolHandler
): void {
    registry.set(name, { definition, handler });
}

// ── Register All Tools ────────────────────────────────────────

registerTool('book_tour', bookTourDefinition, async (tenantId, rawArgs) => {
    // Parse and validate args from the AI before trusting them
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

// ── Public API ────────────────────────────────────────────────

/**
 * All registered tool definitions — passed to OpenAI on every request
 * so the model knows what tools are available.
 */
export function getAllToolDefinitions(): ChatCompletionTool[] {
    return Array.from(registry.values()).map((entry) => entry.definition);
}

/**
 * Look up and execute a tool by name.
 * Throws if the tool is not registered (prevents unknown tool calls).
 */
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
