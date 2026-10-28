import { PROTOCOL_VERSION } from '../protocolVersion';
import { parseClientMessage, parseServerMessage } from '../validators';

const envelope = {
  protocolVersion: PROTOCOL_VERSION,
  roomId: 'room-1',
};

describe('parseClientMessage', () => {
  it('accepts and trims a valid join request', () => {
    const result = parseClientMessage({
      ...envelope,
      type: 'JOIN_REQUEST',
      clientMessageId: 'c1',
      displayName: '  Rafi  ',
      pin: '123456',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('JOIN_REQUEST');
      if (result.value.type === 'JOIN_REQUEST') {
        expect(result.value.displayName).toBe('Rafi');
      }
    }
  });

  it('rejects a non-numeric or short PIN', () => {
    for (const pin of ['12345', 'abcdef', '1234567']) {
      const result = parseClientMessage({
        ...envelope,
        type: 'JOIN_REQUEST',
        clientMessageId: 'c1',
        displayName: 'Rafi',
        pin,
      });
      expect(result.ok).toBe(false);
    }
  });

  it('rejects control characters in display names', () => {
    const result = parseClientMessage({
      ...envelope,
      type: 'JOIN_REQUEST',
      clientMessageId: 'c1',
      displayName: 'Rafi\u0000',
      pin: '123456',
    });

    expect(result.ok).toBe(false);
  });

  it('accepts a join without a room ID for manual IP/port/PIN joins', () => {
    const result = parseClientMessage({
      ...envelope,
      roomId: '',
      type: 'JOIN_REQUEST',
      clientMessageId: 'c1',
      displayName: 'Rafi',
      pin: '123456',
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === 'JOIN_REQUEST') {
      expect(result.value.roomId).toBe('');
    }
  });

  it('requires a room ID on messages after the join', () => {
    const result = parseClientMessage({
      ...envelope,
      roomId: '',
      type: 'VOICE_JOIN',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_ROOM_ID');
    }
  });

  it('rejects an unknown message type', () => {
    const result = parseClientMessage({ ...envelope, type: 'CHAT_SEND' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNKNOWN_TYPE');
    }
  });

  it('rejects out-of-range coordinates', () => {
    const result = parseClientMessage({
      ...envelope,
      type: 'LOCATION_UPDATE',
      location: {
        lat: 91,
        lon: 106.8,
        accuracy: 10,
        capturedAt: 1_700_000_000_000,
      },
    });

    expect(result.ok).toBe(false);
  });

  it('accepts a valid location and keeps optional fields', () => {
    const result = parseClientMessage({
      ...envelope,
      type: 'LOCATION_UPDATE',
      location: {
        lat: -6.2,
        lon: 106.8,
        accuracy: 8.5,
        capturedAt: 1_700_000_000_000,
        heading: 90,
        speed: 12,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === 'LOCATION_UPDATE') {
      expect(result.value.location).toEqual({
        lat: -6.2,
        lon: 106.8,
        accuracy: 8.5,
        capturedAt: 1_700_000_000_000,
        heading: 90,
        speed: 12,
      });
    }
  });

  it('normalizes missing ICE fields to null', () => {
    const result = parseClientMessage({
      ...envelope,
      type: 'VOICE_SIGNAL',
      targetId: 'p2',
      signal: { kind: 'ice-candidate', candidate: 'candidate:1' },
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === 'VOICE_SIGNAL') {
      expect(result.value.signal).toEqual({
        kind: 'ice-candidate',
        candidate: 'candidate:1',
        sdpMid: null,
        sdpMLineIndex: null,
      });
    }
  });

  it('rejects an oversized SDP payload', () => {
    const result = parseClientMessage({
      ...envelope,
      type: 'VOICE_SIGNAL',
      targetId: 'p2',
      signal: { kind: 'offer', sdp: 'x'.repeat(25 * 1024) },
    });

    expect(result.ok).toBe(false);
  });
});

describe('parseServerMessage', () => {
  it('accepts a JOIN_ACCEPTED snapshot', () => {
    const result = parseServerMessage({
      ...envelope,
      type: 'JOIN_ACCEPTED',
      timestamp: 1_700_000_000_000,
      selfId: 'p1',
      hostId: 'host',
      roomName: 'Konvoi',
      voiceCapacity: 6,
      participants: [
        { id: 'host', displayName: 'Host', joinedAt: 1_700_000_000_000 },
        { id: 'p1', displayName: 'Rafi', joinedAt: 1_700_000_000_100 },
      ],
      voiceParticipants: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === 'JOIN_ACCEPTED') {
      expect(result.value.participants).toHaveLength(2);
      expect(result.value.voiceCapacity).toBe(6);
    }
  });

  it('rejects a different protocol version', () => {
    const result = parseServerMessage({
      ...envelope,
      protocolVersion: PROTOCOL_VERSION + 1,
      type: 'PONG',
      timestamp: 1_700_000_000_000,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INCOMPATIBLE_PROTOCOL');
    }
  });

  it('rejects an unknown join rejection reason', () => {
    const result = parseServerMessage({
      ...envelope,
      type: 'JOIN_REJECTED',
      timestamp: 1_700_000_000_000,
      reason: 'BECAUSE',
      message: 'nope',
    });

    expect(result.ok).toBe(false);
  });
});
