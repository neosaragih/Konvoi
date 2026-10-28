import type { ClientMessage, ServerMessage } from '../../protocol/messageTypes';
import { PROTOCOL_VERSION } from '../../protocol/protocolVersion';
import { utf8 } from '../../test-support/utf8';
import { ClientSession, type ClientTransport } from '../clientSession';

const ROOM_ID = 'room-1';

const base = {
  protocolVersion: PROTOCOL_VERSION,
  roomId: ROOM_ID,
  timestamp: 1_700_000_000_000,
};

const accepted: ServerMessage = {
  ...base,
  type: 'JOIN_ACCEPTED',
  selfId: 'p1',
  hostId: 'host',
  roomName: 'Konvoi',
  voiceCapacity: 6,
  participants: [
    { id: 'host', displayName: 'Host', joinedAt: 1_700_000_000_000 },
    { id: 'p1', displayName: 'Rafi', joinedAt: 1_700_000_000_100 },
  ],
  voiceParticipants: [],
};

class FakeTransport implements ClientTransport {
  readonly sent: string[] = [];
  closed = false;
  private dataHandler: ((chunk: Uint8Array) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private errorHandler: ((error: Error) => void) | null = null;

  send(line: string): void {
    this.sent.push(line);
  }

  close(): void {
    this.closed = true;
    this.closeHandler?.();
  }

  onData(handler: (chunk: Uint8Array) => void): void {
    this.dataHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  receive(text: string): void {
    this.dataHandler?.(utf8(text));
  }

  receiveMessage(message: ServerMessage): void {
    this.receive(`${JSON.stringify(message)}\n`);
  }

  simulateClose(): void {
    this.closed = true;
    this.closeHandler?.();
  }

  simulateError(error: Error): void {
    this.errorHandler?.(error);
  }

  messages(): ClientMessage[] {
    return this.sent.map(line => JSON.parse(line) as ClientMessage);
  }
}

interface Harness {
  session: ClientSession;
  transport: FakeTransport;
  states: ReturnType<ClientSession['getState']>[];
  signals: Array<Extract<ServerMessage, { type: 'VOICE_SIGNAL' }>>;
  pongs: Array<string | undefined>;
  protocolErrors: Array<{ code: string; message: string }>;
  transportErrors: Error[];
  clock: { now: number };
}

function createHarness(): Harness {
  const transport = new FakeTransport();
  const states: Harness['states'] = [];
  const signals: Harness['signals'] = [];
  const pongs: Harness['pongs'] = [];
  const protocolErrors: Harness['protocolErrors'] = [];
  const transportErrors: Error[] = [];
  const clock = { now: 1_700_000_000_500 };

  const session = new ClientSession(
    transport,
    {
      onStateChange: state => states.push(state),
      onVoiceSignal: message => signals.push(message),
      onPong: nonce => pongs.push(nonce),
      onProtocolError: (code, message) =>
        protocolErrors.push({ code, message }),
      onTransportError: error => transportErrors.push(error),
    },
    {
      now: () => clock.now,
      generateClientMessageId: () => 'client-1',
    },
  );

  return {
    session,
    transport,
    states,
    signals,
    pongs,
    protocolErrors,
    transportErrors,
    clock,
  };
}

function joinAndAccept(harness: Harness): void {
  harness.session.join({
    roomId: ROOM_ID,
    displayName: 'Rafi',
    pin: '123456',
  });
  harness.transport.receiveMessage(accepted);
}

describe('ClientSession join', () => {
  it('sends a join request and enters the joining state', () => {
    const harness = createHarness();

    harness.session.join({
      roomId: ROOM_ID,
      displayName: 'Rafi',
      pin: '123456',
    });

    expect(harness.states[0].status).toBe('joining');
    expect(harness.transport.messages()).toEqual([
      {
        type: 'JOIN_REQUEST',
        protocolVersion: PROTOCOL_VERSION,
        roomId: ROOM_ID,
        clientMessageId: 'client-1',
        displayName: 'Rafi',
        pin: '123456',
      },
    ]);
  });

  it('applies the accepted snapshot', () => {
    const harness = createHarness();
    joinAndAccept(harness);

    const state = harness.session.getState();
    expect(state.status).toBe('joined');
    expect(state.selfId).toBe('p1');
    expect(state.hostId).toBe('host');
    expect(state.participants).toHaveLength(2);
  });

  it('adopts the host room ID when joining manually without one', () => {
    const harness = createHarness();

    harness.session.join({ displayName: 'Rafi', pin: '123456' });
    expect(harness.transport.messages()[0]).toMatchObject({
      type: 'JOIN_REQUEST',
      roomId: '',
    });

    harness.transport.receiveMessage(accepted);
    expect(harness.session.getState().roomId).toBe(ROOM_ID);

    harness.session.joinVoice();
    const messages = harness.transport.messages();
    expect(messages[messages.length - 1]).toMatchObject({
      type: 'VOICE_JOIN',
      roomId: ROOM_ID,
    });
  });

  it('closes the transport and keeps the rejection reason', () => {
    const harness = createHarness();

    harness.transport.receiveMessage({
      ...base,
      type: 'JOIN_REJECTED',
      reason: 'WRONG_PIN',
      message: 'Wrong PIN',
    });

    expect(harness.session.getState().status).toBe('rejected');
    expect(harness.session.getState().rejection).toEqual({
      reason: 'WRONG_PIN',
      message: 'Wrong PIN',
    });
    expect(harness.transport.closed).toBe(true);
  });
});

describe('ClientSession outgoing actions', () => {
  it('ignores actions before the host accepts the join', () => {
    const harness = createHarness();

    harness.session.joinVoice();
    harness.session.sendLocation({
      lat: -6.2,
      lon: 106.8,
      accuracy: 8,
      capturedAt: 1_700_000_000_000,
    });

    expect(harness.transport.messages()).toHaveLength(0);
  });

  it('fills the envelope on every action', () => {
    const harness = createHarness();
    joinAndAccept(harness);

    harness.session.joinVoice();
    harness.session.setMuted(true);
    harness.session.sendVoiceSignal('host', { kind: 'offer', sdp: 'v=0' });
    harness.session.setLocationSharing(true);
    harness.session.sendLocation({
      lat: -6.2,
      lon: 106.8,
      accuracy: 8,
      capturedAt: 1_700_000_000_000,
    });
    harness.session.stopLocationSharing();
    harness.session.leaveVoice();

    const messages = harness.transport.messages().slice(1);
    expect(messages.map(message => message.type)).toEqual([
      'VOICE_JOIN',
      'VOICE_MUTE_STATUS',
      'VOICE_SIGNAL',
      'LOCATION_SHARING_STATUS',
      'LOCATION_UPDATE',
      'LOCATION_SHARING_STOP',
      'VOICE_LEAVE',
    ]);
    for (const message of messages) {
      expect(message.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(message.roomId).toBe(ROOM_ID);
    }
  });

  it('does not send anything after the session is closed', () => {
    const harness = createHarness();
    joinAndAccept(harness);

    harness.session.close();
    harness.session.joinVoice();

    expect(harness.transport.messages()).toHaveLength(1);
    expect(harness.transport.closed).toBe(true);
  });
});

describe('ClientSession incoming messages', () => {
  it('updates the roster and locations', () => {
    const harness = createHarness();
    joinAndAccept(harness);

    harness.transport.receiveMessage({
      ...base,
      type: 'PARTICIPANT_JOINED',
      participant: {
        id: 'p2',
        displayName: 'Dina',
        joinedAt: 1_700_000_000_200,
      },
    });
    harness.transport.receiveMessage({
      ...base,
      type: 'LOCATION_UPDATE',
      participantId: 'p2',
      location: {
        lat: -6.2,
        lon: 106.8,
        accuracy: 8,
        capturedAt: 1_700_000_000_000,
      },
    });

    const state = harness.session.getState();
    expect(state.participants.map(participant => participant.id)).toContain(
      'p2',
    );
    expect(state.locations.p2.location.lat).toBe(-6.2);
    expect(state.locationSharing.p2).toBe(true);
  });

  it('surfaces voice signals and pongs without changing the roster', () => {
    const harness = createHarness();
    joinAndAccept(harness);

    harness.transport.receiveMessage({
      ...base,
      type: 'VOICE_SIGNAL',
      fromId: 'host',
      signal: { kind: 'offer', sdp: 'v=0' },
    });
    harness.transport.receiveMessage({
      ...base,
      type: 'PONG',
      nonce: 'hb-1',
    });

    expect(harness.signals).toHaveLength(1);
    expect(harness.signals[0]).toMatchObject({
      fromId: 'host',
      signal: { kind: 'offer', sdp: 'v=0' },
    });
    expect(harness.pongs).toEqual(['hb-1']);
  });

  it('ignores messages for a different room', () => {
    const harness = createHarness();
    joinAndAccept(harness);

    harness.transport.receiveMessage({
      ...base,
      roomId: 'other-room',
      type: 'PARTICIPANT_JOINED',
      participant: {
        id: 'p3',
        displayName: 'Mallory',
        joinedAt: 1_700_000_000_300,
      },
    });

    expect(
      harness.session
        .getState()
        .participants.map(participant => participant.id),
    ).not.toContain('p3');
  });

  it('reports framing and validation errors without closing the session', () => {
    const harness = createHarness();
    joinAndAccept(harness);

    harness.transport.receive('not json\n');
    harness.transport.receive('{"type":"PONG"}\n');

    expect(harness.protocolErrors).toEqual([
      { code: 'INVALID_JSON', message: 'Framing error' },
      {
        code: 'INVALID_PROTOCOL_VERSION',
        message: 'protocolVersion must be a positive integer',
      },
    ]);
    expect(harness.session.isClosed).toBe(false);
  });

  it('marks the session disconnected when the socket closes', () => {
    const harness = createHarness();
    joinAndAccept(harness);

    harness.transport.simulateClose();

    const state = harness.session.getState();
    expect(state.status).toBe('disconnected');
    expect(state.participants).toHaveLength(0);
    expect(state.locations).toEqual({});
    expect(harness.session.isClosed).toBe(true);
  });

  it('forwards transport errors', () => {
    const harness = createHarness();
    const error = new Error('connect ECONNREFUSED');

    harness.transport.simulateError(error);

    expect(harness.transportErrors).toEqual([error]);
  });

  it('uses the local clock for location staleness', () => {
    const harness = createHarness();
    joinAndAccept(harness);

    harness.clock.now = 1_700_000_005_000;
    harness.transport.receiveMessage({
      ...base,
      type: 'LOCATION_UPDATE',
      participantId: 'p1',
      location: {
        lat: -6.2,
        lon: 106.8,
        accuracy: 8,
        capturedAt: 1_700_000_000_000,
      },
    });

    expect(harness.session.getState().locations.p1.receivedAt).toBe(
      1_700_000_005_000,
    );
  });
});

describe('ClientSession heartbeat', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends a ping on the interval and stops on close', () => {
    const harness = createHarness();
    joinAndAccept(harness);
    const before = harness.transport.messages().length;

    harness.session.startHeartbeat(1_000);
    jest.advanceTimersByTime(2_000);

    const pings = harness.transport
      .messages()
      .slice(before)
      .filter(message => message.type === 'PING');
    expect(pings).toHaveLength(2);

    harness.session.close();
    jest.advanceTimersByTime(2_000);
    expect(harness.transport.messages().length).toBe(before + 2);
  });
});
