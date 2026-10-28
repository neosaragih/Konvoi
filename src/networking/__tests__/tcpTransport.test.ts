import type Socket from 'react-native-tcp-socket/lib/types/Socket';
import { utf8 } from '../../test-support/utf8';
import { TcpClient, TcpHostConnection } from '../tcpTransport';

type Listener = (...args: unknown[]) => void;

class MockSocket {
  private readonly listeners = new Map<string, Listener[]>();
  written: string[] = [];
  destroyed = false;
  _pending = true;
  readyState = 'opening';

  setNoDelay = jest.fn();
  setKeepAlive = jest.fn();

  on(event: string, listener: Listener): this {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const list = this.listeners.get(event) ?? [];
    for (const listener of list) {
      listener(...args);
    }
    return list.length > 0;
  }

  write(data: string): boolean {
    if (this._pending || this.destroyed) {
      throw new Error('Socket is closed.');
    }
    this.written.push(data);
    return true;
  }

  destroy(): this {
    this.destroyed = true;
    this.emit('close');
    return this;
  }
}

describe('TcpClient', () => {
  it('queues sends while connecting and flushes on connect', () => {
    const socket = new MockSocket();
    const onConnect = jest.fn();
    const client = new TcpClient(socket as unknown as Socket, { onConnect });

    client.send('{"type":"JOIN_REQUEST"}\n');
    expect(socket.written).toHaveLength(0);
    expect(client.isClosed).toBe(false);
    expect(client.isConnected).toBe(false);

    // Simulate native connect event
    socket._pending = false;
    socket.readyState = 'open';
    socket.emit('connect');

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(client.isConnected).toBe(true);
    expect(socket.written).toEqual(['{"type":"JOIN_REQUEST"}\n']);

    // Subsequent sends go through immediately
    client.send('{"type":"PING"}\n');
    expect(socket.written).toEqual([
      '{"type":"JOIN_REQUEST"}\n',
      '{"type":"PING"}\n',
    ]);
  });

  it('handles write errors gracefully by closing the client', () => {
    const socket = new MockSocket();
    socket._pending = false;
    socket.readyState = 'open';
    const client = new TcpClient(socket as unknown as Socket);
    const onClose = jest.fn();
    client.onClose(onClose);

    // Force write to throw
    socket.write = () => {
      throw new Error('EPIPE');
    };

    client.send('{"type":"PING"}\n');
    expect(client.isClosed).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('handles error events and closes the transport', () => {
    const socket = new MockSocket();
    const onError = jest.fn();
    const client = new TcpClient(socket as unknown as Socket, { onError });
    const onClose = jest.fn();
    client.onClose(onClose);

    const error = new Error('ECONNREFUSED');
    socket.emit('error', error);

    expect(onError).toHaveBeenCalledWith(error);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(client.isClosed).toBe(true);
  });

  it('buffers early chunks until onData is registered', () => {
    const socket = new MockSocket();
    const client = new TcpClient(socket as unknown as Socket);

    socket.emit('data', 'first');
    socket.emit('data', 'second');

    const received: Uint8Array[] = [];
    client.onData(chunk => {
      received.push(chunk);
    });

    expect(received).toEqual([utf8('first'), utf8('second')]);
  });

  it('handles timeout by destroying socket and closing', () => {
    const socket = new MockSocket();
    const client = new TcpClient(socket as unknown as Socket);
    const onClose = jest.fn();
    client.onClose(onClose);

    socket.emit('timeout');
    expect(socket.destroyed).toBe(true);
    expect(client.isClosed).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('TcpHostConnection', () => {
  it('applies socket options and sends lines', () => {
    const socket = new MockSocket();
    socket._pending = false;
    socket.readyState = 'open';

    const conn = new TcpHostConnection('h1', socket as unknown as Socket);
    expect(socket.setNoDelay).toHaveBeenCalledWith(true);
    expect(socket.setKeepAlive).toHaveBeenCalledWith(true);

    conn.send('{"type":"JOIN_ACCEPTED"}\n');
    expect(socket.written).toEqual(['{"type":"JOIN_ACCEPTED"}\n']);
  });

  it('handles close events', () => {
    const socket = new MockSocket();
    socket._pending = false;
    socket.readyState = 'open';

    const conn = new TcpHostConnection('h1', socket as unknown as Socket);
    const onClose = jest.fn();
    conn.onClose(onClose);

    socket.emit('close');
    expect(conn.isClosed).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
