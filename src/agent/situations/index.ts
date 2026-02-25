import { introductionSituation } from './introduction';
import { residentSituation } from './resident';
import { prospectSituation } from './prospect';

export type SituationName = 'introduction' | 'resident' | 'prospect';

export interface Situation {
    name: SituationName;
    systemPrompt: string;
    allowedTools: string[];
}

const situationMap = new Map<SituationName, Situation>([
    ['introduction', introductionSituation as Situation],
    ['resident', residentSituation as Situation],
    ['prospect', prospectSituation as Situation],
]);

export function getSituation(name: SituationName): Situation {
    const situation = situationMap.get(name);
    if (!situation) {
        throw new Error(`Unknown situation: "${name}"`);
    }
    return situation;
}

export function isValidSituation(name: string): name is SituationName {
    return situationMap.has(name as SituationName);
}
