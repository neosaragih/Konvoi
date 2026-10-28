import { PROTOCOL_VERSION } from '../../../protocol/protocolVersion';
import type {
  ClientMessage,
  JoinRequestMessage,
  ServerMessage,
} from '../../../protocol/messageTypes';
import {
  HOST_CONNECTION_ID,
  RoomEngine,
  type EngineEvent,
  type RoomEngineConfig,
} from '../roomEngine';

const ROOM: RoomEngineConfig = {
  roomId: 'room-1',
  roomName: 'Konvoi',
  pin: '123456',
  hostDisplayName: 'Host',
};

type SendEvent = Extract<EngineEvent, { type: 'send' }>;

interface Harness {
  engine: RoomEngine;
  now: () => number;
  advance: (ms: number) => void;
}

function createHarness(overrides: Partial<RoomEngineConfig> = {}): Harness {
  let clock = 1_700_000_000_000;
  let sequence = 0;

  const engine = new RoomEngine(
    { ...ROOM, ...overrides },
    {
      now: () => clock,
      generateParticipantId: () => `p${++sequence}`,
    },
  );

  return {
    engine,
    now: () => clock,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

function joinRequest(
  overrides: Partial<JoinRequestMessage> = {},
): JoinRequestMessage {
  return {
    type: 'JOIN_REQUEST',
    protocolVersion: PROTOCOL_VERSION,
    roomId: ROOM.roomId,
    clientMessageId: 'c1',
    displayName: 'Guest',
    pin: ROOM.pin,
    ...overrides,
  };
}

function sends(events: EngineEvent[]): SendEvent[] {
  return events.filter((event): event is SendEvent => event.type === 'send');
}

function messagesFor(events: EngineEvent[], to: string): ServerMessage[] {
  return sends(events)
    .filter(event => event.to === to)
    .map(event => event.message);
}

function messageOfType<T extends ServerMessage['type']>(
  events: EngineEvent[],
  to: string,
  type: T,
): Extract<ServerMessage, { type: T }> | undefined {
  return messagesFor(events, to).find(
    (message): message is Extract<ServerMessage, { type: T }> =>
      message.type === type,
  );
}

function base() {
  return { protocolVersion: PROTOCOL_VERSION, roomId: ROOM.roomId };
}

function voiceJoin(): ClientMessage {
  return { ...base(), type: 'VOICE_JOIN' };
}

function voiceLeave(): ClientMessage {
  return { ...base(), type: 'VOICE_LEAVE' };
}

function mute(muted: boolean): ClientMessage {
  return { ...base(), type: 'VOICE_MUTE_STATUS', muted };
}

function signal(targetId: string): ClientMessage {
  return {
    ...base(),
    type: 'VOICE_SIGNAL',
    targetId,
    signal: { kind: 'offer', sdp: 'v=0' },
  };
}

function sharing(value: boolean): ClientMessage {
  return { ...base(), type: 'LOCATION_SHARING_STATUS', sharing: value };
}

function locationUpdate(capturedAt: number): ClientMessage {
  return {
    ...base(),
    type: 'LOCATION_UPDATE',
    location: { lat: -6.2, lon: 106.8, accuracy: 10, capturedAt },
  };
}

function stopSharing(): ClientMessage {
  return { ...base(), type: 'LOCATION_SHARING_STOP' };
}

function leaveRoom(): ClientMessage {
  return { ...base(), type: 'LEAVE_ROOM' };
}

describe('RoomEngine join', () => {
  it('accepts a valid join and snapshots the room', () => {
    const { engine } = createHarness();

    const events = engine.join('c1', joinRequest());
    const accepted = messageOfType(events, 'c1', 'JOIN_ACCEPTED');

    expect(accepted).toMatchObject({
      selfId: 'p1',
      hostId: 'host',
      roomName: 'Konvoi',
      voiceCapacity: 6,
    });
    expect(accepted?.participants.map(participant => participant.id)).toEqual([
      'host',
      'p1',
    ]);

    expect(
      messageOfType(events, HOST_CONNECTION_ID, 'PARTICIPANT_JOINED'),
    ).toMatchObject({
      participant: { id: 'p1', displayName: 'Guest' },
    });
  });

  it('accepts a manual join without a room ID', () => {
    const { engine } = createHarness();

    const events = engine.join('c1', joinRequest({ roomId: '' }));

    expect(messageOfType(events, 'c1', 'JOIN_ACCEPTED')).toBeDefined();
    expect(engine.getSnapshot().participants).toHaveLength(2);
  });

  it('rejects a wrong PIN and disconnects', () => {
    const { engine } = createHarness();

    const events = engine.join('c1', joinRequest({ pin: '000000' }));

    expect(messageOfType(events, 'c1', 'JOIN_REJECTED')).toMatchObject({
      reason: 'WRONG_PIN',
    });
    expect(
      events.some(
        event => event.type === 'disconnect' && event.connectionId === 'c1',
      ),
    ).toBe(true);
    expect(engine.getSnapshot().participants).toHaveLength(1);
  });

  it('rejects an incompatible protocol version', () => {
    const { engine } = createHarness();

    const events = engine.join(
      'c1',
      joinRequest({ protocolVersion: PROTOCOL_VERSION + 1 }),
    );

    expect(messageOfType(events, 'c1', 'JOIN_REJECTED')).toMatchObject({
      reason: 'INCOMPATIBLE_PROTOCOL',
    });
  });

  it('rejects a join when the room is full', () => {
    const { engine } = createHarness({ capacity: 2 });

    engine.join('c1', joinRequest());
    const events = engine.join(
      'c2',
      joinRequest({ clientMessageId: 'c2', displayName: 'Second' }),
    );

    expect(messageOfType(events, 'c2', 'JOIN_REJECTED')).toMatchObject({
      reason: 'ROOM_FULL',
    });
  });

  it('rate-limits repeated failed join attempts', () => {
    const { engine } = createHarness();

    for (let attempt = 0; attempt < 5; attempt++) {
      engine.join('c1', joinRequest({ pin: '000000' }));
    }
    const events = engine.join('c1', joinRequest({ pin: '000000' }));

    expect(messageOfType(events, 'c1', 'JOIN_REJECTED')).toMatchObject({
      reason: 'RATE_LIMITED',
    });
  });

  it('rejects joins after the host closes the room', () => {
    const { engine } = createHarness();

    engine.close(HOST_CONNECTION_ID);
    const events = engine.join('c1', joinRequest());

    expect(messageOfType(events, 'c1', 'JOIN_REJECTED')).toMatchObject({
      reason: 'ROOM_CLOSED',
    });
  });
});

describe('RoomEngine voice', () => {
  it('moves a guest into voice and notifies the host', () => {
    const { engine } = createHarness();
    engine.join('c1', joinRequest());

    const events = engine.handle('c1', voiceJoin());

    expect(messageOfType(events, 'c1', 'ROOM_STATE')).toMatchObject({
      voiceParticipants: [{ participantId: 'p1', muted: false }],
    });
    expect(
      messageOfType(events, HOST_CONNECTION_ID, 'VOICE_PARTICIPANT_STATE'),
    ).toMatchObject({
      joined: true,
      participant: { participantId: 'p1', muted: false },
    });
  });

  it('lets the in-process host join voice', () => {
    const { engine } = createHarness();
    engine.join('c1', joinRequest());

    const events = engine.handle(HOST_CONNECTION_ID, voiceJoin());

    expect(
      messageOfType(events, HOST_CONNECTION_ID, 'ROOM_STATE'),
    ).toBeDefined();
    expect(
      messageOfType(events, 'c1', 'VOICE_PARTICIPANT_STATE'),
    ).toMatchObject({
      joined: true,
      participant: { participantId: 'host' },
    });
  });

  it('enforces the voice capacity separately from room capacity', () => {
    const { engine } = createHarness({ voiceCapacity: 1 });
    engine.join('c1', joinRequest());
    engine.handle('c1', voiceJoin());

    const events = engine.handle(HOST_CONNECTION_ID, voiceJoin());

    expect(messageOfType(events, HOST_CONNECTION_ID, 'ERROR')).toMatchObject({
      code: 'VOICE_FULL',
    });
  });

  it('leaves voice without leaving the room', () => {
    const { engine } = createHarness();
    engine.join('c1', joinRequest());
    engine.handle('c1', voiceJoin());

    const events = engine.handle('c1', voiceLeave());

    expect(
      messageOfType(events, HOST_CONNECTION_ID, 'VOICE_PARTICIPANT_STATE'),
    ).toMatchObject({ joined: false });
    expect(engine.getSnapshot().participants).toHaveLength(2);
    expect(engine.getSnapshot().voiceParticipants).toHaveLength(0);
  });

  it('relays a signal only to its target', () => {
    const { engine } = createHarness();
    engine.join('c1', joinRequest());
    engine.handle('c1', voiceJoin());
    engine.handle(HOST_CONNECTION_ID, voiceJoin());

    const events = engine.handle('c1', signal('host'));

    expect(sends(events)).toHaveLength(1);
    expect(sends(events)[0]).toMatchObject({
      to: HOST_CONNECTION_ID,
      message: {
        type: 'VOICE_SIGNAL',
        fromId: 'p1',
        signal: { kind: 'offer', sdp: 'v=0' },
      },
    });
  });

  it('rejects signaling to a participant outside voice', () => {
    const { engine } = createHarness();
    engine.join('c1', joinRequest());
    engine.join(
      'c2',
      joinRequest({ clientMessageId: 'c2', displayName: 'Two' }),
    );
    engine.handle('c1', voiceJoin());

    const events = engine.handle('c1', signal('p2'));

    expect(messageOfType(events, 'c1', 'ERROR')).toMatchObject({
      code: 'TARGET_NOT_IN_VOICE',
    });
  });

  it('broadcasts mute state and exposes it in the snapshot', () => {
    const { engine } = createHarness();
    engine.join('c1', joinRequest());
    engine.handle('c1', voiceJoin());

    const events = engine.handle('c1', mute(true));

    expect(
      messageOfType(events, HOST_CONNECTION_ID, 'VOICE_MUTE_STATUS'),
    ).toMatchObject({ participantId: 'p1', muted: true });
    expect(engine.getSnapshot().voiceParticipants).toEqual([
      { participantId: 'p1', muted: true },
    ]);
  });
});

describe('RoomEngine location', () => {
  it('requires sharing to be enabled before accepting a location', () => {
    const { engine, now } = createHarness();
    engine.join('c1', joinRequest());

    const events = engine.handle('c1', locationUpdate(now()));

    expect(messageOfType(events, 'c1', 'ERROR')).toMatchObject({
      code: 'SHARING_DISABLED',
    });
  });

  it('relays a location and throttles updates under three seconds', () => {
    const { engine, now, advance } = createHarness();
    engine.join('c1', joinRequest());
    engine.handle('c1', sharing(true));

    const first = engine.handle('c1', locationUpdate(now()));
    expect(
      messageOfType(first, HOST_CONNECTION_ID, 'LOCATION_UPDATE'),
    ).toMatchObject({ participantId: 'p1' });

    advance(1_000);
    expect(engine.handle('c1', locationUpdate(now()))).toEqual([]);

    advance(2_000);
    expect(
      messageOfType(
        engine.handle('c1', locationUpdate(now())),
        HOST_CONNECTION_ID,
        'LOCATION_UPDATE',
      ),
    ).toBeDefined();
  });

  it('rejects a stale GPS fix', () => {
    const { engine, now } = createHarness();
    engine.join('c1', joinRequest());
    engine.handle('c1', sharing(true));

    const events = engine.handle('c1', locationUpdate(now() - 120_000));

    expect(messageOfType(events, 'c1', 'ERROR')).toMatchObject({
      code: 'STALE_LOCATION',
    });
  });

  it('clears the location immediately when sharing stops', () => {
    const { engine, now } = createHarness();
    engine.join('c1', joinRequest());
    engine.handle('c1', sharing(true));
    engine.handle('c1', locationUpdate(now()));

    const events = engine.handle('c1', stopSharing());

    expect(
      messageOfType(events, HOST_CONNECTION_ID, 'LOCATION_SHARING_STATUS'),
    ).toMatchObject({ sharing: false });
    expect(
      messageOfType(events, HOST_CONNECTION_ID, 'LOCATION_SHARING_STOP'),
    ).toBeDefined();
    expect(engine.getSnapshot().locations).toHaveLength(0);
  });

  it('echoes location state to the sender so its snapshot stays authoritative', () => {
    const { engine, now } = createHarness();
    engine.join('c1', joinRequest());

    const start = engine.handle('c1', sharing(true));
    expect(messageOfType(start, 'c1', 'LOCATION_SHARING_STATUS')).toMatchObject(
      { sharing: true },
    );

    const update = engine.handle('c1', locationUpdate(now()));
    expect(messageOfType(update, 'c1', 'LOCATION_UPDATE')).toMatchObject({
      participantId: 'p1',
    });

    const stop = engine.handle('c1', stopSharing());
    expect(messageOfType(stop, 'c1', 'LOCATION_SHARING_STOP')).toMatchObject({
      participantId: 'p1',
    });
  });
});

describe('RoomEngine removal and lifecycle', () => {
  it('lets the host kick a guest and cleans up voice and location', () => {
    const { engine, now } = createHarness();
    engine.join('c1', joinRequest());
    engine.handle('c1', voiceJoin());
    engine.handle('c1', sharing(true));
    engine.handle('c1', locationUpdate(now()));

    const events = engine.kick(HOST_CONNECTION_ID, 'p1');

    expect(messageOfType(events, 'c1', 'KICK_PARTICIPANT')).toBeDefined();
    expect(
      messageOfType(events, HOST_CONNECTION_ID, 'PARTICIPANT_LEFT'),
    ).toMatchObject({ participantId: 'p1', reason: 'KICKED' });
    expect(
      events.some(
        event => event.type === 'disconnect' && event.connectionId === 'c1',
      ),
    ).toBe(true);
    expect(engine.getSnapshot().participants).toHaveLength(1);
    expect(engine.getSnapshot().voiceParticipants).toHaveLength(0);
    expect(engine.getSnapshot().locations).toHaveLength(0);
  });

  it('does not let the host kick itself', () => {
    const { engine } = createHarness();

    const events = engine.kick(HOST_CONNECTION_ID, 'host');

    expect(messageOfType(events, HOST_CONNECTION_ID, 'ERROR')).toMatchObject({
      code: 'INVALID_TARGET',
    });
  });

  it('only the host can kick or close', () => {
    const { engine } = createHarness();
    engine.join('c1', joinRequest());

    expect(
      messageOfType(engine.kick('c1', 'host'), 'c1', 'ERROR'),
    ).toMatchObject({
      code: 'NOT_HOST',
    });
    expect(messageOfType(engine.close('c1'), 'c1', 'ERROR')).toMatchObject({
      code: 'NOT_HOST',
    });
  });

  it('closes the room, notifies guests, and rejects later joins', () => {
    const { engine } = createHarness();
    engine.join('c1', joinRequest());
    engine.join(
      'c2',
      joinRequest({ clientMessageId: 'c2', displayName: 'Two' }),
    );

    const events = engine.close(HOST_CONNECTION_ID);

    expect(messageOfType(events, 'c1', 'ROOM_CLOSED')).toBeDefined();
    expect(messageOfType(events, 'c2', 'ROOM_CLOSED')).toBeDefined();
    expect(events.some(event => event.type === 'closed')).toBe(true);
    expect(engine.isClosed).toBe(true);

    const after = engine.join('c3', joinRequest({ clientMessageId: 'c3' }));
    expect(messageOfType(after, 'c3', 'JOIN_REJECTED')).toMatchObject({
      reason: 'ROOM_CLOSED',
    });
  });

  it('removes a guest that leaves and broadcasts the reason', () => {
    const { engine } = createHarness();
    engine.join('c1', joinRequest());
    engine.handle('c1', voiceJoin());

    const events = engine.handle('c1', leaveRoom());

    expect(
      messageOfType(events, HOST_CONNECTION_ID, 'PARTICIPANT_LEFT'),
    ).toMatchObject({ participantId: 'p1', reason: 'LEFT' });
    expect(engine.getSnapshot().participants).toHaveLength(1);
  });

  it('times out silent guests on tick', () => {
    const { engine, advance } = createHarness();
    engine.join('c1', joinRequest());

    advance(31_000);
    const events = engine.tick();

    expect(
      messageOfType(events, HOST_CONNECTION_ID, 'PARTICIPANT_LEFT'),
    ).toMatchObject({ participantId: 'p1', reason: 'TIMEOUT' });
    expect(engine.getSnapshot().participants).toHaveLength(1);
  });

  it('treats a host disconnect as closing the room', () => {
    const { engine } = createHarness();
    engine.join('c1', joinRequest());

    const events = engine.disconnect(HOST_CONNECTION_ID);

    expect(events.some(event => event.type === 'closed')).toBe(true);
    expect(engine.isClosed).toBe(true);
  });
});
