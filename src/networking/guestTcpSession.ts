import {
  ClientSession,
  type ClientJoinOptions,
  type ClientSessionDeps,
  type ClientSessionHandlers,
} from './clientSession';
import { connectTcp, type TcpClient } from './tcpTransport';

export interface GuestTcpSessionHandlers extends ClientSessionHandlers {
  onConnect?: () => void;
}

export interface GuestTcpSessionOptions {
  host: string;
  port: number;
  connectTimeoutMs?: number;
  handlers?: GuestTcpSessionHandlers;
  deps?: ClientSessionDeps;
}

/**
 * Live guest session: TCP socket + framed ClientSession.
 *
 * A TCP connect failure surfaces through `onTransportError` and then as a
 * `disconnected` room state. Joining can omit the room ID for manual
 * IP/port/PIN entry; the host's ID is adopted from JOIN_ACCEPTED.
 */
export class GuestTcpSession {
  readonly session: ClientSession;
  private readonly client: TcpClient;

  constructor(options: GuestTcpSessionOptions) {
    this.client = connectTcp(
      {
        host: options.host,
        port: options.port,
        connectTimeoutMs: options.connectTimeoutMs,
      },
      { onConnect: options.handlers?.onConnect },
    );
    this.session = new ClientSession(
      this.client,
      options.handlers,
      options.deps,
    );
  }

  join(options: ClientJoinOptions): void {
    this.session.join(options);
  }

  close(): void {
    this.session.close();
  }
}
