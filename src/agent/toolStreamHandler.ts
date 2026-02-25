import type { ChatCompletionChunk } from 'openai/resources/chat/completions';
import type { Stream } from 'openai/streaming';
import { logger } from '../utils/logger';
import { MessageChannel } from '../services/messageChannel';
import { InterruptService } from '../services/interruptService';
import { latencySimulator } from '../services/latencySimulator';

interface ToolCallFragment {
    id: string;
    name: string;
    argumentsBuffer: string;
    index: number;
}

export interface StreamResult {
    textAccumulated: string;
    detectedToolCall?: {
        id: string;
        name: string;
        arguments: Record<string, unknown>;
    };
    interrupted: boolean;
}

export class ToolStreamHandler {
    constructor(
        private readonly sessionId: string,
        private readonly channel: MessageChannel,
        private readonly interruptSvc: InterruptService
    ) { }

    async process(
        stream: Stream<ChatCompletionChunk>
    ): Promise<StreamResult> {
        let textAccumulated = '';
        const toolFragments = new Map<number, ToolCallFragment>();
        let interrupted = false;

        logger.debug('ToolStreamHandler', `Stream open — session=${this.sessionId}`);

        for await (const chunk of stream) {
            if (this.interruptSvc.isInterrupted(this.sessionId)) {
                logger.warn('ToolStreamHandler', `Barge-in detected — stopping stream | session=${this.sessionId}`);
                interrupted = true;
                break;
            }

            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
                textAccumulated += delta.content;
                this.channel.emitChunk(delta.content);

                await latencySimulator.tokenDelay();

                await latencySimulator.networkJitter();
            }

            if (delta.tool_calls) {
                for (const toolDelta of delta.tool_calls) {
                    const idx = toolDelta.index ?? 0;

                    if (!toolFragments.has(idx)) {
                        toolFragments.set(idx, {
                            id: toolDelta.id ?? '',
                            name: toolDelta.function?.name ?? '',
                            argumentsBuffer: '',
                            index: idx,
                        });
                    }

                    const frag = toolFragments.get(idx)!;

                    if (toolDelta.id) frag.id = toolDelta.id;
                    if (toolDelta.function?.name) frag.name = toolDelta.function.name;
                    if (toolDelta.function?.arguments) {
                        frag.argumentsBuffer += toolDelta.function.arguments;
                    }
                }
            }

            const finishReason = chunk.choices[0]?.finish_reason;
            if (finishReason === 'stop' || finishReason === 'tool_calls') {
                logger.debug('ToolStreamHandler', `Finish reason: ${finishReason} | session=${this.sessionId}`);
                break;
            }
        }

        let detectedToolCall: StreamResult['detectedToolCall'];

        if (toolFragments.size > 0) {
            const primary = toolFragments.get(0);
            if (primary && primary.name) {
                let parsedArgs: Record<string, unknown> = {};
                try {
                    parsedArgs = JSON.parse(primary.argumentsBuffer) as Record<string, unknown>;
                } catch {
                    logger.warn(
                        'ToolStreamHandler',
                        `Failed to parse tool args for "${primary.name}" — raw: ${primary.argumentsBuffer}`
                    );
                }

                detectedToolCall = {
                    id: primary.id,
                    name: primary.name,
                    arguments: parsedArgs,
                };

                logger.debug(
                    'ToolStreamHandler',
                    `Tool call assembled — name=${primary.name} | session=${this.sessionId}`
                );
            }
        }

        return { textAccumulated, detectedToolCall, interrupted };
    }
}
