import { agentEvents } from '../events/eventBus';
import { logger } from '../utils/logger';
import { AgentStateMachine } from './agentStateMachine';
import { StreamingAgent } from './streamingAgent';
import { MessageChannel } from '../services/messageChannel';
import { InterruptService, interruptService } from '../services/interruptService';
import { buildRuntimeContext } from '../services/runtimeContextService';
import { getOrCreateSession, saveSession } from '../services/sessionService';
import { withSessionLock } from '../services/sessionLockService';
import { saveConversation } from '../services/conversationService';
import { mockSTT } from './sttTts/mockSTT';
import { mockTTSStream } from './sttTts/mockTTS';

export interface AgentProcessInput {
    tenantId: string;
    sessionId: string;
    message?: string;
    audioInput?: string;
}

export interface AgentProcessOutput {
    response: string;
    situation: string;
    toolUsed?: string;
    sessionId: string;
    interrupted: boolean;
    apiCalls: number;
    durationMs: number;
    transcript?: string;
    audioChunks: number;
}

export class AgentProcess {
    private readonly input: AgentProcessInput;
    private readonly stateMachine: AgentStateMachine;
    private readonly channel: MessageChannel;
    private readonly interruptSvc: InterruptService;

    constructor(input: AgentProcessInput) {
        this.input = input;
        this.stateMachine = new AgentStateMachine(input.sessionId);
        this.channel = new MessageChannel(input.sessionId);
        this.interruptSvc = interruptService;
        this._bridgeChannelToGlobalBus();
    }

    private _bridgeChannelToGlobalBus(): void {
        this.channel.on('agent.chunk', (e) => agentEvents.emit('agent.chunk', e));
        this.channel.on('agent.complete', (e) => agentEvents.emit('agent.complete', e));
        this.channel.on('agent.tool.start', (e) => agentEvents.emit('agent.tool.start', e));
        this.channel.on('agent.tool.done', (e) => agentEvents.emit('agent.tool.done', e));
        this.channel.on('agent.interrupted', (e) => agentEvents.emit('agent.interrupted', e));
        this.channel.on('agent.error', (e) => agentEvents.emit('agent.error', e));
        this.channel.on('agent.audioChunk', (e) => agentEvents.emit('agent.audioChunk', e));
    }

    get messageChannel(): MessageChannel {
        return this.channel;
    }

    get state(): AgentStateMachine {
        return this.stateMachine;
    }

    async start(): Promise<AgentProcessOutput> {
        const { tenantId, sessionId, message: rawMessage, audioInput } = this.input;
        const start = Date.now();

        this.stateMachine.setState('LISTENING');

        if (this.interruptSvc.isInterrupted(sessionId)) {
            this.interruptSvc.clear(sessionId);
            logger.debug('AgentProcess', `Stale interrupt cleared — session=${sessionId}`);
        }

        return withSessionLock(sessionId, async () => {
            const session = await getOrCreateSession(tenantId, sessionId);

            const isNewSession = session.history.length === 0;
            if (isNewSession) {
                agentEvents.emit('session:started', { sessionId, tenantId, situation: session.situation });
                logger.info('AgentProcess', `New session — id=${sessionId} | tenant=${tenantId}`);
            }

            let transcript: string | undefined;
            let userMessage: string;

            if (audioInput) {
                logger.info('AgentProcess', `STT start — session=${sessionId} | audio="${audioInput.slice(0, 50)}…"`);

                const sttResult = await mockSTT(audioInput, sessionId);
                transcript = sttResult.transcript;
                userMessage = sttResult.transcript || audioInput;

                agentEvents.emit('agent.stt.done', {
                    sessionId,
                    tenantId,
                    transcript: sttResult.transcript,
                    confidence: sttResult.confidence,
                    processingMs: sttResult.processingMs,
                });

                logger.info(
                    'AgentProcess',
                    `STT done — session=${sessionId} | transcript="${sttResult.transcript}" | conf=${sttResult.confidence.toFixed(2)}`
                );
            } else if (rawMessage) {
                userMessage = rawMessage;
            } else {
                throw new Error('AgentProcess: either message or audioInput must be provided');
            }

            this.stateMachine.setState('PROCESSING');

            const runtimeCtx = await buildRuntimeContext(tenantId, userMessage, session);

            const streamingAgent = new StreamingAgent({
                sessionId,
                tenantId,
                system: runtimeCtx.system,
                messages: runtimeCtx.messages,
                session,
                stateMachine: this.stateMachine,
                channel: this.channel,
                interruptSvc: this.interruptSvc,
            });

            const result = await streamingAgent.run();

            if (result.interrupted) {
                this.stateMachine.forceState('INTERRUPTED');
                logger.warn('AgentProcess', `Turn INTERRUPTED — session=${sessionId}`);
            } else {
                this.stateMachine.setState('COMPLETED');
            }

            let audioChunkCount = 0;

            if (!result.interrupted && result.response) {
                logger.info('AgentProcess', `TTS start — session=${sessionId}`);
                this.stateMachine.setState('SPEAKING');

                for await (const chunk of mockTTSStream(result.response, sessionId, this.interruptSvc)) {
                    this.channel.emitAudioChunk(
                        chunk.index,
                        chunk.audio,
                        chunk.text,
                        chunk.durationMs
                    );
                    audioChunkCount++;

                    if (this.interruptSvc.isInterrupted(sessionId)) {
                        logger.warn('AgentProcess', `TTS halted by barge-in — session=${sessionId} | chunk=${chunk.index}`);
                        this.channel.emitInterrupt('barge-in during TTS');
                        break;
                    }
                }

                logger.info(
                    'AgentProcess',
                    `TTS done — session=${sessionId} | chunks=${audioChunkCount} | interrupted=${this.interruptSvc.isInterrupted(sessionId)}`
                );
            }

            session.history.push({ role: 'user', content: userMessage });
            session.history.push({ role: 'assistant', content: result.response });
            session.situation = result.situationAfterTool;

            await saveSession(tenantId, sessionId, session);

            await saveConversation({
                tenantId,
                message: userMessage,
                response: result.response,
                toolUsed: result.toolUsed,
                toolResult: undefined,
            });

            const durationMs = Date.now() - start;

            agentEvents.emit('session:message:processed', {
                sessionId,
                tenantId,
                situation: result.situationAfterTool,
                toolUsed: result.toolUsed,
                durationMs,
                interrupted: result.interrupted,
                audioChunks: audioChunkCount,
            });

            if (result.toolUsed) {
                agentEvents.emit('agent:tool:used', {
                    sessionId,
                    tenantId,
                    toolName: result.toolUsed,
                    durationMs,
                });
            }

            logger.info(
                'AgentProcess',
                `Turn complete — session=${sessionId} | ${durationMs}ms | ` +
                `situation=${result.situationAfterTool} | interrupted=${result.interrupted} | ` +
                `audioChunks=${audioChunkCount}` +
                (result.toolUsed ? ` | tool=${result.toolUsed}` : '')
            );

            this.stateMachine.forceState('IDLE');

            return {
                response: result.response,
                situation: result.situationAfterTool,
                toolUsed: result.toolUsed,
                sessionId,
                interrupted: result.interrupted,
                apiCalls: result.apiCalls,
                durationMs,
                transcript,
                audioChunks: audioChunkCount,
            };
        });
    }

    interrupt(reason = 'new-message'): void {
        this.interruptSvc.signal(this.input.sessionId, reason);
        logger.warn('AgentProcess', `External interrupt — session=${this.input.sessionId} | reason=${reason}`);
    }
}
