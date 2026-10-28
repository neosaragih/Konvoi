import type { ClientRoomState } from '../clientState';
import type { ServerMessage } from '../../../protocol/messageTypes';
import { PROTOCOL_VERSION } from '../../../protocol/protocolVersion';
import { utf8 } from '../../../test-support/utf8';
import type { HostConnection } from '../../../networking/hostServer';
import { HostRoomSession, type HostRoomSessionDeps } from '../hostSession';
import type { RoomEngineConfig } from '../roomEngine';

const ROOM: RoomEngineConfig = {
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

interface Harness {
  session: HostRoomSession;
  states: ClientRoomState[];
  closedReasons: string[];
  clock: { now: number };
  advance: (ms: number) => void;
}

function createHarness(
  overrides: Partial<RoomEngineConfig> = {},
  deps: HostRoomSessionDeps = {},
): Harness {
  const clock = { now: 1_700_000_000_000 };
  let sequence = 0;
  const states: ClientRoomState[] = [];
  const closedReasons: string[] = [];

  const session = new HostRoomSession(
    { ...ROOM, ...overrides },
    {
      onStateChange: state => states.push(state),
      onClosed: reason => closedReasons.push(reason),
    },
    {
      now: () => clock.now,
      generateParticipantId: () => `p${++sequence}`,
      ...deps,
    },
  );

  return {
    session,
    states,
    closedReasons,
    clock,
    advance: (ms: number) => {
      clock.now += ms;
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

function attachGuest(harness: Harness): FakeConnection {
  const connection = new FakeConnection('c1');
  harness.session.attach(connection);
  connection.receive(joinLine());
  return connection;
}

describe('HostRoomSession', () => {
  it('starts with the host in the room and no voice or locations', () => {
    const { session } = createHarness();

    const state = session.getState();
    expect(state.status).toBe('joined');
    expect(state.roomName).toBe('Konvoi');
    expect(state.selfId).toBe('host');
    expect(state.hostId).toBe('host');
    expect(state.voiceCapacity).toBe(6);
    expect(state.participants).toHaveLength(1);
    expect(state.participants[0].id).toBe('host');
    expect(state.voiceParticipants).toEqual([]);
    expect(state.locations).toEqual({});
  });

  it('updates the host snapshot when a guest joins', () => {
    const harness = createHarness();
    attachGuest(harness);

    const state = harness.session.getState();
    expect(state.participants.map(participant => participant.id)).toEqual([
      'host',
      'p1',
    ]);
    expect(harness.states.length).toBeGreaterThan(0);
  });

  it('moves the host into voice and reflects the roster locally', () => {
    const harness = createHarness();

    harness.session.joinVoice();

    expect(harness.session.getState().voiceParticipants).toEqual([
      { participantId: 'host', muted: false },
    ]);
  });

  it('reflects host mute changes locally', () => {
    const harness = createHarness();
    harness.session.joinVoice();

    harness.session.setMuted(true);

    expect(harness.session.getState().voiceParticipants).toEqual([
      { participantId: 'host', muted: true },
    ]);
  });

  it('echoes host location sharing and updates to the host snapshot', () => {
    const harness = createHarness();

    harness.session.setLocationSharing(true);
    expect(harness.session.getState().locationSharing.host).toBe(true);

    harness.session.sendLocation({
      lat: -6.2,
      lon: 106.8,
      accuracy: 8,
      capturedAt: harness.clock.now,
    });
    expect(harness.session.getState().locations.host.location.lat).toBe(-6.2);

    harness.session.stopLocationSharing();
    expect(harness.session.getState().locations.host).toBeUndefined();
    expect(harness.session.getState().locationSharing.host).toBe(false);
  });

  it('kicks a guest and cleans up the host snapshot', () => {
    const harness = createHarness();
    const guest = attachGuest(harness);
    guest.receive(
      `${JSON.stringify({
        type: 'VOICE_JOIN',
        protocolVersion: PROTOCOL_VERSION,
        roomId: ROOM.roomId,
      })}\n`,
    );

    harness.session.kick('p1');

    expect(
      guest.messages().some(message => message.type === 'KICK_PARTICIPANT'),
    ).toBe(true);
    expect(guest.closed).toBe(true);
    expect(
      harness.session
        .getState()
        .participants.map(participant => participant.id),
    ).toEqual(['host']);
    expect(harness.session.getState().voiceParticipants).toEqual([]);
  });

  it('closes the room, notifies the guest, and reports the closed state', () => {
    const harness = createHarness();
    const guest = attachGuest(harness);

    harness.session.closeRoom();

    expect(
      guest.messages().some(message => message.type === 'ROOM_CLOSED'),
    ).toBe(true);
    expect(guest.closed).toBe(true);
    expect(harness.session.getState().status).toBe('closed');
    expect(harness.closedReasons).toEqual(['host_closed']);
    expect(harness.session.isClosed).toBe(true);
  });

  it('times out silent guests when ticked', () => {
    const harness = createHarness();
    attachGuest(harness);

    harness.advance(31_000);
    harness.session.tick();

    expect(
      harness.session
        .getState()
        .participants.map(participant => participant.id),
    ).toEqual(['host']);
  });

  it('clears the last host-addressed error on request', () => {
    const harness = createHarness();

    harness.session.setMuted(true);

    expect(harness.session.getState().error).toMatchObject({
      code: 'NOT_IN_VOICE',
    });

    harness.session.clearError();

    expect(harness.session.getState().error).toBeNull();
  });

  it('stops idempotently', () => {
    const harness = createHarness();
    attachGuest(harness);

    harness.session.stop();
    harness.session.stop();

    expect(harness.session.isClosed).toBe(true);
    expect(harness.closedReasons).toEqual(['host_closed']);
  });
});
