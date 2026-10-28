import {
  HostRoomSession,
  type HostRoomSessionDeps,
  type HostRoomSessionHandlers,
} from '../features/room/hostSession';
import type { RoomEngineConfig } from '../features/room/roomEngine';
import { TcpRoomServer } from './tcpTransport';

export interface HostTcpSessionHandlers extends HostRoomSessionHandlers {
  onError?: (error: Error) => void;
  onListening?: (port: number) => void;
}

export interface HostTcpSessionOptions {
  config: RoomEngineConfig;
  handlers?: HostTcpSessionHandlers;
  deps?: HostRoomSessionDeps;
}

/**
 * Live host session: RoomEngine + framed host server + TCP listener.
 *
 * `start()` resolves with the bound port. `port: 0` asks the OS for a free
 * port, which is what the host screen shows to guests.
 */
export class HostTcpSession {
  readonly room: HostRoomSession;
  private readonly tcpServer: TcpRoomServer;
  private started = false;

  constructor(options: HostTcpSessionOptions) {
    this.room = new HostRoomSession(
      options.config,
      options.handlers,
      options.deps,
    );
    this.tcpServer = new TcpRoomServer({
      onConnection: connection => this.room.attach(connection),
      onError: options.handlers?.onError,
      onListening: options.handlers?.onListening,
    });
  }

  async start(port: number = 0): Promise<number> {
    if (this.started) {
      throw new Error('Host session already started');
    }
    this.started = true;
    try {
      const actualPort = await this.tcpServer.start(port);
      this.room.startTicking();
      return actualPort;
    } catch (error) {
      this.started = false;
      throw error;
    }
  }

  stop(): void {
    this.started = false;
    this.room.stop();
    this.tcpServer.stop();
  }
}
