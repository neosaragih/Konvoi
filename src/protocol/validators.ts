import {
  DEFAULT_ROOM_CAPACITY,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_ICE_CANDIDATE_LENGTH,
  MAX_ROOM_NAME_LENGTH,
  MAX_SDP_LENGTH,
  PIN_LENGTH,
  PROTOCOL_VERSION,
} from './protocolVersion';
import type {
  ClientMessage,
  JoinRejectReason,
  Participant,
  ParticipantLeftReason,
  ServerMessage,
  SharedLocation,
  VoiceParticipant,
  VoiceSignal,
} from './messageTypes';

export interface ValidationError {
  code: string;
  message: string;
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ValidationError };

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{0,64}$/;
const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;
const PIN_PATTERN = new RegExp(`^\\d{${PIN_LENGTH}}$`);
// eslint-disable-next-line no-control-regex -- reject control characters
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

const JOIN_REJECT_REASONS: readonly JoinRejectReason[] = [
  'WRONG_PIN',
  'ROOM_FULL',
  'ROOM_CLOSED',
  'INCOMPATIBLE_PROTOCOL',
  'INVALID_REQUEST',
  'RATE_LIMITED',
];

const PARTICIPANT_LEFT_REASONS: readonly ParticipantLeftReason[] = [
  'LEFT',
  'KICKED',
  'TIMEOUT',
];

function ok<T>(value: T): ParseResult<T> {
  return { ok: true, value };
}

function fail<T>(code: string, message: string): ParseResult<T> {
  return { ok: false, error: { code, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIntInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function readRoomId(
  value: unknown,
  allowEmpty: boolean = false,
): ParseResult<string> {
  if (typeof value !== 'string' || !ROOM_ID_PATTERN.test(value)) {
    return fail('INVALID_ROOM_ID', 'roomId must be 1-64 URL-safe characters');
  }
  if (!allowEmpty && value.length === 0) {
    return fail('INVALID_ROOM_ID', 'roomId must be 1-64 URL-safe characters');
  }
  return ok(value);
}

function readId(value: unknown, field: string): ParseResult<string> {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    return fail('INVALID_ID', `${field} must be 1-64 safe characters`);
  }
  return ok(value);
}

function readDisplayName(value: unknown): ParseResult<string> {
  if (typeof value !== 'string') {
    return fail('INVALID_DISPLAY_NAME', 'displayName must be a string');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    return fail(
      'INVALID_DISPLAY_NAME',
      `displayName must be 1-${MAX_DISPLAY_NAME_LENGTH} characters`,
    );
  }
  if (CONTROL_CHARS.test(trimmed)) {
    return fail(
      'INVALID_DISPLAY_NAME',
      'displayName contains control characters',
    );
  }
  return ok(trimmed);
}

function readRoomName(value: unknown): ParseResult<string> {
  if (typeof value !== 'string') {
    return fail('INVALID_ROOM_NAME', 'roomName must be a string');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_ROOM_NAME_LENGTH) {
    return fail(
      'INVALID_ROOM_NAME',
      `roomName must be 1-${MAX_ROOM_NAME_LENGTH} characters`,
    );
  }
  if (CONTROL_CHARS.test(trimmed)) {
    return fail('INVALID_ROOM_NAME', 'roomName contains control characters');
  }
  return ok(trimmed);
}

function readPin(value: unknown): ParseResult<string> {
  if (typeof value !== 'string' || !PIN_PATTERN.test(value)) {
    return fail('INVALID_PIN', `pin must be exactly ${PIN_LENGTH} digits`);
  }
  return ok(value);
}

function readBoolean(value: unknown, field: string): ParseResult<boolean> {
  if (typeof value !== 'boolean') {
    return fail('INVALID_BOOLEAN', `${field} must be a boolean`);
  }
  return ok(value);
}

function readNonce(value: unknown): ParseResult<string | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) {
    return fail('INVALID_NONCE', 'nonce must be 1-64 characters');
  }
  return ok(value);
}

