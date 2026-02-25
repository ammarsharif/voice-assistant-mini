import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { openaiClient, DEFAULT_CHAT_MODEL, AGENT_TEMPERATURE } from '../config/openai';
import { logger } from '../utils/logger';
import { AgentStateMachine } from './agentStateMachine';
import { ToolStreamHandler } from './toolStreamHandler';
import { MessageChannel } from '../services/messageChannel';
import { InterruptService } from '../services/interruptService';
import { latencySimulator } from '../services/latencySimulator';
import { getAllToolDefinitions, executeTool } from './toolRegistry';
import { SwitchSituationSchema, handleSwitchSituation, SWITCH_SITUATION_RESULT_KEY } from './tools/switchSituation';
import type { SituationName } from './situations';
import type { SessionState } from '../services/sessionService';

export interface StreamingAgentOutput {
    response: string;
    toolUsed?: string;
    situationAfterTool: SituationName;
    interrupted: boolean;
    apiCalls: number;
    durationMs: number;
}

export interface StreamingAgentInput {
    sessionId: string;
    tenantId: string;
    system: string;
    messages: ChatCompletionMessageParam[];
    session: SessionState;
    stateMachine: AgentStateMachine;
    channel: MessageChannel;
    interruptSvc: InterruptService;
}

export class StreamingAgent {
    private readonly input: StreamingAgentInput;

    constructor(input: StreamingAgentInput) {
        this.input = input;
    }

    async run(): Promise<StreamingAgentOutput> {
        const { sessionId, tenantId, system, messages, session, stateMachine, channel, interruptSvc } = this.input;
        const start = Date.now();
        let apiCalls = 0;

        const allTools = getAllToolDefinitions();
        const situationTools = allTools.filter((tool: ChatCompletionTool) => {
            const toolName = tool.function?.name ?? '';
            return session.situation === 'introduction'
                ? toolName === 'switch_situation'
                : true;
        });

        logger.debug('StreamingAgent', `First pass — session=${sessionId} | situation=${session.situation}`);

        stateMachine.setState('STREAMING');

        const firstStream = await openaiClient.chat.completions.create({
            model: DEFAULT_CHAT_MODEL,
            temperature: AGENT_TEMPERATURE,
            messages,
            tools: situationTools,
            tool_choice: 'auto',
            stream: true,
        });
        apiCalls++;

        const handler = new ToolStreamHandler(sessionId, channel, interruptSvc);
        const firstResult = await handler.process(firstStream);

        if (firstResult.interrupted) {
            const partial = firstResult.textAccumulated;
            const durationMs = Date.now() - start;
            logger.warn('StreamingAgent', `Turn interrupted after ${partial.length} chars | session=${sessionId}`);
            channel.emitInterrupt('barge-in during first pass');

            return {
                response: partial,
                situationAfterTool: session.situation,
                interrupted: true,
                apiCalls,
                durationMs,
            };
        }

        if (!firstResult.detectedToolCall) {
            const durationMs = Date.now() - start;
            channel.emitComplete(durationMs);

            return {
                response: firstResult.textAccumulated,
                situationAfterTool: session.situation,
                interrupted: false,
                apiCalls,
                durationMs,
            };
        }

        const { id: toolCallId, name: toolName, arguments: toolArgs } = firstResult.detectedToolCall;

        stateMachine.setState('WAITING_FOR_TOOL');
        channel.emitToolStart(toolName);

        logger.debug('StreamingAgent', `Executing tool: ${toolName} | session=${sessionId}`);

        await latencySimulator.toolDelay();

        let toolResult: Record<string, unknown>;
        let situationAfterTool = session.situation;
        let toolUsed: string | undefined;

        if (toolName === 'switch_situation') {
            const args = SwitchSituationSchema.parse(toolArgs);
            const previousSituation = session.situation;

            toolResult = await handleSwitchSituation(args, async (newSituation: SituationName) => {
                session.situation = newSituation;
                situationAfterTool = newSituation;
                logger.info('StreamingAgent', `Situation switched: ${previousSituation} → ${newSituation} | session=${sessionId}`);
            });
        } else {
            toolResult = await executeTool(toolName, tenantId, toolArgs);
        }

        toolUsed = toolName;
        channel.emitToolDone(toolName, toolResult);

        if (interruptSvc.isInterrupted(sessionId)) {
            const durationMs = Date.now() - start;
            channel.emitInterrupt('barge-in during tool execution');
            return {
                response: firstResult.textAccumulated,
                toolUsed,
                situationAfterTool,
                interrupted: true,
                apiCalls,
                durationMs,
            };
        }

        logger.debug('StreamingAgent', `Second pass after tool=${toolName} | session=${sessionId}`);

        const maybeNewSystem = toolResult[SWITCH_SITUATION_RESULT_KEY]
            ? system
            : system;

        const messagesWithTool: ChatCompletionMessageParam[] = [
            { role: 'system', content: maybeNewSystem },
            ...messages.slice(1),
            {
                role: 'assistant',
                content: firstResult.textAccumulated || null,
                tool_calls: [{
                    id: toolCallId,
                    type: 'function',
                    function: {
                        name: toolName,
                        arguments: JSON.stringify(toolArgs),
                    },
                }],
            },
            {
                role: 'tool',
                tool_call_id: toolCallId,
                content: JSON.stringify(toolResult),
            },
        ] as ChatCompletionMessageParam[];

        stateMachine.setState('STREAMING');

        const secondStream = await openaiClient.chat.completions.create({
            model: DEFAULT_CHAT_MODEL,
            temperature: AGENT_TEMPERATURE,
            messages: messagesWithTool,
            stream: true,
        });
        apiCalls++;

        const secondHandler = new ToolStreamHandler(sessionId, channel, interruptSvc);
        const secondResult = await secondHandler.process(secondStream);

        const durationMs = Date.now() - start;

        if (secondResult.interrupted) {
            channel.emitInterrupt('barge-in during second pass');
            return {
                response: secondResult.textAccumulated,
                toolUsed,
                situationAfterTool,
                interrupted: true,
                apiCalls,
                durationMs,
            };
        }

        channel.emitComplete(durationMs);

        return {
            response: secondResult.textAccumulated,
            toolUsed,
            situationAfterTool,
            interrupted: false,
            apiCalls,
            durationMs,
        };
    }
}
