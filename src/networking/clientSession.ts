import {
  createInitialClientRoomState,
  reduceServerMessage,
  type ClientRoomState,
} from '../features/room/clientState';
import type {
  ClientAction,
  ClientMessage,
  JoinRequestMessage,
  ServerMessage,
  SharedLocation,
  VoiceSignal,
} from '../protocol/messageTypes';
import {
  CONNECTION_TIMEOUT_MS,
  HEARTBEAT_INTERVAL_MS,
  PROTOCOL_VERSION,
} from '../protocol/protocolVersion';
import { encodeNdjson } from '../protocol/serialization';
import { parseServerMessage } from '../protocol/validators';
import { NdjsonFramer } from './ndjsonFramer';

export type { ClientAction } from '../protocol/messageTypes';

/**
 * Minimal transport the guest session needs. Implement it with
 * `react-native-tcp-socket` in the app and with fakes in tests.
 */
export interface ClientTransport {
  send(line: string): void;
  close(): void;
  onData(handler: (chunk: Uint8Array) => void): void;
  onClose(handler: () => void): void;
  onError?(handler: (error: Error) => void): void;
}

export interface ClientJoinOptions {
  /** Omit for manual IP/port/PIN joins; the host's room ID is adopted on accept. */
  roomId?: string;
  displayName: string;
  pin: string;
}

export interface ClientSessionHandlers {
  onStateChange?: (state: ClientRoomState) => void;
  onVoiceSignal?: (
    message: Extract<ServerMessage, { type: 'VOICE_SIGNAL' }>,
  ) => void;
  onPong?: (nonce: string | undefined) => void;
  onProtocolError?: (code: string, message: string) => void;
  onTransportError?: (error: Error) => void;
}

export interface ClientSessionDeps {
  now?: () => number;
  generateClientMessageId?: () => string;
  /**
   * Send PING automatically once the host accepts the join. Default true: a
   * joined guest that never pings is dropped by the host's idle timeout.
   */
  autoHeartbeat?: boolean;
  /** Heartbeat period; tests can shorten it. */
  heartbeatIntervalMs?: number;
}

/**
 * Guest-side room session.
 *
 * Owns framing, validation, the room snapshot reducer, and heartbeat. WebRTC
 * peers and the UI consume validated messages; raw bytes never escape here.
 */
export class ClientSession {
  private readonly framer = new NdjsonFramer();
  private readonly now: () => number;
  private readonly generateClientMessageId: () => string;
  private readonly autoHeartbeat: boolean;
  private readonly heartbeatIntervalMs: number;
  private state: ClientRoomState;
  private closed = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastServerMessageAt = 0;

  constructor(
    private readonly transport: ClientTransport,
    private readonly handlers: ClientSessionHandlers = {},
    deps: ClientSessionDeps = {},
  ) {
    this.now = deps.now ?? Date.now;
    this.autoHeartbeat = deps.autoHeartbeat ?? true;
    this.heartbeatIntervalMs =
      deps.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
    this.lastServerMessageAt = this.now();
    let sequence = 0;
    this.generateClientMessageId =
      deps.generateClientMessageId ??
      (() => `c${++sequence}-${Math.random().toString(36).slice(2, 8)}`);
    this.state = createInitialClientRoomState('');

    transport.onData(chunk => this.handleChunk(chunk));
    transport.onClose(() => this.handleTransportClose());
    transport.onError?.(error => this.handlers.onTransportError?.(error));
  }

