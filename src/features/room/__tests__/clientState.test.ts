import type { ServerMessage } from '../../../protocol/messageTypes';
import { PROTOCOL_VERSION } from '../../../protocol/protocolVersion';
import {
  createInitialClientRoomState,
  isLocationStale,
  reduceServerMessage,
} from '../clientState';

const base = {
  protocolVersion: PROTOCOL_VERSION,
  roomId: 'room-1',
  timestamp: 1_700_000_000_000,
};

const accepted: Extract<ServerMessage, { type: 'JOIN_ACCEPTED' }> = {
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

const location = {
  lat: -6.2,
  lon: 106.8,
  accuracy: 8,
  capturedAt: 1_700_000_000_000,
};

describe('reduceServerMessage', () => {
  it('applies the join snapshot', () => {
    const state = reduceServerMessage(
      createInitialClientRoomState('room-1'),
      accepted,
    );

    expect(state.status).toBe('joined');
    expect(state.roomId).toBe('room-1');
    expect(state.selfId).toBe('p1');
    expect(state.hostId).toBe('host');
    expect(state.participants).toHaveLength(2);
  });

  it('records a rejection reason', () => {
    const state = reduceServerMessage(createInitialClientRoomState('room-1'), {
      ...base,
      type: 'JOIN_REJECTED',
      reason: 'WRONG_PIN',
      message: 'Wrong PIN',
    });

    expect(state.status).toBe('rejected');
    expect(state.rejection).toEqual({
      reason: 'WRONG_PIN',
      message: 'Wrong PIN',
    });
  });

  it('adds and removes participants with their voice and location state', () => {
    let state = reduceServerMessage(
      createInitialClientRoomState('room-1'),
      accepted,
    );

    state = reduceServerMessage(state, {
      ...base,
      type: 'PARTICIPANT_JOINED',
      participant: {
        id: 'p2',
        displayName: 'Dina',
        joinedAt: 1_700_000_000_200,
      },
    });
    expect(state.participants.map(participant => participant.id)).toContain(
      'p2',
    );

    state = reduceServerMessage(
      state,
      {
        ...base,
        type: 'LOCATION_UPDATE',
        participantId: 'p2',
        location,
      },
      1_000,
    );
    state = reduceServerMessage(state, {
      ...base,
      type: 'PARTICIPANT_LEFT',
      participantId: 'p2',
      reason: 'LEFT',
    });

    expect(state.participants.map(participant => participant.id)).not.toContain(
      'p2',
    );
    expect(state.locations.p2).toBeUndefined();
    expect(state.locationSharing.p2).toBeUndefined();
  });

  it('replaces the roster on ROOM_STATE and drops absent locations', () => {
    let state = reduceServerMessage(
      createInitialClientRoomState('room-1'),
      accepted,
    );
    state = reduceServerMessage(
      state,
      {
        ...base,
        type: 'LOCATION_UPDATE',
        participantId: 'p1',
        location,
      },
      1_000,
    );

    state = reduceServerMessage(state, {
      ...base,
      type: 'ROOM_STATE',
      participants: [accepted.participants[0]],
      voiceParticipants: [],
    });

    expect(state.participants).toHaveLength(1);
    expect(state.locations.p1).toBeUndefined();
  });

  it('tracks voice membership and mute state', () => {
    let state = reduceServerMessage(
      createInitialClientRoomState('room-1'),
      accepted,
    );

    state = reduceServerMessage(state, {
      ...base,
      type: 'VOICE_PARTICIPANT_STATE',
      participant: { participantId: 'p1', muted: false },
      joined: true,
    });
    expect(state.voiceParticipants).toEqual([
      { participantId: 'p1', muted: false },
    ]);

    state = reduceServerMessage(state, {
      ...base,
      type: 'VOICE_MUTE_STATUS',
      participantId: 'p1',
      muted: true,
    });
    expect(state.voiceParticipants[0].muted).toBe(true);

    state = reduceServerMessage(state, {
      ...base,
      type: 'VOICE_PARTICIPANT_STATE',
      participant: { participantId: 'p1', muted: true },
      joined: false,
    });
    expect(state.voiceParticipants).toHaveLength(0);
  });

  it('stores locations and clears them when sharing stops', () => {
    let state = reduceServerMessage(
      createInitialClientRoomState('room-1'),
      accepted,
    );

    state = reduceServerMessage(
      state,
      {
        ...base,
        type: 'LOCATION_SHARING_STATUS',
        participantId: 'p1',
        sharing: true,
      },
      1_000,
    );
    expect(state.locationSharing.p1).toBe(true);

    state = reduceServerMessage(
      state,
      {
        ...base,
        type: 'LOCATION_UPDATE',
        participantId: 'p1',
        location,
      },
      2_000,
    );
    expect(state.locations.p1.location).toEqual(location);

    state = reduceServerMessage(
      state,
      {
        ...base,
        type: 'LOCATION_SHARING_STOP',
        participantId: 'p1',
      },
      3_000,
    );
    expect(state.locations.p1).toBeUndefined();
    expect(state.locationSharing.p1).toBe(false);
  });

  it('marks a location stale after the threshold', () => {
    const state = reduceServerMessage(
      createInitialClientRoomState('room-1'),
      {
        ...base,
        type: 'LOCATION_UPDATE',
        participantId: 'p1',
        location,
      },
      10_000,
    );

    expect(isLocationStale(state.locations.p1, 25_000)).toBe(false);
    expect(isLocationStale(state.locations.p1, 25_001)).toBe(true);
  });

  it('clears the room on close or kick', () => {
    const joined = reduceServerMessage(
      createInitialClientRoomState('room-1'),
      accepted,
    );

    const closed = reduceServerMessage(joined, {
      ...base,
      type: 'ROOM_CLOSED',
      reason: 'Host menutup ruangan',
    });
    expect(closed.status).toBe('closed');
    expect(closed.participants).toHaveLength(0);

    const kicked = reduceServerMessage(joined, {
      ...base,
      type: 'KICK_PARTICIPANT',
      reason: 'Dikeluarkan oleh host',
    });
    expect(kicked.status).toBe('kicked');
    expect(kicked.closedReason).toBe('Dikeluarkan oleh host');
  });

  it('keeps the last error for display', () => {
    const state = reduceServerMessage(createInitialClientRoomState('room-1'), {
      ...base,
      type: 'ERROR',
      code: 'VOICE_FULL',
      message: 'Voice session is full',
    });

    expect(state.error).toEqual({
      code: 'VOICE_FULL',
      message: 'Voice session is full',
    });
  });
});
