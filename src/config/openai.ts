import OpenAI from 'openai';
import { env } from './env';

export const DEFAULT_CHAT_MODEL = 'gpt-4o-mini' as const;
export const AGENT_TEMPERATURE = 0.3 as const;

export const openaiClient = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    timeout: 30_000,
    maxRetries: 2,
});

export async function quickChat(
    systemPrompt: string,
    userMessage: string,
    model = DEFAULT_CHAT_MODEL
): Promise<string> {
    const resp = await openaiClient.chat.completions.create({
        model,
        temperature: AGENT_TEMPERATURE,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
        ],
    });
    return resp.choices[0].message.content ?? '';
}
