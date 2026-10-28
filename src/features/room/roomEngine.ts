import {
  CONNECTION_TIMEOUT_MS,
  DEFAULT_ROOM_CAPACITY,
  DEFAULT_VOICE_CAPACITY,
  JOIN_ATTEMPTS_MAX,
  JOIN_ATTEMPTS_WINDOW_MS,
  LOCATION_MAX_AGE_MS,
  LOCATION_MIN_INTERVAL_MS,
  LOCATION_UPDATES_MAX_PER_WINDOW,
  PROTOCOL_VERSION,
  VOICE_SIGNAL_MAX_PER_WINDOW,
  VOICE_SIGNAL_WINDOW_MS,
} from '../../protocol/protocolVersion';
import type {
  ClientMessage,
  JoinRejectReason,
  JoinRequestMessage,
  Participant,
  ParticipantLeftReason,
  ServerMessage,
  SharedLocation,
  VoiceParticipant,
} from '../../protocol/messageTypes';
import { SlidingWindowRateLimiter } from '../../utils/rateLimiter';
import { timingSafeEqual } from '../../utils/safeEqual';

/**
 * The host UI is in-process, not a socket. It uses the same connection ID so
 * the engine can treat host and guests uniformly.
 */
export const HOST_CONNECTION_ID = '__host__';

export interface RoomEngineConfig {
  roomId: string;
  roomName: string;
  pin: string;
  hostDisplayName: string;
  hostId?: string;
  capacity?: number;
  voiceCapacity?: number;
}

export interface RoomEngineDeps {
  now?: () => number;
  generateParticipantId?: () => string;
}

export type EngineEvent =
  | { type: 'send'; to: string; message: ServerMessage }
  | { type: 'disconnect'; connectionId: string; reason: string }
  | { type: 'closed'; reason: string };

export interface RoomSnapshot {
  participants: Participant[];
  voiceParticipants: VoiceParticipant[];
  locations: Array<{ participantId: string; location: SharedLocation }>;
}

interface Member {
  connectionId: string;
  participant: Participant;
  lastSeen: number;
  voice: boolean;
  muted: boolean;
  sharing: boolean;
  location: SharedLocation | null;
  lastLocationAt: number;
  signalLimiter: SlidingWindowRateLimiter;
  locationLimiter: SlidingWindowRateLimiter;
}

/**
 * Host-authoritative room state machine: membership, voice roster, signaling
 * relay, and location sharing. Transport-agnostic and synchronous so it can be
 * unit-tested without sockets or WebRTC.
 *
 * Emitted events are applied by the caller: `send` writes a framed message to a
 * connection (skip `HOST_CONNECTION_ID` when writing sockets), `disconnect`
 * closes a socket, `closed` stops the server and advertising.
 */
export class RoomEngine {
  private readonly now: () => number;
  private readonly generateParticipantId: () => string;
  private readonly capacity: number;
  readonly voiceCapacity: number;
  private readonly hostId: string;

  private readonly members = new Map<string, Member>();
  private readonly byParticipantId = new Map<string, Member>();
  private readonly joinAttempts = new Map<string, SlidingWindowRateLimiter>();

  private closed = false;
  private idCounter = 0;

  constructor(
    private readonly config: RoomEngineConfig,
    deps: RoomEngineDeps = {},
  ) {
    this.now = deps.now ?? Date.now;
    this.capacity = Math.max(1, config.capacity ?? DEFAULT_ROOM_CAPACITY);
    this.voiceCapacity = Math.min(
      this.capacity,
      Math.max(1, config.voiceCapacity ?? DEFAULT_VOICE_CAPACITY),
    );
    this.hostId = config.hostId ?? 'host';
    this.generateParticipantId =
      deps.generateParticipantId ??
      (() => `p${++this.idCounter}-${Math.random().toString(36).slice(2, 8)}`);

    const host = this.createMember(HOST_CONNECTION_ID, {
      id: this.hostId,
      displayName: config.hostDisplayName,
      joinedAt: this.now(),
    });
    this.members.set(HOST_CONNECTION_ID, host);
    this.byParticipantId.set(host.participant.id, host);
  }

  get roomId(): string {
    return this.config.roomId;
  }

