import type {
  ClientAction,
  ClientMessage,
  ServerMessage,
  SharedLocation,
  VoiceSignal,
} from '../../protocol/messageTypes';
import {
  HEARTBEAT_INTERVAL_MS,
  PROTOCOL_VERSION,
} from '../../protocol/protocolVersion';
import { HostServer, type HostConnection } from '../../networking/hostServer';
import {
  createInitialClientRoomState,
  reduceServerMessage,
  type ClientRoomState,
} from './clientState';
import {
  RoomEngine,
  type RoomEngineConfig,
  type RoomEngineDeps,
  type RoomSnapshot,
} from './roomEngine';

export interface HostRoomSessionHandlers {
  onStateChange?: (state: ClientRoomState) => void;
  onClosed?: (reason: string) => void;
  onVoiceSignal?: (
    message: Extract<ServerMessage, { type: 'VOICE_SIGNAL' }>,
  ) => void;
}

export interface HostRoomSessionDeps extends RoomEngineDeps {
  heartbeatIntervalMs?: number;
}

/**
 * Host-side room session: owns the engine, the framed-socket server, and the
 * in-process host snapshot. TCP sockets are attached from outside so this
 * class stays testable without native modules.
 */
export class HostRoomSession {
  readonly engine: RoomEngine;
  readonly server: HostServer;
  private readonly heartbeatIntervalMs: number;
  private state: ClientRoomState;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    config: RoomEngineConfig,
    private readonly handlers: HostRoomSessionHandlers = {},
    deps: HostRoomSessionDeps = {},
  ) {
    this.heartbeatIntervalMs =
      deps.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
    this.engine = new RoomEngine(config, deps);
    this.server = new HostServer(
      this.engine,
      {
        onHostMessage: message => this.handleHostMessage(message),
        onClosed: reason => this.handleClosed(reason),
      },
      { now: deps.now },
    );

    const snapshot = this.engine.getSnapshot();
    this.state = {
      ...createInitialClientRoomState(this.engine.roomId),
      status: 'joined',
      roomName: this.engine.roomName,
      selfId: this.engine.hostParticipantId,
      hostId: this.engine.hostParticipantId,
      voiceCapacity: this.engine.voiceCapacity,
      participants: snapshot.participants,
      voiceParticipants: snapshot.voiceParticipants,
    };
  }

  getState(): ClientRoomState {
    return this.state;
  }

  getSnapshot(): RoomSnapshot {
    return this.engine.getSnapshot();
  }

  get isClosed(): boolean {
    return this.engine.isClosed;
  }

  attach(connection: HostConnection): void {
    this.server.attach(connection);
  }

  send(action: ClientAction): void {
    this.server.sendFromHost({
      ...action,
      protocolVersion: PROTOCOL_VERSION,
      roomId: this.engine.roomId,
    } as Exclude<ClientMessage, { type: 'JOIN_REQUEST' }>);
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

  kick(participantId: string): void {
    this.server.kick(participantId);
  }

  closeRoom(): void {
    this.server.close();
  }

  clearError(): void {
    if (this.state.error) {
      this.state = { ...this.state, error: null };
      this.handlers.onStateChange?.(this.state);
    }
  }

  startTicking(): void {
    this.stopTicking();
    this.tickTimer = setInterval(() => {
      this.tick();
    }, this.heartbeatIntervalMs);
  }

  stopTicking(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  tick(): void {
    this.server.tick();
  }

  /** Stop the room and notify guests. Safe to call more than once. */
  stop(): void {
    this.stopTicking();
    if (!this.engine.isClosed) {
      this.server.close();
    }
  }

  private handleHostMessage(message: ServerMessage): void {
    this.state = reduceServerMessage(this.state, message);
    if (message.type === 'VOICE_SIGNAL') {
      this.handlers.onVoiceSignal?.(message);
    }
    this.handlers.onStateChange?.(this.state);
  }

  private handleClosed(reason: string): void {
    this.stopTicking();
    this.state = {
      ...this.state,
      status: 'closed',
      closedReason: reason,
      participants: [],
      voiceParticipants: [],
      locations: {},
      locationSharing: {},
    };
    this.handlers.onStateChange?.(this.state);
    this.handlers.onClosed?.(reason);
  }
}