function readLocation(value: unknown): ParseResult<SharedLocation> {
  if (!isRecord(value)) {
    return fail('INVALID_LOCATION', 'location must be an object');
  }

  const { lat, lon, accuracy, capturedAt, heading, speed } = value;

  if (!isFiniteNumber(lat) || lat < -90 || lat > 90) {
    return fail('INVALID_LOCATION', 'latitude must be between -90 and 90');
  }
  if (!isFiniteNumber(lon) || lon < -180 || lon > 180) {
    return fail('INVALID_LOCATION', 'longitude must be between -180 and 180');
  }
  if (!isFiniteNumber(accuracy) || accuracy < 0 || accuracy > 100_000) {
    return fail('INVALID_LOCATION', 'accuracy must be between 0 and 100000 m');
  }
  if (!isFiniteNumber(capturedAt) || capturedAt <= 0) {
    return fail('INVALID_LOCATION', 'capturedAt must be a positive timestamp');
  }

  let normalizedHeading: number | undefined;
  if (heading !== undefined) {
    if (!isFiniteNumber(heading) || heading < 0 || heading > 360) {
      return fail('INVALID_LOCATION', 'heading must be between 0 and 360');
    }
    normalizedHeading = heading;
  }

  let normalizedSpeed: number | undefined;
  if (speed !== undefined) {
    if (!isFiniteNumber(speed) || speed < 0 || speed > 300) {
      return fail('INVALID_LOCATION', 'speed must be between 0 and 300 m/s');
    }
    normalizedSpeed = speed;
  }

  return ok({
    lat,
    lon,
    accuracy,
    capturedAt,
    ...(normalizedHeading !== undefined ? { heading: normalizedHeading } : {}),
    ...(normalizedSpeed !== undefined ? { speed: normalizedSpeed } : {}),
  });
}

function readVoiceSignal(value: unknown): ParseResult<VoiceSignal> {
  if (!isRecord(value)) {
    return fail('INVALID_SIGNAL', 'signal must be an object');
  }

  if (value.kind === 'offer' || value.kind === 'answer') {
    if (
      typeof value.sdp !== 'string' ||
      value.sdp.length === 0 ||
      value.sdp.length > MAX_SDP_LENGTH
    ) {
      return fail(
        'INVALID_SIGNAL',
        `sdp must be 1-${MAX_SDP_LENGTH} characters`,
      );
    }
    return ok({ kind: value.kind, sdp: value.sdp });
  }

  if (value.kind === 'ice-candidate') {
    if (
      typeof value.candidate !== 'string' ||
      value.candidate.length === 0 ||
      value.candidate.length > MAX_ICE_CANDIDATE_LENGTH
    ) {
      return fail(
        'INVALID_SIGNAL',
        `candidate must be 1-${MAX_ICE_CANDIDATE_LENGTH} characters`,
      );
    }

    const sdpMid = value.sdpMid;
    let normalizedSdpMid: string | null = null;
    if (sdpMid !== undefined && sdpMid !== null) {
      if (typeof sdpMid !== 'string' || sdpMid.length > 64) {
        return fail('INVALID_SIGNAL', 'sdpMid must be a short string or null');
      }
      normalizedSdpMid = sdpMid;
    }

    const sdpMLineIndex = value.sdpMLineIndex;
    let normalizedSdpMLineIndex: number | null = null;
    if (sdpMLineIndex !== undefined && sdpMLineIndex !== null) {
      if (!isIntInRange(sdpMLineIndex, 0, 65_535)) {
        return fail(
          'INVALID_SIGNAL',
          'sdpMLineIndex must be an integer or null',
        );
      }
      normalizedSdpMLineIndex = sdpMLineIndex;
    }

    return ok({
      kind: 'ice-candidate',
      candidate: value.candidate,
      sdpMid: normalizedSdpMid,
      sdpMLineIndex: normalizedSdpMLineIndex,
    });
  }

  return fail('INVALID_SIGNAL', 'unknown signal kind');
}

function readParticipant(value: unknown): ParseResult<Participant> {
  if (!isRecord(value)) {
    return fail('INVALID_PARTICIPANT', 'participant must be an object');
  }
  const id = readId(value.id, 'participant.id');
  if (!id.ok) {
    return id;
  }
  const displayName = readDisplayName(value.displayName);
  if (!displayName.ok) {
    return displayName;
  }
  const joinedAt = value.joinedAt;
  if (!isFiniteNumber(joinedAt) || joinedAt <= 0) {
    return fail('INVALID_PARTICIPANT', 'participant.joinedAt is invalid');
  }
  return ok({
    id: id.value,
    displayName: displayName.value,
    joinedAt,
  });
}

function readVoiceParticipant(value: unknown): ParseResult<VoiceParticipant> {
  if (!isRecord(value)) {
    return fail(
      'INVALID_VOICE_PARTICIPANT',
      'voice participant must be an object',
    );
  }
  const participantId = readId(
    value.participantId,
    'voiceParticipant.participantId',
  );
  if (!participantId.ok) {
    return participantId;
  }
  const muted = readBoolean(value.muted, 'voiceParticipant.muted');
  if (!muted.ok) {
    return muted;
  }
  return ok({ participantId: participantId.value, muted: muted.value });
}

