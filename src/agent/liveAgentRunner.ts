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
import { AudioPipelineService } from '../services/audioPipelineService';
import { LiveKitClient } from '../audio/livekitClient';
import { createLiveKitToken } from '../config/livekit';
import { env } from '../config/env';

export interface LiveAgentRunnerConfig {
    tenantId: string;
    sessionId: string;
    roomName?: string;
}

export class LiveAgentRunner {
    private readonly config: LiveAgentRunnerConfig;
    private readonly stateMachine: AgentStateMachine;
    private readonly channel: MessageChannel;
    private readonly interruptSvc: InterruptService;
    private readonly pipeline: AudioPipelineService;
    private liveKitClient: LiveKitClient | null = null;
    private running = false;

    constructor(config: LiveAgentRunnerConfig) {
        this.config = config;
        this.stateMachine = new AgentStateMachine(config.sessionId);
        this.channel = new MessageChannel(config.sessionId);
        this.interruptSvc = interruptService;
        this.pipeline = new AudioPipelineService({
            sessionId: config.sessionId,
            tenantId: config.tenantId,
            interruptSvc: this.interruptSvc,
            channel: this.channel,
            // This callback is set after connect() so we use a closure
            publishAudio: async (pcmBuffer: Buffer) => {
                if (this.liveKitClient?.isConnected) {
                    await this.liveKitClient.publishAudioBuffer(pcmBuffer);
                }
            },
        });

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

    async start(): Promise<void> {
        const { tenantId, sessionId, roomName } = this.config;
        const room = roomName ?? env.LIVEKIT_DEFAULT_ROOM;

        if (this.running) {
            logger.warn('LiveAgentRunner', `Already running — session=${sessionId}`);
            return;
        }

        this.running = true;
        this.stateMachine.forceState('IDLE');

        logger.info('LiveAgentRunner', `Starting — session=${sessionId} | tenant=${tenantId} | room=${room}`);

        const token = await createLiveKitToken({
            roomName: room,
            participantIdentity: `agent-${sessionId}`,
            participantName: 'AI Agent',
            metadata: JSON.stringify({ sessionId, tenantId }),
        });

        this.liveKitClient = new LiveKitClient({
            roomName: room,
            participantIdentity: `agent-${sessionId}`,
            token,
            sessionId,
        });

        this.liveKitClient.on('audio:frame', async (event) => {
            if (!this.stateMachine.isOneOf('LISTENING', 'IDLE')) return;
            this.pipeline.feedAudio(event.frame);
        });

        this.liveKitClient.on('room:connected', () => {
            agentEvents.emit('livekit:room:connected', { sessionId, tenantId, room });
            logger.success('LiveAgentRunner', `Room connected — session=${sessionId}`);
        });

        this.liveKitClient.on('room:disconnected', () => {
            agentEvents.emit('livekit:room:disconnected', { sessionId, tenantId, room });
            this.running = false;
        });

        this.liveKitClient.on('participant:joined', (identity) => {
            agentEvents.emit('livekit:participant:joined', { sessionId, tenantId, identity });
            logger.info('LiveAgentRunner', `Client joined: ${identity} | session=${sessionId}`);
        });

        this.liveKitClient.on('participant:left', (identity) => {
            agentEvents.emit('livekit:participant:left', { sessionId, tenantId, identity });
            logger.info('LiveAgentRunner', `Client left: ${identity} | session=${sessionId}`);
        });

        this.pipeline.startSTT();

        this.pipeline.on('stt:final', async (transcript: string) => {
            if (!transcript.trim()) return;

            logger.info('LiveAgentRunner', `STT final — session=${sessionId} | "${transcript.slice(0, 80)}"`);
            await this._handleTranscript(transcript);
        });

        try {
            await this.liveKitClient.connect();
        } catch (err) {
            logger.error('LiveAgentRunner', `Failed to connect to LiveKit — session=${sessionId} | ${String(err)}`);
            this.running = false;
            throw err;
        }

        // Agent is now in the room and ready to listen — move state machine from IDLE → LISTENING
        this.stateMachine.setState('LISTENING');

        logger.success('LiveAgentRunner', `Live agent runner active — session=${sessionId} | room=${room}`);
    }

    private async _handleTranscript(transcript: string): Promise<void> {
        const { tenantId, sessionId } = this.config;

        if (this.stateMachine.isOneOf('PROCESSING', 'STREAMING', 'WAITING_FOR_TOOL')) {
            logger.warn('LiveAgentRunner', `Barge-in mid-response — session=${sessionId}`);
            this.interruptSvc.signal(sessionId, 'barge-in');
            await new Promise((r) => setTimeout(r, 150));
        }

        // Safety net: ensure we are in LISTENING before trying to move to PROCESSING
        if (this.stateMachine.is('IDLE')) {
            logger.warn('LiveAgentRunner', `State was IDLE on transcript — forcing LISTENING | session=${sessionId}`);
            this.stateMachine.forceState('LISTENING');
        }

        await withSessionLock(sessionId, async () => {
            const session = await getOrCreateSession(tenantId, sessionId);

            const isNewSession = session.history.length === 0;
            if (isNewSession) {
                agentEvents.emit('session:started', { sessionId, tenantId, situation: session.situation });
            }

            this.stateMachine.setState('PROCESSING');

            const runtimeCtx = await buildRuntimeContext(tenantId, transcript, session);

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
            } else {
                this.stateMachine.setState('COMPLETED');
            }

            if (!result.interrupted && result.response) {
                this.stateMachine.setState('SPEAKING');

                await this.pipeline.runTTS(result.response);

                if (this.liveKitClient?.isConnected) {
                    logger.debug('LiveAgentRunner', `TTS audio emitted to LiveKit room — session=${sessionId}`);
                }
            }

            session.history.push({ role: 'user', content: transcript });
            session.history.push({ role: 'assistant', content: result.response });
            session.situation = result.situationAfterTool;

            await saveSession(tenantId, sessionId, session);

            await saveConversation({
                tenantId,
                message: transcript,
                response: result.response,
                toolUsed: result.toolUsed,
                toolResult: undefined,
            });

            agentEvents.emit('session:message:processed', {
                sessionId,
                tenantId,
                situation: result.situationAfterTool,
                toolUsed: result.toolUsed,
                durationMs: result.durationMs,
                interrupted: result.interrupted,
            });

            if (result.toolUsed) {
                agentEvents.emit('agent:tool:used', {
                    sessionId,
                    tenantId,
                    toolName: result.toolUsed,
                    durationMs: result.durationMs,
                });
            }

            this.stateMachine.forceState('LISTENING');
        });
    }

    feedAudio(chunk: Buffer): void {
        this.pipeline.feedAudio(chunk);
    }

    get currentState(): string {
        return this.stateMachine.state;
    }

    interrupt(reason = 'external'): void {
        this.interruptSvc.signal(this.config.sessionId, reason);
        logger.warn('LiveAgentRunner', `External interrupt — session=${this.config.sessionId} | reason=${reason}`);
    }

    async stop(): Promise<void> {
        this.running = false;
        this.pipeline.destroy();
        if (this.liveKitClient) {
            await this.liveKitClient.disconnect();
            this.liveKitClient = null;
        }
        this.stateMachine.forceState('IDLE');
        logger.info('LiveAgentRunner', `Stopped — session=${this.config.sessionId}`);
    }
}
