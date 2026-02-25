import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { openaiClient, DEFAULT_CHAT_MODEL, AGENT_TEMPERATURE } from '../config/openai';
import { buildRuntimeContext } from '../services/runtimeContextService';
import { getOrCreateSession, saveSession } from '../services/sessionService';
import { withSessionLock } from '../services/sessionLockService';
import { saveConversation } from '../services/conversationService';
import { getAllToolDefinitions, executeTool } from './toolRegistry';
import { agentEvents } from '../events/eventBus';
import { logger } from '../utils/logger';
import type { SituationName } from './situations';
import { SwitchSituationSchema, handleSwitchSituation, SWITCH_SITUATION_RESULT_KEY } from './tools/switchSituation';

export interface LifecycleInput {
    tenantId: string;
    sessionId: string;
    message: string;
}

export interface LifecycleOutput {
    response: string;
    situation: string;
    toolUsed?: string;
    sessionId: string;
    model: string;
    apiCalls: number;
    durationMs: number;
}

export async function handleMessage(input: LifecycleInput): Promise<LifecycleOutput> {
    const { tenantId, sessionId, message } = input;
    const start = Date.now();

    return withSessionLock(sessionId, async () => {
        const session = await getOrCreateSession(tenantId, sessionId);

        const isNewSession = session.history.length === 0;
        if (isNewSession) {
            agentEvents.emit('session:started', {
                sessionId,
                tenantId,
                situation: session.situation,
            });
            logger.info('Lifecycle', `New session started — id=${sessionId} | tenant=${tenantId}`);
        }

        const runtimeCtx = await buildRuntimeContext(tenantId, message, session);

        const allTools = getAllToolDefinitions();
        const situationTools = allTools.filter((tool: ChatCompletionTool) => {
            const toolName = tool.function?.name ?? '';
            return session.situation === 'introduction'
                ? toolName === 'switch_situation'
                : true;
        });

        logger.debug('Lifecycle', `First LLM call — situation=${session.situation} | tools=${situationTools.map((t: ChatCompletionTool) => t.function?.name).join(',')}`);

        const firstResponse = await openaiClient.chat.completions.create({
            model: DEFAULT_CHAT_MODEL,
            temperature: AGENT_TEMPERATURE,
            messages: [
                { role: 'system', content: runtimeCtx.system },
                ...runtimeCtx.messages,
            ],
            tools: situationTools,
            tool_choice: 'auto',
        });

        const firstChoice = firstResponse.choices[0];
        let finalResponse: string;
        let toolUsed: string | undefined;
        let apiCalls = 1;
        let situationAfterTool = session.situation;

        if (firstChoice.message.tool_calls && firstChoice.message.tool_calls.length > 0) {
            const toolCall = firstChoice.message.tool_calls[0];
            const toolName = toolCall.function.name;
            const rawArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;

            logger.debug('Lifecycle', `Tool requested: ${toolName}`);

            let toolResult: Record<string, unknown>;

            if (toolName === 'switch_situation') {
                const args = SwitchSituationSchema.parse(rawArgs);
                const previousSituation = session.situation;

                toolResult = await handleSwitchSituation(args, async (newSituation: SituationName) => {
                    session.situation = newSituation;
                    situationAfterTool = newSituation;
                    agentEvents.emit('session:situation:switched', {
                        sessionId,
                        tenantId,
                        previousSituation,
                        newSituation,
                    });
                    logger.info('Lifecycle', `Situation switched: ${previousSituation} → ${newSituation}`);
                });
            } else {
                toolResult = await executeTool(toolName, tenantId, rawArgs);
            }

            logger.debug('Lifecycle', `Tool result:`, toolResult);

            const messagesWithTool: ChatCompletionMessageParam[] = [
                { role: 'system', content: runtimeCtx.system },
                ...runtimeCtx.messages,
                firstChoice.message,
                {
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(toolResult),
                },
            ];

            const secondRuntimeCtx = toolResult[SWITCH_SITUATION_RESULT_KEY]
                ? await buildRuntimeContext(tenantId, message, session)
                : runtimeCtx;

            const finalMessages: ChatCompletionMessageParam[] = toolResult[SWITCH_SITUATION_RESULT_KEY]
                ? [
                    { role: 'system', content: secondRuntimeCtx.system },
                    ...secondRuntimeCtx.messages,
                    firstChoice.message,
                    {
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(toolResult),
                    },
                ]
                : messagesWithTool;

            const secondResponse = await openaiClient.chat.completions.create({
                model: DEFAULT_CHAT_MODEL,
                temperature: AGENT_TEMPERATURE,
                messages: finalMessages,
            });

            finalResponse = secondResponse.choices[0].message.content ?? 'Done.';
            toolUsed = toolName;
            apiCalls = 2;
        } else {
            finalResponse = firstChoice.message.content ?? "I'm not sure how to help with that.";
        }

        session.history.push({ role: 'user', content: message });
        session.history.push({ role: 'assistant', content: finalResponse });

        await saveSession(tenantId, sessionId, session);

        await saveConversation({
            tenantId,
            message,
            response: finalResponse,
            toolUsed,
            toolResult: undefined,
        });

        const durationMs = Date.now() - start;

        agentEvents.emit('session:message:processed', {
            sessionId,
            tenantId,
            situation: situationAfterTool,
            toolUsed,
            durationMs,
        });

        logger.info(
            'Lifecycle',
            `Message handled — session=${sessionId} | situation=${situationAfterTool} | ${durationMs}ms` +
            (toolUsed ? ` | tool=${toolUsed}` : '')
        );

        return {
            response: finalResponse,
            situation: situationAfterTool,
            toolUsed,
            sessionId,
            model: DEFAULT_CHAT_MODEL,
            apiCalls,
            durationMs,
        };
    });
}
