import { AgentProcess } from '../agent/agentProcess';
import { agentEvents } from '../events/eventBus';
import { logger } from '../utils/logger';

export interface AgentJob {
    jobId: string;
    tenantId: string;
    sessionId: string;
    message: string;
    audioInput?: string;
}

export interface AgentJobResult {
    jobId: string;
    tenantId: string;
    sessionId: string;
    response: string;
    situation: string;
    toolUsed?: string;
    durationMs: number;
    interrupted: boolean;
    status: 'completed' | 'failed';
    error?: string;
    transcript?: string;
    audioChunks: number;
}

const activeProcesses = new Map<string, AgentProcess>();

export async function runAgentJob(job: AgentJob): Promise<AgentJobResult> {
    logger.worker('AgentRunner', `Job started  [${job.jobId}] tenant=${job.tenantId} | session=${job.sessionId}`);

    agentEvents.emit('agent:job:started', {
        jobId: job.jobId,
        tenantId: job.tenantId,
        message: job.message,
        timestamp: new Date().toISOString(),
    });

    const process = new AgentProcess({
        tenantId: job.tenantId,
        sessionId: job.sessionId,
        message: job.audioInput ? undefined : job.message,
        audioInput: job.audioInput,
    });

    const existing = activeProcesses.get(job.sessionId);
    if (existing) {
        logger.warn('AgentRunner', `Interrupting stale process for session=${job.sessionId}`);
        existing.interrupt('new-job');
    }

    activeProcesses.set(job.sessionId, process);

    process.messageChannel.on('agent.chunk', (e: { chunk: string; index: number }) => {
        if (e.index % 20 === 0) {
            logger.debug('AgentRunner', `[${job.jobId}] chunk #${e.index}: "${e.chunk}"`);
        }
    });

    process.messageChannel.on('agent.tool.start', (e: { toolName: string }) => {
        logger.worker('AgentRunner', `[${job.jobId}] Tool executing: ${e.toolName}`);
    });

    process.messageChannel.on('agent.interrupted', (e: { reason: string }) => {
        logger.warn('AgentRunner', `[${job.jobId}] Stream interrupted: ${e.reason}`);
    });

    try {
        const output = await process.start();

        activeProcesses.delete(job.sessionId);

        const result: AgentJobResult = {
            jobId: job.jobId,
            tenantId: job.tenantId,
            sessionId: job.sessionId,
            response: output.response,
            situation: output.situation,
            toolUsed: output.toolUsed,
            durationMs: output.durationMs,
            interrupted: output.interrupted,
            status: 'completed',
            transcript: output.transcript,
            audioChunks: output.audioChunks,
        };

        logger.worker(
            'AgentRunner',
            `Job complete [${job.jobId}] in ${output.durationMs}ms | situation=${output.situation}` +
            ` | audioChunks=${output.audioChunks}` +
            (output.toolUsed ? ` | tool: ${output.toolUsed}` : '') +
            (output.interrupted ? ' | INTERRUPTED' : '')
        );

        agentEvents.emit('agent:job:completed', result);

        return result;

    } catch (err) {
        activeProcesses.delete(job.sessionId);

        const durationMs = 0;
        const errorMsg = err instanceof Error ? err.message : String(err);

        logger.error('AgentRunner', `Job failed   [${job.jobId}]: ${errorMsg}`);

        const result: AgentJobResult = {
            jobId: job.jobId,
            tenantId: job.tenantId,
            sessionId: job.sessionId,
            response: '',
            situation: 'introduction',
            durationMs,
            interrupted: false,
            status: 'failed',
            error: errorMsg,
            audioChunks: 0,
        };

        agentEvents.emit('agent:job:failed', result);

        throw err;
    }
}
