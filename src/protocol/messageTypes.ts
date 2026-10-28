/**
 * Typed wire contracts. There is intentionally no chat message type: Konvoi is
 * voice-first and text chat is out of scope for this release.
 */

export type ParticipantId = string;

export interface Participant {
  id: ParticipantId;
  displayName: string;
  joinedAt: number;
}

/**
 * Voice membership as known by the host. Per-peer connection quality is local
 * to each device and is not reported here (the host cannot observe the P2P path).
 */
export interface VoiceParticipant {
  participantId: ParticipantId;
  muted: boolean;
}

export type VoiceSignal =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | {
      kind: 'ice-candidate';
      candidate: string;
      sdpMid: string | null;
      sdpMLineIndex: number | null;
    };

export interface SharedLocation {
  lat: number;
  lon: number;
  accuracy: number;
  /** Device clock at capture, epoch milliseconds. */
  capturedAt: number;
  heading?: number;
  speed?: number;
}

export type JoinRejectReason =
  | 'WRONG_PIN'
  | 'ROOM_FULL'
  | 'ROOM_CLOSED'
  | 'INCOMPATIBLE_PROTOCOL'
  | 'INVALID_REQUEST'
  | 'RATE_LIMITED';

export type ParticipantLeftReason = 'LEFT' | 'KICKED' | 'TIMEOUT';

interface ClientEnvelope {
  protocolVersion: number;
  roomId: string;
}

export type JoinRequestMessage = ClientEnvelope & {
  type: 'JOIN_REQUEST';
  clientMessageId: string;
  displayName: string;
  pin: string;
};

export type ClientMessage =
  | JoinRequestMessage
  | (ClientEnvelope & { type: 'LEAVE_ROOM' })
  | (ClientEnvelope & { type: 'PING'; nonce?: string })
  | (ClientEnvelope & { type: 'VOICE_JOIN' })
  | (ClientEnvelope & { type: 'VOICE_LEAVE' })
  | (ClientEnvelope & { type: 'VOICE_MUTE_STATUS'; muted: boolean })
  | (ClientEnvelope & {
      type: 'VOICE_SIGNAL';
      targetId: ParticipantId;
      signal: VoiceSignal;
    })
  | (ClientEnvelope & { type: 'LOCATION_SHARING_STATUS'; sharing: boolean })
  | (ClientEnvelope & { type: 'LOCATION_UPDATE'; location: SharedLocation })
  | (ClientEnvelope & { type: 'LOCATION_SHARING_STOP' });

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/**
 * A client message without the envelope fields. Sessions fill in
 * protocolVersion and roomId so callers cannot send a mismatched room.
 */
export type ClientAction = DistributiveOmit<
  Exclude<ClientMessage, { type: 'JOIN_REQUEST' }>,
  'protocolVersion' | 'roomId'
>;

interface ServerEnvelope {
  protocolVersion: number;
  roomId: string;
  timestamp: number;
}

export type ServerMessage =
  | (ServerEnvelope & {
      type: 'JOIN_ACCEPTED';
      selfId: ParticipantId;
      hostId: ParticipantId;
      roomName: string;
      voiceCapacity: number;
      participants: Participant[];
      voiceParticipants: VoiceParticipant[];
    })
  | (ServerEnvelope & {
      type: 'JOIN_REJECTED';
      reason: JoinRejectReason;
      message: string;
    })
  | (ServerEnvelope & {
      type: 'PARTICIPANT_JOINED';
      participant: Participant;
    })
  | (ServerEnvelope & {
      type: 'PARTICIPANT_LEFT';
      participantId: ParticipantId;
      reason: ParticipantLeftReason;
    })
  | (ServerEnvelope & {
      type: 'ROOM_STATE';
      participants: Participant[];
      voiceParticipants: VoiceParticipant[];
    })
  | (ServerEnvelope & { type: 'ROOM_CLOSED'; reason: string })
  | (ServerEnvelope & { type: 'KICK_PARTICIPANT'; reason: string })
  | (ServerEnvelope & {
      type: 'VOICE_PARTICIPANT_STATE';
      participant: VoiceParticipant;
      joined: boolean;
    })
  | (ServerEnvelope & {
      type: 'VOICE_MUTE_STATUS';
      participantId: ParticipantId;
      muted: boolean;
    })
  | (ServerEnvelope & {
      type: 'VOICE_SIGNAL';
      fromId: ParticipantId;
      signal: VoiceSignal;
    })
  | (ServerEnvelope & {
      type: 'LOCATION_SHARING_STATUS';
      participantId: ParticipantId;
      sharing: boolean;
    })
  | (ServerEnvelope & {
      type: 'LOCATION_UPDATE';
      participantId: ParticipantId;
      location: SharedLocation;
    })
  | (ServerEnvelope & {
      type: 'LOCATION_SHARING_STOP';
      participantId: ParticipantId;
    })
  | (ServerEnvelope & { type: 'PONG'; nonce?: string })
  | (ServerEnvelope & { type: 'ERROR'; code: string; message: string });