  get roomName(): string {
    return this.config.roomName;
  }

  get hostParticipantId(): string {
    return this.hostId;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  isHostConnection(connectionId: string): boolean {
    return connectionId === HOST_CONNECTION_ID;
  }

  getSnapshot(): RoomSnapshot {
    const locations: RoomSnapshot['locations'] = [];
    for (const member of this.members.values()) {
      if (member.location) {
        locations.push({
          participantId: member.participant.id,
          location: member.location,
        });
      }
    }
    return {
      participants: this.participantList(),
      voiceParticipants: this.voiceList(),
      locations,
    };
  }

  join(connectionId: string, request: JoinRequestMessage): EngineEvent[] {
    if (this.closed) {
      return [
        this.reject(connectionId, 'ROOM_CLOSED', 'Room is closed'),
        this.disconnectEvent(connectionId, 'room_closed'),
      ];
    }

    if (this.members.has(connectionId)) {
      return [this.error(connectionId, 'ALREADY_JOINED', 'Already joined')];
    }

    const attempts = this.getJoinAttempts(connectionId);
    if (!attempts.allow(this.now())) {
      return [
        this.reject(connectionId, 'RATE_LIMITED', 'Too many join attempts'),
        this.disconnectEvent(connectionId, 'rate_limited'),
      ];
    }

    if (request.protocolVersion !== PROTOCOL_VERSION) {
      return [
        this.reject(
          connectionId,
          'INCOMPATIBLE_PROTOCOL',
          `Protocol ${PROTOCOL_VERSION} required`,
        ),
        this.disconnectEvent(connectionId, 'incompatible_protocol'),
      ];
    }

    if (request.roomId.length > 0 && request.roomId !== this.config.roomId) {
      return [
        this.reject(connectionId, 'INVALID_REQUEST', 'Unknown room'),
        this.disconnectEvent(connectionId, 'invalid_room'),
      ];
    }

    if (!timingSafeEqual(request.pin, this.config.pin)) {
      return [
        this.reject(connectionId, 'WRONG_PIN', 'Wrong PIN'),
        this.disconnectEvent(connectionId, 'wrong_pin'),
      ];
    }

    if (this.members.size >= this.capacity) {
      return [
        this.reject(connectionId, 'ROOM_FULL', 'Room is full'),
        this.disconnectEvent(connectionId, 'room_full'),
      ];
    }

    const participant: Participant = {
      id: this.generateParticipantId(),
      displayName: request.displayName,
      joinedAt: this.now(),
    };
    const member = this.createMember(connectionId, participant);
    this.members.set(connectionId, member);
    this.byParticipantId.set(participant.id, member);
    this.joinAttempts.delete(connectionId);

    const events: EngineEvent[] = [
      this.send(connectionId, {
        ...this.envelope(),
        type: 'JOIN_ACCEPTED',
        selfId: participant.id,
        hostId: this.hostId,
        roomName: this.config.roomName,
        voiceCapacity: this.voiceCapacity,
        participants: this.participantList(),
        voiceParticipants: this.voiceList(),
      }),
    ];

    events.push(
      ...this.broadcast(
        {
          ...this.envelope(),
          type: 'PARTICIPANT_JOINED',
          participant,
        },
        connectionId,
      ),
    );

    return events;
  }

  handle(connectionId: string, message: ClientMessage): EngineEvent[] {
    if (this.closed) {
      return [];
    }

    const member = this.members.get(connectionId);
    if (!member) {
      return [this.error(connectionId, 'NOT_JOINED', 'Join the room first')];
    }

    member.lastSeen = this.now();

    if (message.roomId !== this.config.roomId) {
      return [this.error(connectionId, 'INVALID_ROOM', 'Wrong room')];
    }

    if (message.protocolVersion !== PROTOCOL_VERSION) {
      return [
        this.error(
          connectionId,
          'INCOMPATIBLE_PROTOCOL',
          `Protocol ${PROTOCOL_VERSION} required`,
        ),
      ];
    }

    switch (message.type) {
      case 'JOIN_REQUEST':
        return [this.error(connectionId, 'ALREADY_JOINED', 'Already joined')];

      case 'LEAVE_ROOM':
        return connectionId === HOST_CONNECTION_ID
          ? this.close(HOST_CONNECTION_ID)
          : this.removeMember(connectionId, 'LEFT');

      case 'PING':
        return [
          this.send(connectionId, {
            ...this.envelope(),
            type: 'PONG',
            ...(message.nonce !== undefined ? { nonce: message.nonce } : {}),
          }),
        ];

      case 'VOICE_JOIN':
        return this.joinVoice(member);

      case 'VOICE_LEAVE':
        return this.leaveVoice(member);

      case 'VOICE_MUTE_STATUS':
        return this.setMuted(member, message.muted);

      case 'VOICE_SIGNAL':
        return this.relaySignal(member, message.targetId, message.signal);

      case 'LOCATION_SHARING_STATUS':
        return this.setSharing(member, message.sharing);

      case 'LOCATION_UPDATE':
        return this.updateLocation(member, message.location);

      case 'LOCATION_SHARING_STOP':
        return this.stopSharing(member);

      default:
        return [
          this.error(connectionId, 'UNKNOWN_TYPE', 'Unsupported message'),
        ];
    }
  }

  disconnect(
    connectionId: string,
    reason: ParticipantLeftReason = 'LEFT',
  ): EngineEvent[] {
    this.joinAttempts.delete(connectionId);
    if (connectionId === HOST_CONNECTION_ID) {
      return this.close(HOST_CONNECTION_ID);
    }
    return this.removeMember(connectionId, reason);
  }

  kick(actorConnectionId: string, targetParticipantId: string): EngineEvent[] {
    if (actorConnectionId !== HOST_CONNECTION_ID) {
      return [
        this.error(actorConnectionId, 'NOT_HOST', 'Only the host can kick'),
      ];
    }
    if (targetParticipantId === this.hostId) {
      return [
        this.error(actorConnectionId, 'INVALID_TARGET', 'Cannot kick the host'),
      ];
    }
    const target = this.byParticipantId.get(targetParticipantId);
    if (!target) {
      return [
        this.error(actorConnectionId, 'UNKNOWN_TARGET', 'Unknown participant'),
      ];
    }

    const events: EngineEvent[] = [
      this.send(target.connectionId, {
        ...this.envelope(),
        type: 'KICK_PARTICIPANT',
        reason: 'Dikeluarkan oleh host',
      }),
    ];
    events.push(...this.removeMember(target.connectionId, 'KICKED'));
    return events;
  }

  close(actorConnectionId: string): EngineEvent[] {
    if (actorConnectionId !== HOST_CONNECTION_ID) {
      return [
        this.error(actorConnectionId, 'NOT_HOST', 'Only the host can close'),
      ];
    }
    if (this.closed) {
      return [];
    }

    this.closed = true;
    const events: EngineEvent[] = this.broadcast(
      {
        ...this.envelope(),
        type: 'ROOM_CLOSED',
        reason: 'Host menutup ruangan',
      },
      HOST_CONNECTION_ID,
    );

    for (const connectionId of this.members.keys()) {
      if (connectionId !== HOST_CONNECTION_ID) {
        events.push(this.disconnectEvent(connectionId, 'room_closed'));
      }
    }

    this.members.clear();
    this.byParticipantId.clear();
    this.joinAttempts.clear();
    events.push({ type: 'closed', reason: 'host_closed' });
    return events;
  }

  /** Drop guests whose heartbeat has been silent for too long. */
  tick(): EngineEvent[] {
    const now = this.now();
    const expired: string[] = [];

    for (const [connectionId, member] of this.members) {
      if (connectionId === HOST_CONNECTION_ID) {
        continue;
      }
      if (now - member.lastSeen > CONNECTION_TIMEOUT_MS) {
        expired.push(connectionId);
      }
    }

    const events: EngineEvent[] = [];
    for (const connectionId of expired) {
      events.push(...this.removeMember(connectionId, 'TIMEOUT'));
    }
    return events;
  }

  private joinVoice(member: Member): EngineEvent[] {
    if (member.voice) {
      return [
        this.error(
          member.connectionId,
          'ALREADY_IN_VOICE',
          'Already in the voice session',
        ),
      ];
    }
    if (this.voiceList().length >= this.voiceCapacity) {
      return [
        this.error(member.connectionId, 'VOICE_FULL', 'Voice session is full'),
      ];
    }

    member.voice = true;
    member.muted = false;

    return [
      this.send(member.connectionId, {
        ...this.envelope(),
        type: 'ROOM_STATE',
        participants: this.participantList(),
        voiceParticipants: this.voiceList(),
      }),
      ...this.broadcast(
        {
          ...this.envelope(),
          type: 'VOICE_PARTICIPANT_STATE',
          participant: voiceOf(member),
          joined: true,
        },
        member.connectionId,
      ),
    ];
  }

  private leaveVoice(member: Member): EngineEvent[] {
    if (!member.voice) {
      return [];
    }
    member.voice = false;
    member.muted = false;
    return this.broadcast({
      ...this.envelope(),
      type: 'VOICE_PARTICIPANT_STATE',
      participant: voiceOf(member),
      joined: false,
    });
  }

  private setMuted(member: Member, muted: boolean): EngineEvent[] {
    if (!member.voice) {
      return [this.error(member.connectionId, 'NOT_IN_VOICE', 'Not in voice')];
    }
    member.muted = muted;
    return this.broadcast({
      ...this.envelope(),
      type: 'VOICE_MUTE_STATUS',
      participantId: member.participant.id,
      muted,
    });
  }

  private relaySignal(
    member: Member,
    targetId: string,
    signal: Extract<ClientMessage, { type: 'VOICE_SIGNAL' }>['signal'],
  ): EngineEvent[] {
    if (!member.voice) {
      return [this.error(member.connectionId, 'NOT_IN_VOICE', 'Not in voice')];
    }
    if (!member.signalLimiter.allow(this.now())) {
      return [
        this.error(member.connectionId, 'RATE_LIMITED', 'Too much signaling'),
      ];
    }
    if (targetId === member.participant.id) {
      return [
        this.error(member.connectionId, 'INVALID_TARGET', 'Cannot signal self'),
      ];
    }

    const target = this.byParticipantId.get(targetId);
    if (!target) {
      return [
        this.error(
          member.connectionId,
          'UNKNOWN_TARGET',
          'Unknown participant',
        ),
      ];
    }
    if (!target.voice) {
      return [
        this.error(
          member.connectionId,
          'TARGET_NOT_IN_VOICE',
          'Target is not in voice',
        ),
      ];
    }

    return [
      this.send(target.connectionId, {
        ...this.envelope(),
        type: 'VOICE_SIGNAL',
        fromId: member.participant.id,
        signal,
      }),
    ];
  }

  private setSharing(member: Member, sharing: boolean): EngineEvent[] {
    member.sharing = sharing;
    const events = this.broadcast({
      ...this.envelope(),
      type: 'LOCATION_SHARING_STATUS',
      participantId: member.participant.id,
      sharing,
    });

    if (!sharing) {
      member.location = null;
      events.push(
        ...this.broadcast({
          ...this.envelope(),
          type: 'LOCATION_SHARING_STOP',
          participantId: member.participant.id,
        }),
      );
    }

    return events;
  }

  private updateLocation(
    member: Member,
    location: SharedLocation,
  ): EngineEvent[] {
    if (!member.sharing) {
      return [
        this.error(
          member.connectionId,
          'SHARING_DISABLED',
          'Location sharing is off',
        ),
      ];
    }

    const now = this.now();
    if (now - member.lastLocationAt < LOCATION_MIN_INTERVAL_MS) {
      return [];
    }
    if (!member.locationLimiter.allow(now)) {
      return [];
    }

    const age = now - location.capturedAt;
    if (age > LOCATION_MAX_AGE_MS || age < -LOCATION_MAX_AGE_MS) {
      return [
        this.error(
          member.connectionId,
          'STALE_LOCATION',
          'Location fix is stale',
        ),
      ];
    }

    member.lastLocationAt = now;
    member.location = location;

    return this.broadcast({
      ...this.envelope(),
      type: 'LOCATION_UPDATE',
      participantId: member.participant.id,
      location,
    });
  }

  private stopSharing(member: Member): EngineEvent[] {
    if (!member.sharing && !member.location) {
      return [];
    }
    member.sharing = false;
    member.location = null;
    return [
      ...this.broadcast({
        ...this.envelope(),
        type: 'LOCATION_SHARING_STATUS',
        participantId: member.participant.id,
        sharing: false,
      }),
      ...this.broadcast({
        ...this.envelope(),
        type: 'LOCATION_SHARING_STOP',
        participantId: member.participant.id,
      }),
    ];
  }

  private removeMember(
    connectionId: string,
    reason: ParticipantLeftReason,
  ): EngineEvent[] {
    const member = this.members.get(connectionId);
    if (!member || connectionId === HOST_CONNECTION_ID) {
      return [];
    }

    const events: EngineEvent[] = [];

    if (member.voice) {
      events.push(
        ...this.broadcast(
          {
            ...this.envelope(),
            type: 'VOICE_PARTICIPANT_STATE',
            participant: voiceOf(member),
            joined: false,
          },
          connectionId,
        ),
      );
    }

    if (member.sharing || member.location) {
      events.push(
        ...this.broadcast(
          {
            ...this.envelope(),
            type: 'LOCATION_SHARING_STOP',
            participantId: member.participant.id,
          },
          connectionId,
        ),
      );
    }

    this.members.delete(connectionId);
    this.byParticipantId.delete(member.participant.id);

    events.push(
      ...this.broadcast(
        {
          ...this.envelope(),
          type: 'PARTICIPANT_LEFT',
          participantId: member.participant.id,
          reason,
        },
        connectionId,
      ),
    );
    events.push(this.disconnectEvent(connectionId, reason.toLowerCase()));

    return events;
  }

  private createMember(connectionId: string, participant: Participant): Member {
    return {
      connectionId,
      participant,
      lastSeen: this.now(),
      voice: false,
      muted: false,
      sharing: false,
      location: null,
      lastLocationAt: 0,
      signalLimiter: new SlidingWindowRateLimiter(
        VOICE_SIGNAL_WINDOW_MS,
        VOICE_SIGNAL_MAX_PER_WINDOW,
      ),
      locationLimiter: new SlidingWindowRateLimiter(
        10_000,
        LOCATION_UPDATES_MAX_PER_WINDOW,
      ),
    };
  }

  private getJoinAttempts(connectionId: string): SlidingWindowRateLimiter {
    let limiter = this.joinAttempts.get(connectionId);
    if (!limiter) {
      limiter = new SlidingWindowRateLimiter(
        JOIN_ATTEMPTS_WINDOW_MS,
        JOIN_ATTEMPTS_MAX,
      );
      this.joinAttempts.set(connectionId, limiter);
    }
    return limiter;
  }

  private participantList(): Participant[] {
    return Array.from(this.members.values(), member => member.participant);
  }

  private voiceList(): VoiceParticipant[] {
    const result: VoiceParticipant[] = [];
    for (const member of this.members.values()) {
      if (member.voice) {
        result.push(voiceOf(member));
      }
    }
    return result;
  }

  private envelope(): {
    protocolVersion: number;
    roomId: string;
    timestamp: number;
  } {
    return {
      protocolVersion: PROTOCOL_VERSION,
      roomId: this.config.roomId,
      timestamp: this.now(),
    };
  }

  private send(to: string, message: ServerMessage): EngineEvent {
    return { type: 'send', to, message };
  }

  private broadcast(message: ServerMessage, except?: string): EngineEvent[] {
    const events: EngineEvent[] = [];
    for (const connectionId of this.members.keys()) {
      if (connectionId !== except) {
        events.push(this.send(connectionId, message));
      }
    }
    return events;
  }

  private reject(
    connectionId: string,
    reason: JoinRejectReason,
    message: string,
  ): EngineEvent {
    return this.send(connectionId, {
      ...this.envelope(),
      type: 'JOIN_REJECTED',
      reason,
      message,
    });
  }

  private error(
    connectionId: string,
    code: string,
    message: string,
  ): EngineEvent {
    return this.send(connectionId, {
      ...this.envelope(),
      type: 'ERROR',
      code,
      message,
    });
  }

  private disconnectEvent(connectionId: string, reason: string): EngineEvent {
    return { type: 'disconnect', connectionId, reason };
  }
}

function voiceOf(member: Member): VoiceParticipant {
  return { participantId: member.participant.id, muted: member.muted };
}