  getState(): ClientRoomState {
    return this.state;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  join(options: ClientJoinOptions): void {
    if (this.closed) {
      return;
    }
    this.state = {
      ...createInitialClientRoomState(options.roomId ?? ''),
      status: 'joining',
    };
    this.handlers.onStateChange?.(this.state);

    const request: JoinRequestMessage = {
      type: 'JOIN_REQUEST',
      protocolVersion: PROTOCOL_VERSION,
      roomId: options.roomId ?? '',
      clientMessageId: this.generateClientMessageId(),
      displayName: options.displayName,
      pin: options.pin,
    };
    this.transport.send(encodeNdjson(request));
  }

  /** Send an action once the host has accepted the join. */
  send(action: ClientAction): void {
    if (this.closed || this.state.status !== 'joined') {
      return;
    }
    const message = {
      ...action,
      protocolVersion: PROTOCOL_VERSION,
      roomId: this.state.roomId,
    } as ClientMessage;
    this.transport.send(encodeNdjson(message));
  }

  ping(nonce?: string): void {
    this.send({
      type: 'PING',
      ...(nonce !== undefined ? { nonce } : {}),
    });
  }

  joinVoice(): void {
    this.send({ type: 'VOICE_JOIN' });
  }

  leaveVoice(): void {
    this.send({ type: 'VOICE_LEAVE' });
  }

  setMuted(muted: boolean): void {
    this.send({ type: 'VOICE_MUTE_STATUS', muted });
  }

  sendVoiceSignal(targetId: string, signal: VoiceSignal): void {
    this.send({ type: 'VOICE_SIGNAL', targetId, signal });
  }

  setLocationSharing(sharing: boolean): void {
    this.send({ type: 'LOCATION_SHARING_STATUS', sharing });
  }

  sendLocation(location: SharedLocation): void {
    this.send({ type: 'LOCATION_UPDATE', location });
  }

  stopLocationSharing(): void {
    this.send({ type: 'LOCATION_SHARING_STOP' });
  }

  startHeartbeat(intervalMs: number = this.heartbeatIntervalMs): void {
    this.stopHeartbeat();
    this.lastServerMessageAt = this.now();
    this.heartbeatTimer = setInterval(() => this.heartbeatTick(), intervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * A PING keeps the host's 30 s idle timeout from dropping us. If the host
   * stops answering (Wi-Fi drop, app killed), close the socket and surface a
   * `disconnected` state instead of leaving a zombie room on screen.
   */
  private heartbeatTick(): void {
    if (this.closed) {
      this.stopHeartbeat();
      return;
    }
    if (this.now() - this.lastServerMessageAt >= CONNECTION_TIMEOUT_MS) {
      this.handleDeadConnection();
      return;
    }
    this.ping();
  }

  private handleDeadConnection(): void {
    if (this.closed) {
      return;
    }
    this.stopHeartbeat();
    try {
      this.transport.close();
    } finally {
      this.handleTransportClose();
    }
  }

  /** Close the socket. The host treats this as leaving the room. */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.stopHeartbeat();
    this.framer.reset();
    this.transport.close();
  }

  private handleChunk(chunk: Uint8Array): void {
    if (this.closed) {
      return;
    }

    for (const event of this.framer.push(chunk)) {
      if (event.type === 'error') {
        this.handlers.onProtocolError?.(event.code, 'Framing error');
        continue;
      }

      const parsed = parseServerMessage(event.value);
      if (!parsed.ok) {
        this.handlers.onProtocolError?.(
          parsed.error.code,
          parsed.error.message,
        );
        continue;
      }

      this.handleMessage(parsed.value);
    }
  }

  private handleMessage(message: ServerMessage): void {
    if (this.state.roomId && message.roomId !== this.state.roomId) {
      return;
    }

    const receivedAt = this.now();
    this.state = reduceServerMessage(this.state, message, receivedAt);
    this.lastServerMessageAt = receivedAt;

    if (
      this.autoHeartbeat &&
      message.type === 'JOIN_ACCEPTED' &&
      this.heartbeatTimer === null
    ) {
      this.startHeartbeat();
    }

    if (message.type === 'VOICE_SIGNAL') {
      this.handlers.onVoiceSignal?.(message);
    } else if (message.type === 'PONG') {
      this.handlers.onPong?.(message.nonce);
    }

    this.handlers.onStateChange?.(this.state);

    if (
      message.type === 'JOIN_REJECTED' ||
      message.type === 'ROOM_CLOSED' ||
      message.type === 'KICK_PARTICIPANT'
    ) {
      this.terminate();
    }
  }

  private handleTransportClose(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.stopHeartbeat();

    if (
      this.state.status === 'rejected' ||
      this.state.status === 'kicked' ||
      this.state.status === 'closed'
    ) {
      return;
    }

    this.state = {
      ...this.state,
      status: 'disconnected',
      participants: [],
      voiceParticipants: [],
      locations: {},
      locationSharing: {},
    };
    this.handlers.onStateChange?.(this.state);
  }

  private terminate(): void {
    this.closed = true;
    this.stopHeartbeat();
    this.framer.reset();
    this.transport.close();
  }
}
