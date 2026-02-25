import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { env } from '../config/env';
import { getTenantById } from '../services/tenantService';
import { getCachedPrompt, cachePrompt } from '../services/redis';
import { saveConversation } from '../services/conversationService';
import { getAllToolDefinitions, executeTool } from './toolRegistry';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export interface AgentInput {
    tenantId: string;
    message: string;
}

export interface AgentOutput {
    response: string;
    toolUsed?: string;
}

export async function run(input: AgentInput): Promise<AgentOutput> {
    const { tenantId, message } = input;
    let systemPrompt = await getCachedPrompt(tenantId);

    if (!systemPrompt) {
        const tenant = await getTenantById(tenantId);
        if (!tenant) {
            throw new Error(`Tenant "${tenantId}" not found`);
        }

        systemPrompt = `${tenant.system_prompt}\n\nToday's date: ${new Date().toISOString().split('T')[0]}`;

        await cachePrompt(tenantId, systemPrompt);
        console.log(`🔵 [Agent] Cache miss — prompt compiled and cached for tenant: ${tenantId}`);
    } else {
        console.log(`🟢 [Agent] Cache hit — using cached prompt for tenant: ${tenantId}`);
    }

    const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
    ];
    const tools = getAllToolDefinitions();

    const firstResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.3,
    });

    const firstChoice = firstResponse.choices[0];
    let finalResponse: string;
    let toolUsed: string | undefined;

    if (firstChoice.message.tool_calls && firstChoice.message.tool_calls.length > 0) {
        const toolCall = firstChoice.message.tool_calls[0];
        toolUsed = toolCall.function.name;

        console.log(`🔧 [Agent] Tool called: ${toolUsed}`);

        const rawArgs: unknown = JSON.parse(toolCall.function.arguments);

        const toolResult = await executeTool(toolUsed, tenantId, rawArgs);

        console.log(`✅ [Agent] Tool result:`, toolResult);

        const secondResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                ...messages,
                firstChoice.message,
                {
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(toolResult),
                },
            ],
            temperature: 0.3,
        });

        finalResponse = secondResponse.choices[0].message.content ?? 'Done.';
    } else {
        finalResponse = firstChoice.message.content ?? 'I\'m not sure how to help with that.';
    }

    await saveConversation({
        tenantId,
        message,
        response: finalResponse,
        toolUsed,
    });

    return { response: finalResponse, toolUsed };
}
