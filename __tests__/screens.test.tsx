import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  createInitialClientRoomState,
  type ClientRoomState,
} from '../src/features/room/clientState';
import { CreateRoomScreen } from '../src/screens/CreateRoomScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { HostRoomScreen } from '../src/screens/HostRoomScreen';
import { JoinRoomScreen } from '../src/screens/JoinRoomScreen';
import { LiveMapScreen } from '../src/screens/LiveMapScreen';
import { SettingsScreen } from '../src/screens/SettingsScreen';
import { VoiceRoomScreen } from '../src/screens/VoiceRoomScreen';
import type { RoomApp } from '../src/state/useRoomApp';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function joinedRoom(): ClientRoomState {
  return {
    ...createInitialClientRoomState('room-1'),
    status: 'joined',
    roomName: 'Konvoi Bromo',
    selfId: 'p1',
    hostId: 'host',
    voiceCapacity: 6,
    participants: [
      { id: 'host', displayName: 'Rafi', joinedAt: 1 },
      { id: 'p1', displayName: 'Dina', joinedAt: 2 },
    ],
    voiceParticipants: [{ participantId: 'host', muted: false }],
    locationSharing: { host: true },
    locations: {
      host: {
        location: {
          lat: -6.2,
          lon: 106.8,
          accuracy: 8,
          capturedAt: 1,
        },
        receivedAt: Date.now(),
      },
    },
  };
}

function createFakeApp(overrides: Partial<RoomApp> = {}): RoomApp {
  return {
    screen: 'home',
    host: null,
    guest: null,
    room: joinedRoom(),
    rooms: [],
    scanning: false,
    busy: false,
    error: null,
    notice: null,
    voiceActive: false,
    voiceBusy: false,
    peerStates: {},
    navigate: jest.fn(),
    goBack: jest.fn(),
    createRoom: jest.fn(async () => {}),
    joinRoom: jest.fn(async () => {}),
    leaveRoom: jest.fn(async () => {}),
    closeRoom: jest.fn(),
    kick: jest.fn(),
    startVoice: jest.fn(async () => {}),
    leaveVoice: jest.fn(),
    toggleMute: jest.fn(),
    startDiscovery: jest.fn(async () => {}),
    refreshDiscovery: jest.fn(async () => {}),
    stopDiscovery: jest.fn(),
    dismissError: jest.fn(),
    dismissNotice: jest.fn(),
    locationSharingActive: false,
    reconnecting: false,
    startLocationSharing: jest.fn(async () => {}),
    stopLocationSharing: jest.fn(),
    ...overrides,
  };
}

async function render(
  element: React.ReactElement,
): Promise<ReactTestRenderer.ReactTestRenderer> {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>{element}</SafeAreaProvider>,
    );
  });
  return tree;
}

async function unmount(
  tree: ReactTestRenderer.ReactTestRenderer,
): Promise<void> {
  await ReactTestRenderer.act(async () => {
    tree.unmount();
  });
}

function textOf(tree: ReactTestRenderer.ReactTestRenderer): string {
  return JSON.stringify(tree.toJSON());
}

describe('screens render', () => {
  it('renders the home screen with the offline note', async () => {
    const tree = await render(<HomeScreen app={createFakeApp()} />);
    const text = textOf(tree);

    expect(text).toContain('Konvoi');
    expect(text).toContain('Buat Ruangan');
    expect(text).toContain('Gabung Ruangan');
    expect(text).toContain('tanpa internet');
    await unmount(tree);
  });

  it('renders the create-room form', async () => {
    const tree = await render(<CreateRoomScreen app={createFakeApp()} />);

    expect(textOf(tree)).toContain('Nama panggilan');
    expect(textOf(tree)).toContain('Buat Ruangan');
    await unmount(tree);
  });

  it('renders host details and the participant roster', async () => {
    const app = createFakeApp({
      host: {
        roomId: 'room-1',
        roomName: 'Konvoi Bromo',
        pin: '123456',
        port: 41234,
        advertised: true,
      },
    });
    const tree = await render(<HostRoomScreen app={app} />);
    const text = textOf(tree);

    expect(text).toContain('123456');
    expect(text).toContain('41234');
    expect(text).toContain('Rafi');
    expect(text).toContain('Tutup Ruangan');
    await unmount(tree);
  });

  it('starts discovery on the join screen and stops it on unmount', async () => {
    const app = createFakeApp({
      rooms: [
        {
          key: 'Konvoi-room-1',
          roomId: 'room-1',
          roomName: 'Konvoi Bromo',
          protocolVersion: 1,
          host: '192.168.43.1',
          port: 41234,
          addresses: ['192.168.43.1'],
        },
      ],
    });
    const tree = await render(<JoinRoomScreen app={app} />);

    expect(app.startDiscovery).toHaveBeenCalledTimes(1);
    expect(textOf(tree)).toContain('Konvoi Bromo');
    expect(textOf(tree)).toContain('Gabung manual');

    await unmount(tree);
    expect(app.stopDiscovery).toHaveBeenCalled();
  });

  it('keeps the microphone off until the user starts voice', async () => {
    const tree = await render(<VoiceRoomScreen app={createFakeApp()} />);
    const text = textOf(tree);

    expect(text).toContain('Mulai Suara');
    expect(text).toContain('Mikrofon mati');
    expect(text).not.toContain('Keluar dari Suara');
    expect(text).toContain('Rafi');
    await unmount(tree);
  });

  it('shows mute and leave controls while voice is active', async () => {
    const app = createFakeApp({
      voiceActive: true,
      room: {
        ...joinedRoom(),
        voiceParticipants: [
          { participantId: 'host', muted: false },
          { participantId: 'p1', muted: false },
        ],
      },
    });
    const tree = await render(<VoiceRoomScreen app={app} />);
    const text = textOf(tree);

    expect(text).toContain('Keluar dari Suara');
    expect(text).toContain('Mikrofon aktif');
    expect(text).toContain('Bisukan');
    await unmount(tree);
  });

  it('renders the offline-map placeholder and sharing state', async () => {
    const tree = await render(<LiveMapScreen app={createFakeApp()} />);
    const text = textOf(tree);

    expect(text).toContain('Peta offline belum tersedia');
    expect(text).toContain('OpenStreetMap');
    expect(text).toContain('Terbaru');
    await unmount(tree);
  });

  it('renders the settings and honesty notes', async () => {
    const tree = await render(<SettingsScreen app={createFakeApp()} />);
    const text = textOf(tree);

    expect(text).toContain('Tanpa enkripsi');
    expect(text).toContain('HFP/HSP');
    expect(text).toContain('0.1.0');
    await unmount(tree);
  });

  it('falls back cleanly when no room is active', async () => {
    const app = createFakeApp({ room: null });
    const voice = await render(<VoiceRoomScreen app={app} />);
    expect(textOf(voice)).toContain('Tidak ada ruangan aktif');
    await unmount(voice);

    const map = await render(<LiveMapScreen app={app} />);
    expect(textOf(map)).toContain('Tidak ada ruangan aktif');
    await unmount(map);
  });
});