function readArray<T>(
  value: unknown,
  field: string,
  max: number,
  item: (entry: unknown) => ParseResult<T>,
): ParseResult<T[]> {
  if (!Array.isArray(value)) {
    return fail('INVALID_ARRAY', `${field} must be an array`);
  }
  if (value.length > max) {
    return fail('INVALID_ARRAY', `${field} exceeds ${max} entries`);
  }
  const result: T[] = [];
  for (const entry of value) {
    const parsed = item(entry);
    if (!parsed.ok) {
      return parsed;
    }
    result.push(parsed.value);
  }
  return ok(result);
}

interface Envelope {
  type: string;
  protocolVersion: number;
  roomId: string;
  raw: Record<string, unknown>;
}

function readEnvelope(
  value: unknown,
  requireCurrentVersion: boolean,
  allowEmptyRoomId: boolean = false,
): ParseResult<Envelope> {
  if (!isRecord(value)) {
    return fail('INVALID_MESSAGE', 'message must be a JSON object');
  }
  if (typeof value.type !== 'string' || value.type.length === 0) {
    return fail('INVALID_TYPE', 'message.type must be a non-empty string');
  }
  const protocolVersion = value.protocolVersion;
  if (
    typeof protocolVersion !== 'number' ||
    !Number.isInteger(protocolVersion) ||
    protocolVersion < 1
  ) {
    return fail(
      'INVALID_PROTOCOL_VERSION',
      'protocolVersion must be a positive integer',
    );
  }
  if (requireCurrentVersion && protocolVersion !== PROTOCOL_VERSION) {
    return fail(
      'INCOMPATIBLE_PROTOCOL',
      `protocolVersion ${PROTOCOL_VERSION} required`,
    );
  }
  const roomId = readRoomId(value.roomId, allowEmptyRoomId);
  if (!roomId.ok) {
    return roomId;
  }
  return ok({
    type: value.type,
    protocolVersion,
    roomId: roomId.value,
    raw: value,
  });
}

/**
 * Parse and validate a client -> host message.
 *
 * Protocol version is checked by the engine (not here) so that a mismatched
 * JOIN_REQUEST can be answered with JOIN_REJECTED instead of being dropped.
 */
export function parseClientMessage(value: unknown): ParseResult<ClientMessage> {
  const envelope = readEnvelope(value, false, true);
  if (!envelope.ok) {
    return envelope;
  }
  const { type, protocolVersion, roomId, raw } = envelope.value;

  if (type !== 'JOIN_REQUEST' && roomId.length === 0) {
    return fail('INVALID_ROOM_ID', 'roomId is required for this message');
  }

  switch (type) {
    case 'JOIN_REQUEST': {
      const clientMessageId = readId(raw.clientMessageId, 'clientMessageId');
      if (!clientMessageId.ok) {
        return clientMessageId;
      }
      const displayName = readDisplayName(raw.displayName);
      if (!displayName.ok) {
        return displayName;
      }
      const pin = readPin(raw.pin);
      if (!pin.ok) {
        return pin;
      }
      return ok({
        type,
        protocolVersion,
        roomId,
        clientMessageId: clientMessageId.value,
        displayName: displayName.value,
        pin: pin.value,
      });
    }

    case 'LEAVE_ROOM':
      return ok({ type, protocolVersion, roomId });

    case 'PING': {
      const nonce = readNonce(raw.nonce);
      if (!nonce.ok) {
        return nonce;
      }
      return ok({
        type,
        protocolVersion,
        roomId,
        ...(nonce.value !== undefined ? { nonce: nonce.value } : {}),
      });
    }

    case 'VOICE_JOIN':
    case 'VOICE_LEAVE':
      return ok({ type, protocolVersion, roomId });

    case 'VOICE_MUTE_STATUS': {
      const muted = readBoolean(raw.muted, 'muted');
      if (!muted.ok) {
        return muted;
      }
      return ok({ type, protocolVersion, roomId, muted: muted.value });
    }

    case 'VOICE_SIGNAL': {
      const targetId = readId(raw.targetId, 'targetId');
      if (!targetId.ok) {
        return targetId;
      }
      const signal = readVoiceSignal(raw.signal);
      if (!signal.ok) {
        return signal;
      }
      return ok({
        type,
        protocolVersion,
        roomId,
        targetId: targetId.value,
        signal: signal.value,
      });
    }

    case 'LOCATION_SHARING_STATUS': {
      const sharing = readBoolean(raw.sharing, 'sharing');
      if (!sharing.ok) {
        return sharing;
      }
      return ok({ type, protocolVersion, roomId, sharing: sharing.value });
    }

    case 'LOCATION_UPDATE': {
      const location = readLocation(raw.location);
      if (!location.ok) {
        return location;
      }
      return ok({ type, protocolVersion, roomId, location: location.value });
    }

    case 'LOCATION_SHARING_STOP':
      return ok({ type, protocolVersion, roomId });

    default:
      return fail('UNKNOWN_TYPE', `unsupported message type: ${type}`);
  }
}

