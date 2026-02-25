import { randomUUID } from 'crypto';
import { agentEvents } from '../events/eventBus';
import { runAgentJob, AgentJob, AgentJobResult } from './agentRunner';
import { checkRateLimit } from '../services/promptService';
import { logger } from '../utils/logger';

const MAX_CONCURRENT_JOBS = 5;
let activeJobs = 0;

const pendingQueue: Array<{
    job: AgentJob;
    resolve: (result: AgentJobResult) => void;
    reject: (err: unknown) => void;
}> = [];

function drainQueue(): void {
    if (pendingQueue.length === 0 || activeJobs >= MAX_CONCURRENT_JOBS) return;

    const next = pendingQueue.shift()!;
    logger.worker('Worker', `Dequeuing pending job [${next.job.jobId}] (queue size: ${pendingQueue.length})`);
    executeJob(next.job).then(next.resolve).catch(next.reject);
}

async function executeJob(job: AgentJob): Promise<AgentJobResult> {
    activeJobs++;
    logger.worker('Worker', `Active jobs: ${activeJobs}/${MAX_CONCURRENT_JOBS}`);
    try {
        return await runAgentJob(job);
    } finally {
        activeJobs--;
        logger.worker('Worker', `Job [${job.jobId}] done. Active jobs: ${activeJobs}`);
        drainQueue();
    }
}

export async function submitJob(tenantId: string, sessionId: string, message: string): Promise<AgentJobResult> {
    const rl = await checkRateLimit(tenantId);
    if (!rl.allowed) {
        throw Object.assign(
            new Error(`Rate limit exceeded. Retry after ${Math.ceil((rl.retryAfterMs ?? 0) / 1000)}s`),
            { statusCode: 429 }
        );
    }

    const job: AgentJob = {
        jobId: randomUUID(),
        tenantId,
        sessionId,
        message,
    };

    logger.worker('Worker', `Job submitted [${job.jobId}] tenant=${tenantId} | session=${sessionId}`);
    agentEvents.emit('worker:job:submitted', { jobId: job.jobId, tenantId, message });

    if (activeJobs < MAX_CONCURRENT_JOBS) {
        return executeJob(job);
    }

    logger.warn('Worker', `At capacity (${activeJobs}/${MAX_CONCURRENT_JOBS}) — queuing job [${job.jobId}]`);
    return new Promise<AgentJobResult>((resolve, reject) => {
        pendingQueue.push({ job, resolve, reject });
    });
}

export async function drainWorker(): Promise<void> {
    if (activeJobs === 0 && pendingQueue.length === 0) return;

    logger.worker('Worker', `Draining ${activeJobs} active + ${pendingQueue.length} queued jobs…`);

    pendingQueue.splice(0).forEach(({ reject }) =>
        reject(new Error('Worker shutdown — job cancelled'))
    );

    while (activeJobs > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.worker('Worker', 'All jobs drained. Worker idle.');
}
