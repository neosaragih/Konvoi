import { RoomEngine } from '../../features/room/roomEngine';
import type { ClientMessage, ServerMessage } from '../../protocol/messageTypes';
import { PROTOCOL_VERSION } from '../../protocol/protocolVersion';
import { utf8 } from '../../test-support/utf8';
import { HostServer, type HostConnection } from '../hostServer';

const ROOM = {
  roomId: 'room-1',
  roomName: 'Konvoi',
  pin: '123456',
  hostDisplayName: 'Host',
};

class FakeConnection implements HostConnection {
  readonly sent: string[] = [];
  closed = false;
  private dataHandler: ((chunk: Uint8Array) => void) | null = null;
  private closeHandler: (() => void) | null = null;

  constructor(readonly id: string) {}

  send(line: string): void {
    this.sent.push(line);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.closeHandler?.();
  }

  onData(handler: (chunk: Uint8Array) => void): void {
    this.dataHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  receive(text: string): void {
    this.dataHandler?.(utf8(text));
  }

  messages(): ServerMessage[] {
    return this.sent.map(line => JSON.parse(line) as ServerMessage);
  }
}

function createSetup() {
  let clock = 1_700_000_000_000;
  let sequence = 0;
  const engine = new RoomEngine(ROOM, {
    now: () => clock,
    generateParticipantId: () => `p${++sequence}`,
  });
  const hostMessages: ServerMessage[] = [];
  let closedReason: string | null = null;

  const server = new HostServer(
    engine,
    {
      onHostMessage: message => hostMessages.push(message),
      onClosed: reason => {
        closedReason = reason;
      },
    },
    { now: () => clock },
  );

  return {
    engine,
    server,
    hostMessages,
    closedReason: () => closedReason,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

function joinLine(overrides: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    type: 'JOIN_REQUEST',
    protocolVersion: PROTOCOL_VERSION,
    roomId: ROOM.roomId,
    clientMessageId: 'c1',
    displayName: 'Guest',
    pin: ROOM.pin,
    ...overrides,
  })}\n`;
}

function acceptedId(connection: FakeConnection): string {
  const accepted = connection
    .messages()
    .find(message => message.type === 'JOIN_ACCEPTED');
  if (!accepted || accepted.type !== 'JOIN_ACCEPTED') {
    throw new Error('JOIN_ACCEPTED not received');
  }
  return accepted.selfId;
}

describe('HostServer', () => {
  it('accepts a valid join over a framed socket', () => {
    const { engine, server } = createSetup();
    const connection = new FakeConnection('c1');
    server.attach(connection);

    connection.receive(joinLine());

    expect(connection.messages()[0]).toMatchObject({ type: 'JOIN_ACCEPTED' });
    expect(engine.getSnapshot().participants).toHaveLength(2);
  });

  it('rejects a wrong PIN and closes the socket', () => {
    const { server } = createSetup();
    const connection = new FakeConnection('c1');
    server.attach(connection);

    connection.receive(joinLine({ pin: '000000' }));

    expect(connection.messages()[0]).toMatchObject({
      type: 'JOIN_REJECTED',
      reason: 'WRONG_PIN',
    });
    expect(connection.closed).toBe(true);
  });

  it('reports malformed JSON without closing the socket', () => {
    const { server } = createSetup();
    const connection = new FakeConnection('c1');
    server.attach(connection);

    connection.receive('this is not json\n');

    expect(connection.messages()[0]).toMatchObject({
      type: 'ERROR',
      code: 'INVALID_JSON',
    });
    expect(connection.closed).toBe(false);
  });

  it('handles a join split across two data events', () => {
    const { server } = createSetup();
    const connection = new FakeConnection('c1');
    server.attach(connection);
    const line = joinLine();

    connection.receive(line.slice(0, 25));
    expect(connection.messages()).toHaveLength(0);

    connection.receive(line.slice(25));

    expect(connection.messages()[0]).toMatchObject({ type: 'JOIN_ACCEPTED' });
  });

  it('rejects an oversized frame and disconnects', () => {
    const { server } = createSetup();
    const connection = new FakeConnection('c1');
    server.attach(connection);

    connection.receive('x'.repeat(70_000));

    expect(connection.messages()[0]).toMatchObject({
      type: 'ERROR',
      code: 'OVERSIZED_FRAME',
    });
    expect(connection.closed).toBe(true);
  });

  it('routes engine messages for the in-process host UI', () => {
    const { server, hostMessages } = createSetup();
    const connection = new FakeConnection('c1');
    server.attach(connection);
    connection.receive(joinLine());

    expect(
      hostMessages.some(message => message.type === 'PARTICIPANT_JOINED'),
    ).toBe(true);

    const voiceJoin: ClientMessage = {
      type: 'VOICE_JOIN',
      protocolVersion: PROTOCOL_VERSION,
      roomId: ROOM.roomId,
    };
    server.sendFromHost(voiceJoin);

    expect(hostMessages.some(message => message.type === 'ROOM_STATE')).toBe(
      true,
    );
    expect(
      connection
        .messages()
        .some(message => message.type === 'VOICE_PARTICIPANT_STATE'),
    ).toBe(true);
  });

  it('closes the target socket on kick', () => {
    const { server, hostMessages } = createSetup();
    const connection = new FakeConnection('c1');
    server.attach(connection);
    connection.receive(joinLine());

    server.kick(acceptedId(connection));

    expect(
      connection
        .messages()
        .some(message => message.type === 'KICK_PARTICIPANT'),
    ).toBe(true);
    expect(connection.closed).toBe(true);
    expect(
      hostMessages.some(
        message =>
          message.type === 'PARTICIPANT_LEFT' && message.reason === 'KICKED',
      ),
    ).toBe(true);
  });

  it('closes silent guests on tick', () => {
    const { server, hostMessages, advance } = createSetup();
    const connection = new FakeConnection('c1');
    server.attach(connection);
    connection.receive(joinLine());

    advance(31_000);
    server.tick();

    expect(
      hostMessages.some(
        message =>
          message.type === 'PARTICIPANT_LEFT' && message.reason === 'TIMEOUT',
      ),
    ).toBe(true);
    expect(connection.closed).toBe(true);
  });

  it('notifies guests and the host when the room closes', () => {
    const { server, closedReason } = createSetup();
    const connection = new FakeConnection('c1');
    server.attach(connection);
    connection.receive(joinLine());

    server.close();

    expect(
      connection.messages().some(message => message.type === 'ROOM_CLOSED'),
    ).toBe(true);
    expect(connection.closed).toBe(true);
    expect(closedReason()).toBe('host_closed');
  });

  it('broadcasts a left event when a guest disconnects', () => {
    const { server, hostMessages } = createSetup();
    const connection = new FakeConnection('c1');
    server.attach(connection);
    connection.receive(joinLine());

    connection.close();

    expect(
      hostMessages.some(
        message =>
          message.type === 'PARTICIPANT_LEFT' && message.reason === 'LEFT',
      ),
    ).toBe(true);
  });
});
