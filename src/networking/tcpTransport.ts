import TcpSocket from 'react-native-tcp-socket';
import type TcpServer from 'react-native-tcp-socket/lib/types/Server';
import type Socket from 'react-native-tcp-socket/lib/types/Socket';
import type { ClientTransport } from './clientSession';
import type { HostConnection } from './hostServer';
import { encodeUtf8 } from '../utils/utf8';

/**
 * Adapter around `react-native-tcp-socket`.
 *
 * This is the only file allowed to import the native module. Everything that
 * matters (framing, validation, room state) lives in transport-agnostic code so
 * it stays unit-testable on a machine without native builds.
 */

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === 'string' ? encodeUtf8(data) : data;
}

/** One accepted guest socket, exposed to the host as a HostConnection. */
export class TcpHostConnection implements HostConnection {
  private dataHandler: ((chunk: Uint8Array) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private earlyChunks: Uint8Array[] = [];
  private closed = false;
  private closeNotified = false;
  private lastError: Error | null = null;

  constructor(readonly id: string, private readonly socket: Socket) {
    this.applySocketOptions();
    socket.on('data', this.handleData);
    socket.on('close', this.handleClose);
    socket.on('error', this.handleError);
    socket.on('timeout', this.handleTimeout);
  }

  private applySocketOptions(): void {
    try {
      this.socket.setNoDelay(true);
      this.socket.setKeepAlive(true);
    } catch {
      // Best effort; the app-level PING is the reliable keepalive.
    }
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get error(): Error | null {
    return this.lastError;
  }

  send(line: string): void {
    if (this.closed) {
      return;
    }
    try {
      this.socket.write(line);
    } catch {
      this.finish();
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    try {
      this.socket.destroy();
    } catch {
      // The socket may already be gone; the local state is what matters.
    }
    this.finish();
  }

  onData(handler: (chunk: Uint8Array) => void): void {
    this.dataHandler = handler;
    if (this.earlyChunks.length === 0) {
      return;
    }
    const chunks = this.earlyChunks;
    this.earlyChunks = [];
    for (const chunk of chunks) {
      handler(chunk);
    }
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
    this.notifyClose();
  }

  private handleData = (data: string | Uint8Array): void => {
    if (this.closed) {
      return;
    }
    const chunk = toBytes(data);
    if (this.dataHandler) {
      this.dataHandler(chunk);
    } else {
      this.earlyChunks.push(chunk);
    }
  };

  private handleClose = (): void => {
    this.finish();
  };

  private handleError = (error: Error): void => {
    this.lastError = error;
    this.finish();
  };

  private handleTimeout = (): void => {
    try {
      this.socket.destroy();
    } catch {
      // Best effort
    }
    this.finish();
  };

  private finish(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.earlyChunks = [];
    this.notifyClose();
  }

  private notifyClose(): void {
    if (this.closed && !this.closeNotified && this.closeHandler) {
      this.closeNotified = true;
      this.closeHandler();
    }
  }
}

export interface TcpRoomServerHandlers {
  onConnection: (connection: HostConnection) => void;
  onError?: (error: Error) => void;
  onListening?: (port: number) => void;
}

/**
 * TCP listener for the host phone.
 *
 * Binds to all interfaces so guests on the same Wi-Fi/hotspot can reach it.
 * `port: 0` asks the OS for a free port; the resolved port is what the host
 * shows to guests.
 */
export class TcpRoomServer {
  private server: TcpServer | null = null;
  private readonly connections = new Set<TcpHostConnection>();
  private nextConnectionId = 0;
  private stopped = false;

  constructor(private readonly handlers: TcpRoomServerHandlers) {}

  get isListening(): boolean {
    return this.server !== null && !this.stopped;
  }

  start(port: number, host: string = '0.0.0.0'): Promise<number> {
    if (this.server) {
      return Promise.reject(new Error('TCP server already started'));
    }
    this.stopped = false;

    return new Promise<number>((resolve, reject) => {
      let settled = false;

      const server = TcpSocket.createServer(
        { noDelay: true, keepAlive: true },
        socket => {
          const connection = new TcpHostConnection(
            `tcp-${++this.nextConnectionId}`,
            socket,
          );
          this.connections.add(connection);
          connection.onClose(() => {
            this.connections.delete(connection);
          });
          this.handlers.onConnection(connection);
        },
      );
      this.server = server;

      server.on('error', (error: Error) => {
        this.handlers.onError?.(error);
        if (!settled) {
          settled = true;
          this.server = null;
          reject(error);
        }
      });

      server.listen({ port, host, reuseAddress: true }, () => {
        if (settled) {
          return;
        }
        settled = true;
        const address = server.address();
        const actualPort =
          address && typeof address === 'object' && 'port' in address
            ? address.port
            : port;
        this.handlers.onListening?.(actualPort);
        resolve(actualPort);
      });
    });
  }

  /** Stop accepting guests and close every accepted socket. */
  stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;

    for (const connection of Array.from(this.connections)) {
      connection.close();
    }
    this.connections.clear();

    const server = this.server;
    this.server = null;
    if (server) {
      try {
        server.close();
      } catch {
        // Already closed or never bound.
      }
    }
  }
}

export interface TcpClientOptions {
  host: string;
  port: number;
  connectTimeoutMs?: number;
}

export interface TcpClientHandlers {
  onConnect?: () => void;
  onError?: (error: Error) => void;
}

/** Guest-side socket, exposed as a ClientTransport to the room session. */
export class TcpClient implements ClientTransport {
  private dataHandler: ((chunk: Uint8Array) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private errorHandler: ((error: Error) => void) | null = null;
  private earlyChunks: Uint8Array[] = [];
  private sendQueue: string[] = [];
  private connected = false;
  private closed = false;
  private closeNotified = false;

  constructor(
    private readonly socket: Socket,
    private readonly handlers: TcpClientHandlers = {},
  ) {
    // If socket is already open (e.g. pre-connected or mock)
    const socketState = socket as unknown as {
      readyState?: string;
      _pending?: boolean;
    };
    if (socketState.readyState === 'open' && socketState._pending === false) {
      this.connected = true;
    }

    try {
      socket.setNoDelay(true);
      socket.setKeepAlive(true);
    } catch {
      // Best effort; the app-level PING is the reliable keepalive.
    }
    socket.on('connect', this.handleConnect);
    socket.on('data', this.handleData);
    socket.on('close', this.handleClose);
    socket.on('error', this.handleError);
    socket.on('timeout', this.handleTimeout);
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  send(line: string): void {
    if (this.closed) {
      return;
    }
    if (!this.connected) {
      this.sendQueue.push(line);
      return;
    }
    try {
      this.socket.write(line);
    } catch {
      this.finish();
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    try {
      this.socket.destroy();
    } catch {
      // Already gone.
    }
    this.finish();
  }

  onData(handler: (chunk: Uint8Array) => void): void {
    this.dataHandler = handler;
    if (this.earlyChunks.length === 0) {
      return;
    }
    const chunks = this.earlyChunks;
    this.earlyChunks = [];
    for (const chunk of chunks) {
      handler(chunk);
    }
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
    this.notifyClose();
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  private handleConnect = (): void => {
    if (this.closed) {
      return;
    }
    this.connected = true;
    this.handlers.onConnect?.();
    this.flushQueue();
  };

  private flushQueue(): void {
    if (this.closed || !this.connected) {
      return;
    }
    while (this.sendQueue.length > 0) {
      const line = this.sendQueue.shift();
      if (line !== undefined) {
        try {
          this.socket.write(line);
        } catch {
          this.finish();
          break;
        }
      }
    }
  }

  private handleData = (data: string | Uint8Array): void => {
    if (this.closed) {
      return;
    }
    const chunk = toBytes(data);
    if (this.dataHandler) {
      this.dataHandler(chunk);
    } else {
      this.earlyChunks.push(chunk);
    }
  };

  private handleClose = (): void => {
    this.finish();
  };

  private handleError = (error: Error): void => {
    this.handlers.onError?.(error);
    this.errorHandler?.(error);
    this.finish();
  };

  private handleTimeout = (): void => {
    try {
      this.socket.destroy();
    } catch {
      // Best effort
    }
    this.finish();
  };

  private finish(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.connected = false;
    this.sendQueue = [];
    this.earlyChunks = [];
    this.notifyClose();
  }

  private notifyClose(): void {
    if (this.closed && !this.closeNotified && this.closeHandler) {
      this.closeNotified = true;
      this.closeHandler();
    }
  }
}

/** Connect to the host. Throws synchronously only for invalid options. */
export function connectTcp(
  options: TcpClientOptions,
  handlers: TcpClientHandlers = {},
): TcpClient {
  const socket = TcpSocket.createConnection(
    {
      host: options.host,
      port: options.port,
      connectTimeout: options.connectTimeoutMs,
    },
    () => {
      // Connect event is handled by socket.on('connect') inside TcpClient
    },
  );
  return new TcpClient(socket, handlers);
}
