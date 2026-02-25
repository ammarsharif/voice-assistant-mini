import { run as runAgent, AgentOutput } from '../agent/agent';
import { agentEvents } from '../events/eventBus';
import { logger } from '../utils/logger';

export interface AgentJob {
    jobId: string;
    tenantId: string;
    message: string;
    sessionId?: string;
}

export interface AgentJobResult {
    jobId: string;
    tenantId: string;
    response: string;
    toolUsed?: string;
    durationMs: number;
    status: 'completed' | 'failed';
    error?: string;
}

export async function runAgentJob(job: AgentJob): Promise<AgentJobResult> {
    const start = Date.now();

    logger.worker('AgentRunner', `Job started  [${job.jobId}] tenant=${job.tenantId}`);

    agentEvents.emit('agent:job:started', {
        jobId: job.jobId,
        tenantId: job.tenantId,
        message: job.message,
        timestamp: new Date().toISOString(),
    });

    try {
        const output: AgentOutput = await runAgent({
            tenantId: job.tenantId,
            message: job.message,
        });

        const durationMs = Date.now() - start;

        const result: AgentJobResult = {
            jobId: job.jobId,
            tenantId: job.tenantId,
            response: output.response,
            toolUsed: output.toolUsed,
            durationMs,
            status: 'completed',
        };

        logger.worker(
            'AgentRunner',
            `Job complete [${job.jobId}] in ${durationMs}ms` +
            (output.toolUsed ? ` | tool: ${output.toolUsed}` : '')
        );

        agentEvents.emit('agent:job:completed', result);

        return result;

    } catch (err) {
        const durationMs = Date.now() - start;
        const errorMsg = err instanceof Error ? err.message : String(err);

        logger.error('AgentRunner', `Job failed   [${job.jobId}]: ${errorMsg}`);

        const result: AgentJobResult = {
            jobId: job.jobId,
            tenantId: job.tenantId,
            response: '',
            durationMs,
            status: 'failed',
            error: errorMsg,
        };

        agentEvents.emit('agent:job:failed', result);

        throw err;
    }
}
