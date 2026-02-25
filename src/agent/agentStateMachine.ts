import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export type AgentState =
    | 'IDLE'
    | 'LISTENING'
    | 'PROCESSING'
    | 'STREAMING'
    | 'WAITING_FOR_TOOL'
    | 'INTERRUPTED'
    | 'COMPLETED'
    | 'SPEAKING';

const TRANSITIONS: Record<AgentState, AgentState[]> = {
    IDLE: ['LISTENING'],
    LISTENING: ['PROCESSING', 'INTERRUPTED'],
    PROCESSING: ['STREAMING', 'WAITING_FOR_TOOL', 'INTERRUPTED'],
    STREAMING: ['WAITING_FOR_TOOL', 'COMPLETED', 'INTERRUPTED'],
    WAITING_FOR_TOOL: ['STREAMING', 'INTERRUPTED'],
    INTERRUPTED: ['LISTENING', 'IDLE'],
    COMPLETED: ['IDLE', 'LISTENING', 'SPEAKING'],
    SPEAKING: ['IDLE', 'INTERRUPTED'],
};

export class AgentStateMachine extends EventEmitter {
    private _state: AgentState = 'IDLE';
    private readonly sessionId: string;

    constructor(sessionId: string) {
        super();
        this.sessionId = sessionId;
        logger.debug('StateMachine', `Initialized — session=${sessionId} | state=IDLE`);
    }

    get state(): AgentState {
        return this._state;
    }

    setState(next: AgentState): void {
        if (this._state === next) return;

        const allowed = TRANSITIONS[this._state];
        if (!allowed.includes(next)) {
            throw new Error(
                `[StateMachine] Illegal transition: ${this._state} → ${next} (session=${this.sessionId})`
            );
        }

        const prev = this._state;
        this._state = next;

        logger.debug(
            'StateMachine',
            `Transition: ${prev} → ${next} | session=${this.sessionId}`
        );

        this.emit('state:changed', { sessionId: this.sessionId, from: prev, to: next });
        this.emit(`state:${next.toLowerCase()}`, { sessionId: this.sessionId, from: prev });
    }

    forceState(next: AgentState): void {
        const prev = this._state;
        this._state = next;
        logger.warn('StateMachine', `Force state: ${prev} → ${next} | session=${this.sessionId}`);
        this.emit('state:changed', { sessionId: this.sessionId, from: prev, to: next, forced: true });
    }

    is(state: AgentState): boolean {
        return this._state === state;
    }

    isOneOf(...states: AgentState[]): boolean {
        return states.includes(this._state);
    }
}
