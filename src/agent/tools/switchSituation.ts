import { z } from 'zod';
import { isValidSituation, SituationName } from '../situations';

export const SwitchSituationSchema = z.object({
    newSituation: z.string().min(1, 'newSituation is required'),
});

export type SwitchSituationInput = z.infer<typeof SwitchSituationSchema>;

export const SWITCH_SITUATION_RESULT_KEY = '__situationSwitch__';

export async function handleSwitchSituation(
    args: SwitchSituationInput,
    onSwitch: (newSituation: SituationName) => Promise<void>
): Promise<Record<string, unknown>> {
    const { newSituation } = args;

    if (!isValidSituation(newSituation)) {
        return {
            success: false,
            message: `Unknown situation: "${newSituation}". Valid values: introduction, resident, prospect.`,
        };
    }

    await onSwitch(newSituation);

    return {
        success: true,
        [SWITCH_SITUATION_RESULT_KEY]: newSituation,
        message: `Situation switched to "${newSituation}".`,
    };
}

export const switchSituationDefinition = {
    type: 'function' as const,
    function: {
        name: 'switch_situation',
        description:
            'Switch the conversation to a different situation (e.g. from introduction to resident or prospect). Call this when the caller identifies themselves.',
        parameters: {
            type: 'object',
            properties: {
                newSituation: {
                    type: 'string',
                    enum: ['introduction', 'resident', 'prospect'],
                    description: 'The situation to switch to',
                },
            },
            required: ['newSituation'],
        },
    },
};
