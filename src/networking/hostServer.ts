import {
  HOST_CONNECTION_ID,
  RoomEngine,
  type EngineEvent,
} from '../features/room/roomEngine';
import type { ClientMessage, ServerMessage } from '../protocol/messageTypes';
import { PROTOCOL_VERSION } from '../protocol/protocolVersion';
import { encodeNdjson } from '../protocol/serialization';
import { parseClientMessage } from '../protocol/validators';
import { NdjsonFramer } from './ndjsonFramer';

/**
 * Minimal socket contract the host needs. Implement it with
 * `react-native-tcp-socket` in the app and with fakes in tests.
 */
export interface HostConnection {
  readonly id: string;
  send(line: string): void;
  close(): void;
  onData(handler: (chunk: Uint8Array) => void): void;
  onClose(handler: () => void): void;
}

export interface HostServerHandlers {
  /** Messages addressed to the in-process host UI (voice/location/participants). */
  onHostMessage?: (message: ServerMessage) => void;
  onClosed?: (reason: string) => void;
}

export interface HostServerDeps {
  now?: () => number;
}

/**
 * Wires framed TCP connections to the RoomEngine.
 *
 * Framing, validation, and rate limiting stay out of the socket callback so a
 * slow or malicious client cannot bypass them.
 */
export class HostServer {
  private readonly connections = new Map<string, HostConnection>();
  private readonly framers = new Map<string, NdjsonFramer>();
  private readonly now: () => number;

  constructor(
    private readonly engine: RoomEngine,
    private readonly handlers: HostServerHandlers = {},
    deps: HostServerDeps = {},
  ) {
    this.now = deps.now ?? Date.now;
  }

  attach(connection: HostConnection): void {
    this.connections.set(connection.id, connection);
    this.framers.set(connection.id, new NdjsonFramer());

    connection.onData(chunk => this.handleData(connection.id, chunk));
    connection.onClose(() => this.handleClose(connection.id));
  }

  /** Actions initiated by the in-process host UI. */
  sendFromHost(
    message: Exclude<ClientMessage, { type: 'JOIN_REQUEST' }>,
  ): void {
    this.apply(this.engine.handle(HOST_CONNECTION_ID, message));
  }

  kick(participantId: string): void {
    this.apply(this.engine.kick(HOST_CONNECTION_ID, participantId));
  }

  close(): void {
    this.apply(this.engine.close(HOST_CONNECTION_ID));
  }

  tick(): void {
    this.apply(this.engine.tick());
  }

  private handleData(connectionId: string, chunk: Uint8Array): void {
    const framer = this.framers.get(connectionId);
    if (!framer) {
      return;
    }

    for (const event of framer.push(chunk)) {
      if (event.type === 'error') {
        this.sendError(
          connectionId,
          event.code,
          `Framing error: ${event.code}`,
        );
        if (event.code === 'OVERSIZED_FRAME') {
          this.closeConnection(connectionId);
        }
        continue;
      }

      const parsed = parseClientMessage(event.value);
      if (!parsed.ok) {
        this.sendError(connectionId, parsed.error.code, parsed.error.message);
        continue;
      }

      const message = parsed.value;
      const events =
        message.type === 'JOIN_REQUEST'
          ? this.engine.join(connectionId, message)
          : this.engine.handle(connectionId, message);
      this.apply(events);
    }
  }

  private handleClose(connectionId: string): void {
    if (!this.connections.has(connectionId)) {
      return;
    }
    this.connections.delete(connectionId);
    this.framers.delete(connectionId);
    this.apply(this.engine.disconnect(connectionId, 'LEFT'));
  }

  private apply(events: EngineEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'send':
          if (event.to === HOST_CONNECTION_ID) {
            this.handlers.onHostMessage?.(event.message);
          } else {
            this.connections.get(event.to)?.send(encodeNdjson(event.message));
          }
          break;

        case 'disconnect':
          this.closeConnection(event.connectionId);
          break;

        case 'closed':
          this.handlers.onClosed?.(event.reason);
          break;
      }
    }
  }

  private closeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }
    this.connections.delete(connectionId);
    this.framers.delete(connectionId);
    connection.close();
  }

  private sendError(connectionId: string, code: string, message: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }
    const error: ServerMessage = {
      type: 'ERROR',
      protocolVersion: PROTOCOL_VERSION,
      roomId: this.engine.roomId,
      timestamp: this.now(),
      code,
      message,
    };
    connection.send(encodeNdjson(error));
  }
}
