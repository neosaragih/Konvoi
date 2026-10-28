import type {
  JoinRejectReason,
  Participant,
  ServerMessage,
  SharedLocation,
  VoiceParticipant,
} from '../../protocol/messageTypes';
import { LOCATION_STALE_AFTER_MS } from '../../protocol/protocolVersion';

export type ClientRoomStatus =
  | 'idle'
  | 'joining'
  | 'joined'
  | 'rejected'
  | 'kicked'
  | 'closed'
  | 'disconnected';

export interface LocationEntry {
  location: SharedLocation;
  /** Local receive time, used for staleness because device clocks can differ. */
  receivedAt: number;
}

export interface ClientRoomState {
  status: ClientRoomStatus;
  roomId: string;
  roomName: string | null;
  selfId: string | null;
  hostId: string | null;
  voiceCapacity: number;
  participants: Participant[];
  voiceParticipants: VoiceParticipant[];
  /** Last known sharing flag per participant, including self. */
  locationSharing: Record<string, boolean>;
  locations: Record<string, LocationEntry>;
  rejection: { reason: JoinRejectReason; message: string } | null;
  closedReason: string | null;
  error: { code: string; message: string } | null;
}

export function createInitialClientRoomState(roomId: string): ClientRoomState {
  return {
    status: 'idle',
    roomId,
    roomName: null,
    selfId: null,
    hostId: null,
    voiceCapacity: 0,
    participants: [],
    voiceParticipants: [],
    locationSharing: {},
    locations: {},
    rejection: null,
    closedReason: null,
    error: null,
  };
}

/** Apply one validated host message to the client-side room snapshot. */
export function reduceServerMessage(
  state: ClientRoomState,
  message: ServerMessage,
  receivedAt: number = Date.now(),
): ClientRoomState {
  switch (message.type) {
    case 'JOIN_ACCEPTED':
      return {
        ...state,
        status: 'joined',
        roomId: message.roomId,
        roomName: message.roomName,
        selfId: message.selfId,
        hostId: message.hostId,
        voiceCapacity: message.voiceCapacity,
        participants: message.participants,
        voiceParticipants: message.voiceParticipants,
        locationSharing: {},
        locations: {},
        rejection: null,
        closedReason: null,
        error: null,
      };

    case 'JOIN_REJECTED':
      return {
        ...state,
        status: 'rejected',
        rejection: { reason: message.reason, message: message.message },
      };

    case 'PARTICIPANT_JOINED': {
      const participants = state.participants.filter(
        participant => participant.id !== message.participant.id,
      );
      participants.push(message.participant);
      return { ...state, participants };
    }

    case 'PARTICIPANT_LEFT':
      return {
        ...state,
        participants: state.participants.filter(
          participant => participant.id !== message.participantId,
        ),
        voiceParticipants: state.voiceParticipants.filter(
          participant => participant.participantId !== message.participantId,
        ),
        locations: withoutKey(state.locations, message.participantId),
        locationSharing: withoutKey(
          state.locationSharing,
          message.participantId,
        ),
      };

    case 'ROOM_STATE': {
      const present = new Set(
        message.participants.map(participant => participant.id),
      );
      const locations: Record<string, LocationEntry> = {};
      for (const [participantId, entry] of Object.entries(state.locations)) {
        if (present.has(participantId)) {
          locations[participantId] = entry;
        }
      }
      return {
        ...state,
        participants: message.participants,
        voiceParticipants: message.voiceParticipants,
        locations,
      };
    }

    case 'ROOM_CLOSED':
      return {
        ...state,
        status: 'closed',
        closedReason: message.reason,
        participants: [],
        voiceParticipants: [],
        locations: {},
        locationSharing: {},
      };

    case 'KICK_PARTICIPANT':
      return {
        ...state,
        status: 'kicked',
        closedReason: message.reason,
        participants: [],
        voiceParticipants: [],
        locations: {},
        locationSharing: {},
      };

    case 'VOICE_PARTICIPANT_STATE': {
      if (!message.joined) {
        return {
          ...state,
          voiceParticipants: state.voiceParticipants.filter(
            participant =>
              participant.participantId !== message.participant.participantId,
          ),
        };
      }
      const voiceParticipants = state.voiceParticipants.filter(
        participant =>
          participant.participantId !== message.participant.participantId,
      );
      voiceParticipants.push(message.participant);
      return { ...state, voiceParticipants };
    }

    case 'VOICE_MUTE_STATUS':
      return {
        ...state,
        voiceParticipants: state.voiceParticipants.map(participant =>
          participant.participantId === message.participantId
            ? { ...participant, muted: message.muted }
            : participant,
        ),
      };

    case 'LOCATION_SHARING_STATUS': {
      const locationSharing = {
        ...state.locationSharing,
        [message.participantId]: message.sharing,
      };
      return {
        ...state,
        locationSharing,
        locations: message.sharing
          ? state.locations
          : withoutKey(state.locations, message.participantId),
      };
    }

    case 'LOCATION_UPDATE':
      return {
        ...state,
        locationSharing: {
          ...state.locationSharing,
          [message.participantId]: true,
        },
        locations: {
          ...state.locations,
          [message.participantId]: {
            location: message.location,
            receivedAt,
          },
        },
      };

    case 'LOCATION_SHARING_STOP':
      return {
        ...state,
        locations: withoutKey(state.locations, message.participantId),
        locationSharing: {
          ...state.locationSharing,
          [message.participantId]: false,
        },
      };

    case 'ERROR':
      return {
        ...state,
        error: { code: message.code, message: message.message },
      };

    case 'VOICE_SIGNAL':
    case 'PONG':
      return state;
  }
}

export function isLocationStale(
  entry: LocationEntry,
  now: number = Date.now(),
  thresholdMs: number = LOCATION_STALE_AFTER_MS,
): boolean {
  return now - entry.receivedAt > thresholdMs;
}

function withoutKey<T>(
  record: Record<string, T>,
  key: string,
): Record<string, T> {
  if (!(key in record)) {
    return record;
  }
  const next = { ...record };
  delete next[key];
  return next;
}
