import { handleMessage } from '../agent/lifecycle';
import { agentEvents } from '../events/eventBus';
import { logger } from '../utils/logger';

export interface AgentJob {
    jobId: string;
    tenantId: string;
    sessionId: string;
    message: string;
}

export interface AgentJobResult {
    jobId: string;
    tenantId: string;
    sessionId: string;
    response: string;
    situation: string;
    toolUsed?: string;
    durationMs: number;
    status: 'completed' | 'failed';
    error?: string;
}

export async function runAgentJob(job: AgentJob): Promise<AgentJobResult> {
    logger.worker('AgentRunner', `Job started  [${job.jobId}] tenant=${job.tenantId} | session=${job.sessionId}`);

    agentEvents.emit('agent:job:started', {
        jobId: job.jobId,
        tenantId: job.tenantId,
        message: job.message,
        timestamp: new Date().toISOString(),
    });

    try {
        const output = await handleMessage({
            tenantId: job.tenantId,
            sessionId: job.sessionId,
            message: job.message,
        });

        const result: AgentJobResult = {
            jobId: job.jobId,
            tenantId: job.tenantId,
            sessionId: job.sessionId,
            response: output.response,
            situation: output.situation,
            toolUsed: output.toolUsed,
            durationMs: output.durationMs,
            status: 'completed',
        };

        logger.worker(
            'AgentRunner',
            `Job complete [${job.jobId}] in ${output.durationMs}ms | situation=${output.situation}` +
            (output.toolUsed ? ` | tool: ${output.toolUsed}` : '')
        );

        agentEvents.emit('agent:job:completed', result);

        return result;

    } catch (err) {
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
            status: 'failed',
            error: errorMsg,
        };

        agentEvents.emit('agent:job:failed', result);

        throw err;
    }
}

