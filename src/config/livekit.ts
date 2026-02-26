import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { env } from './env';
import { logger } from '../utils/logger';

export interface LiveKitTokenOptions {
    roomName: string;
    participantIdentity: string;
    participantName?: string;
    metadata?: string;
    ttlSeconds?: number;
}

export async function createLiveKitToken(opts: LiveKitTokenOptions): Promise<string> {
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
        identity: opts.participantIdentity,
        name: opts.participantName ?? opts.participantIdentity,
        metadata: opts.metadata,
        ttl: opts.ttlSeconds ?? 3600,
    });

    at.addGrant({
        roomJoin: true,
        room: opts.roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishSources: [TrackSource.MICROPHONE],
    });

    const token = await at.toJwt();
    logger.debug('LiveKit', `Token created — room=${opts.roomName} | identity=${opts.participantIdentity}`);
    return token;
}

export function createRoomServiceClient(): RoomServiceClient {
    return new RoomServiceClient(env.LIVEKIT_HOST, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
}

export async function listRoomParticipants(roomName: string): Promise<string[]> {
    try {
        const client = createRoomServiceClient();
        const participants = await client.listParticipants(roomName);
        return participants.map((p) => p.identity);
    } catch (err) {
        logger.warn('LiveKit', `Could not list participants for room=${roomName}: ${String(err)}`);
        return [];
    }
}

export async function removeParticipantFromRoom(roomName: string, identity: string): Promise<void> {
    try {
        const client = createRoomServiceClient();
        await client.removeParticipant(roomName, identity);
        logger.info('LiveKit', `Removed participant=${identity} from room=${roomName}`);
    } catch (err) {
        logger.warn('LiveKit', `Could not remove participant=${identity}: ${String(err)}`);
    }
}
