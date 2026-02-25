import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { openaiClient, DEFAULT_CHAT_MODEL, AGENT_TEMPERATURE } from '../config/openai';
import { getCompiledPrompt } from '../services/promptService';
import { saveConversation } from '../services/conversationService';
import { getAllToolDefinitions, executeTool } from './toolRegistry';
import { logger } from '../utils/logger';

export interface AgentInput {
    tenantId: string;
    message: string;
    sessionId?: string;
}

export interface ToolCallMeta {
    name: string;
    arguments: Record<string, unknown>;
    result: Record<string, unknown>;
    eventEmitted?: boolean;
}

export interface AgentOutput {
    response: string;
    toolUsed?: string;
    toolMeta?: ToolCallMeta;
    model: string;
    apiCalls: number;
}

export async function run(input: AgentInput): Promise<AgentOutput> {
    const { tenantId, message } = input;

    const systemPrompt = await getCompiledPrompt(tenantId);

    const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
    ];
    const tools = getAllToolDefinitions();

    logger.debug('Agent', `First completion | model=${DEFAULT_CHAT_MODEL}`);

    const firstResponse = await openaiClient.chat.completions.create({
        model: DEFAULT_CHAT_MODEL,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: AGENT_TEMPERATURE,
    });

    const firstChoice = firstResponse.choices[0];
    let finalResponse: string;
    let toolMeta: ToolCallMeta | undefined;
    let apiCalls = 1;

    if (firstChoice.message.tool_calls && firstChoice.message.tool_calls.length > 0) {
        const toolCall = firstChoice.message.tool_calls[0];
        const toolName = toolCall.function.name;

        logger.debug('Agent', `Tool requested: ${toolName}`);

        const rawArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        const toolResult = await executeTool(toolName, tenantId, rawArgs);

        logger.debug('Agent', `Tool result:`, toolResult);

        const secondResponse = await openaiClient.chat.completions.create({
            model: DEFAULT_CHAT_MODEL,
            temperature: AGENT_TEMPERATURE,
            messages: [
                ...messages,
                firstChoice.message,
                {
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(toolResult),
                },
            ],
        });

        finalResponse = secondResponse.choices[0].message.content ?? 'Done.';
        apiCalls = 2;

        toolMeta = {
            name: toolName,
            arguments: rawArgs,
            result: toolResult,
        };
    } else {
        finalResponse = firstChoice.message.content ?? "I'm not sure how to help with that.";
    }

    await saveConversation({
        tenantId,
        message,
        response: finalResponse,
        toolUsed: toolMeta?.name,
        toolResult: toolMeta?.result,
    });

    return {
        response: finalResponse,
        toolUsed: toolMeta?.name,
        toolMeta,
        model: DEFAULT_CHAT_MODEL,
        apiCalls,
    };
}
