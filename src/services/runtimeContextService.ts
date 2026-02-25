import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { getTenantById } from './tenantService';
import { getSituation } from '../agent/situations';
import type { SessionState } from './sessionService';
import { logger } from '../utils/logger';

export interface RuntimeContext {
    system: string;
    messages: ChatCompletionMessageParam[];
}

export async function buildRuntimeContext(
    tenantId: string,
    userMessage: string,
    session: SessionState
): Promise<RuntimeContext> {
    const tenant = await getTenantById(tenantId);
    if (!tenant) {
        throw new Error(`Tenant "${tenantId}" not found`);
    }

    const situation = getSituation(session.situation);

    const systemParts: string[] = [
        tenant.system_prompt,
        '',
        '— Situation Context —',
        `Current Situation : ${situation.name}`,
        '',
        situation.systemPrompt,
        '',
        '— Runtime Context —',
        `Tenant  : ${tenant.name}`,
        `Date    : ${new Date().toISOString().split('T')[0]}`,
        `Time UTC: ${new Date().toUTCString()}`,
    ];

    const system = systemParts.join('\n');

    const historyMessages: ChatCompletionMessageParam[] = session.history.map((entry) => ({
        role: entry.role,
        content: entry.content,
    }));

    const messages: ChatCompletionMessageParam[] = [
        ...historyMessages,
        { role: 'user', content: userMessage },
    ];

    logger.debug(
        'RuntimeContext',
        `Built context — tenant=${tenant.name} | situation=${situation.name} | history=${historyMessages.length} msgs`
    );

    return { system, messages };
}