function readJoinRejectReason(value: unknown): ParseResult<JoinRejectReason> {
  if (
    typeof value !== 'string' ||
    !JOIN_REJECT_REASONS.includes(value as JoinRejectReason)
  ) {
    return fail('INVALID_REASON', 'unknown join rejection reason');
  }
  return ok(value as JoinRejectReason);
}

function readParticipantLeftReason(
  value: unknown,
): ParseResult<ParticipantLeftReason> {
  if (
    typeof value !== 'string' ||
    !PARTICIPANT_LEFT_REASONS.includes(value as ParticipantLeftReason)
  ) {
    return fail('INVALID_REASON', 'unknown participant-left reason');
  }
  return ok(value as ParticipantLeftReason);
}

function readShortText(
  value: unknown,
  field: string,
  max: number,
): ParseResult<string> {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    return fail('INVALID_TEXT', `${field} must be 1-${max} characters`);
  }
  if (CONTROL_CHARS.test(value)) {
    return fail('INVALID_TEXT', `${field} contains control characters`);
  }
  return ok(value);
}

/** Parse and validate a host -> client message on the receiving device. */
export function parseServerMessage(value: unknown): ParseResult<ServerMessage> {
  const envelope = readEnvelope(value, true);
  if (!envelope.ok) {
    return envelope;
  }
  const { type, protocolVersion, roomId, raw } = envelope.value;

  const timestamp = raw.timestamp;
  if (!isFiniteNumber(timestamp) || timestamp <= 0) {
    return fail('INVALID_TIMESTAMP', 'timestamp must be positive');
  }

  switch (type) {
    case 'JOIN_ACCEPTED': {
      const selfId = readId(raw.selfId, 'selfId');
      if (!selfId.ok) {
        return selfId;
      }
      const hostId = readId(raw.hostId, 'hostId');
      if (!hostId.ok) {
        return hostId;
      }
      const roomName = readRoomName(raw.roomName);
      if (!roomName.ok) {
        return roomName;
      }
      if (!isIntInRange(raw.voiceCapacity, 1, DEFAULT_ROOM_CAPACITY)) {
        return fail('INVALID_CAPACITY', 'voiceCapacity is invalid');
      }
      const participants = readArray(
        raw.participants,
        'participants',
        DEFAULT_ROOM_CAPACITY,
        readParticipant,
      );
      if (!participants.ok) {
        return participants;
      }
      const voiceParticipants = readArray(
        raw.voiceParticipants,
        'voiceParticipants',
        DEFAULT_ROOM_CAPACITY,
        readVoiceParticipant,
      );
      if (!voiceParticipants.ok) {
        return voiceParticipants;
      }
      return ok({
        type,
        protocolVersion,
        roomId,
        timestamp,
        selfId: selfId.value,
        hostId: hostId.value,
        roomName: roomName.value,
        voiceCapacity: raw.voiceCapacity,
        participants: participants.value,
        voiceParticipants: voiceParticipants.value,
      });
    }

    case 'JOIN_REJECTED': {
      const reason = readJoinRejectReason(raw.reason);
      if (!reason.ok) {
        return reason;
      }
      const message = readShortText(raw.message, 'message', 200);
      if (!message.ok) {
        return message;
      }
      return ok({
        type,
        protocolVersion,
        roomId,
        timestamp,
        reason: reason.value,
        message: message.value,
      });
    }

    case 'PARTICIPANT_JOINED': {
      const participant = readParticipant(raw.participant);
      if (!participant.ok) {
        return participant;
      }
      return ok({
        type,
        protocolVersion,
        roomId,
        timestamp,
        participant: participant.value,
      });
    }

    case 'PARTICIPANT_LEFT': {
      const participantId = readId(raw.participantId, 'participantId');
      if (!participantId.ok) {
        return participantId;
      }
      const reason = readParticipantLeftReason(raw.reason);
      if (!reason.ok) {
        return reason;
      }
      return ok({
        type,
        protocolVersion,
        roomId,
        timestamp,
        participantId: participantId.value,
        reason: reason.value,
      });
    }

    case 'ROOM_STATE': {
      const participants = readArray(
        raw.participants,
        'participants',
        DEFAULT_ROOM_CAPACITY,
        readParticipant,
      );
      if (!participants.ok) {
        return participants;
      }
      const voiceParticipants = readArray(
        raw.voiceParticipants,
        'voiceParticipants',
        DEFAULT_ROOM_CAPACITY,
        readVoiceParticipant,
      );
      if (!voiceParticipants.ok) {
        return voiceParticipants;
      }
      return ok({
        type,
        protocolVersion,
        roomId,
        timestamp,
        participants: participants.value,
        voiceParticipants: voiceParticipants.value,
      });
    }

    case 'ROOM_CLOSED': {
      const reason = readShortText(raw.reason, 'reason', 200);
      if (!reason.ok) {
        return reason;
      }
      return ok({
        type,
        protocolVersion,
        roomId,
        timestamp,
        reason: reason.value,
      });
    }

    case 'KICK_PARTICIPANT': {
      const reason = readShortText(raw.reason, 'reason', 200);
      if (!reason.ok) {
        return reason;
      }
      return ok({
        type,
        protocolVersion,
        roomId,
        timestamp,
        reason: reason.value,
      });
    }

    case 'VOICE_PARTICIPANT_STATE': {
      const participant = readVoiceParticipant(raw.participant);
      if (!participant.ok) {
        return participant;
      }
      const joined = readBoolean(raw.joined, 'joined');
      if (!joined.ok) {
        return joined;
      }
      return ok({
        type,
        protocolVersion,
        roomId,
        timestamp,
        participant: participant.value,
        joined: joined.value,
      });
    }

    case 'VOICE_MUTE_STATUS': {
      const participantId = readId(raw.participantId, 'participantId');
      if (!participantId.ok) {
        return participantId;
      }
      const muted = readBoolean(raw.muted, 'muted');
      if (!muted.ok) {
        return muted;
      }
      return ok({
        type,
        protocolVersion,
        roomId,
        timestamp,
        participantId: participantId.value,
        muted: muted.value,
      });
    }

    case 'VOICE_SIGNAL': {
      const fromId = readId(raw.fromId, 'fromId');
      if (!fromId.ok) {
        return fromId;
      }
      const signal = readVoiceSignal(raw.signal);
      if (!signal.ok) {
        return signal;
      }
      return ok({
        type,
        protocolVersion,
        roomId,
        timestamp,
        fromId: fromId.value,
        signal: signal.value,
      });
    }

    case 'LOCATION_SHARING_STATUS': {
      const participantId = readId(raw.participantId, 'participantId');
      if (!participantId.ok) {
        return participantId;
      }
      const sharing = readBoolean(raw.sharing, 'sharing');
      if (!sharing.ok) {
        return sharing;
      }
      return ok({
        type,
        protocolVersion,
        roomId,
        timestamp,
        participantId: participantId.value,
        sharing: sharing.value,
      });
    }

    case 'LOCATION_UPDATE': {
      const participantId = readId(raw.participantId, 'participantId');
      if (!participantId.ok) {
        return participantId;
      }
      const location = readLocation(raw.location);
      if (!location.ok) {
        return location;
      }
      return ok({
        type,
        protocolVersion,
        roomId,
        timestamp,
        participantId: participantId.value,
        location: location.value,
      });
    }

    case 'LOCATION_SHARING_STOP': {
      const participantId = readId(raw.participantId, 'participantId');
      if (!participantId.ok) {
        return participantId;
      }
      return ok({
        type,
        protocolVersion,
        roomId,
        timestamp,
        participantId: participantId.value,
      });
    }

    case 'PONG': {
      const nonce = readNonce(raw.nonce);
      if (!nonce.ok) {
        return nonce;
      }
      return ok({
        type,
        protocolVersion,
        roomId,
        timestamp,
        ...(nonce.value !== undefined ? { nonce: nonce.value } : {}),
      });
    }

    case 'ERROR': {
      const code = readShortText(raw.code, 'code', 64);
      if (!code.ok) {
        return code;
      }
      const message = readShortText(raw.message, 'message', 200);
      if (!message.ok) {
        return message;
      }
      return ok({
        type,
        protocolVersion,
        roomId,
        timestamp,
        code: code.value,
        message: message.value,
      });
    }

    default:
      return fail('UNKNOWN_TYPE', `unsupported message type: ${type}`);
  }
}
