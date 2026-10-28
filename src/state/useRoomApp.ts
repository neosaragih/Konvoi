import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { locationService } from '../location/locationService';
import type { ClientRoomState } from '../features/room/clientState';
import { HostTcpSession } from '../networking/hostTcpSession';
import { GuestTcpSession } from '../networking/guestTcpSession';
import {
  RoomAdvertiser,
  RoomDiscovery,
  type DiscoveredRoom,
} from '../networking/discovery';
import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_ROOM_NAME_LENGTH,
  PIN_LENGTH,
} from '../protocol/protocolVersion';
import { generatePin, generateRoomId } from '../utils/roomCodes';
import { VoiceManager, type VoicePeerState } from '../voice/voiceManager';

export type ScreenName =
  | 'home'
  | 'create'
  | 'host'
  | 'join'
  | 'room'
  | 'map'
  | 'settings';

export interface HostRoomInfo {
  roomId: string;
  roomName: string;
  pin: string;
  port: number;
  /** True once mDNS advertising succeeded; manual IP/port still works. */
  advertised: boolean;
}

export interface GuestRoomInfo {
  host: string;
  port: number;
}

export interface CreateRoomInput {
  displayName: string;
  roomName: string;
}

export interface JoinRoomInput {
  displayName: string;
  pin: string;
  host: string;
  port: string;
  /** Present when the guest picked a discovered room. */
  roomId?: string;
}

export interface RoomApp {
  screen: ScreenName;
  host: HostRoomInfo | null;
  guest: GuestRoomInfo | null;
  room: ClientRoomState | null;
  rooms: DiscoveredRoom[];
  scanning: boolean;
  busy: boolean;
  error: string | null;
  notice: string | null;
  voiceActive: boolean;
  voiceBusy: boolean;
  peerStates: Record<string, VoicePeerState>;
  navigate: (screen: ScreenName) => void;
  goBack: () => void;
  createRoom: (input: CreateRoomInput) => Promise<void>;
  joinRoom: (input: JoinRoomInput) => Promise<void>;
  leaveRoom: () => Promise<void>;
  closeRoom: () => void;
  kick: (participantId: string) => void;
  startVoice: () => Promise<void>;
  leaveVoice: () => void;
  toggleMute: () => void;
  startDiscovery: () => Promise<void>;
  refreshDiscovery: () => Promise<void>;
  stopDiscovery: () => void;
  dismissError: () => void;
  dismissNotice: () => void;
  locationSharingActive: boolean;
  reconnecting: boolean;
  startLocationSharing: () => Promise<void>;
  stopLocationSharing: () => void;
}

const JOIN_TIMEOUT_MS = 12_000;

function trimmedLength(value: string): number {
  return value.trim().length;
}

function validateDisplayName(value: string): string | null {
  const length = trimmedLength(value);
  if (length === 0) {
    return 'Nama panggilan wajib diisi.';
  }
  if (length > MAX_DISPLAY_NAME_LENGTH) {
    return `Nama panggilan maksimal ${MAX_DISPLAY_NAME_LENGTH} karakter.`;
  }
  return null;
}

function validateRoomName(value: string): string | null {
  const length = trimmedLength(value);
  if (length === 0) {
    return 'Nama ruangan wajib diisi.';
  }
  if (length > MAX_ROOM_NAME_LENGTH) {
    return `Nama ruangan maksimal ${MAX_ROOM_NAME_LENGTH} karakter.`;
  }
  return null;
}

function parsePort(value: string): number | null {
  if (!/^\d{1,5}$/.test(value.trim())) {
    return null;
  }
  const port = Number(value.trim());
  if (port < 1 || port > 65_535) {
    return null;
  }
  return port;
}

function joinRejectionText(state: ClientRoomState): string {
  switch (state.rejection?.reason) {
    case 'WRONG_PIN':
      return 'PIN salah. Periksa PIN di layar host.';
    case 'ROOM_FULL':
      return 'Ruangan penuh (maksimal 12 orang).';
    case 'ROOM_CLOSED':
      return 'Ruangan sudah ditutup host.';
    case 'RATE_LIMITED':
      return 'Terlalu banyak percobaan. Tunggu satu menit lalu coba lagi.';
    case 'INCOMPATIBLE_PROTOCOL':
      return 'Versi aplikasi berbeda dengan host. Samakan versi Konvoi di kedua HP.';
    case 'INVALID_REQUEST':
      return 'Permintaan bergabung tidak valid. Periksa ID ruangan dan coba lagi.';
    default:
      return state.rejection?.message ?? 'Host menolak permintaan bergabung.';
  }
}

/**
 * App-level controller: owns the live host/guest sessions, mDNS discovery and
 * advertising, and navigation. Native modules are only touched when the user
 * actually starts a room or a scan, so the UI stays testable.
 */
export function useRoomApp(): RoomApp {
  const [screen, setScreen] = useState<ScreenName>('home');
  const [host, setHost] = useState<HostRoomInfo | null>(null);
  const [guest, setGuest] = useState<GuestRoomInfo | null>(null);
  const [room, setRoom] = useState<ClientRoomState | null>(null);
  const [rooms, setRooms] = useState<DiscoveredRoom[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
    const [locationSharingActive, setLocationSharingActive] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const startVoiceRef = useRef<() => Promise<void>>(async () => {});
  const startLocationSharingRef = useRef<() => Promise<void>>(async () => {});
  const triggerAutoReconnectRef = useRef<() => void>(() => {});
  const joinRoomRef = useRef<(input: JoinRoomInput) => Promise<void>>(async () => {});
  const reconnectingRef = useRef(false);
  const lastJoinedRef = useRef<{
    displayName: string;
    pin: string;
    host: string;
    port: string;
    roomId?: string;
    voiceWasActive?: boolean;
    locationWasActive?: boolean;
  } | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);
  const [peerStates, setPeerStates] = useState<Record<string, VoicePeerState>>(
    {},
  );

  const hostSessionRef = useRef<HostTcpSession | null>(null);
  const guestSessionRef = useRef<GuestTcpSession | null>(null);
  const advertiserRef = useRef<RoomAdvertiser | null>(null);
  const discoveryRef = useRef<RoomDiscovery | null>(null);
  const voiceRef = useRef<VoiceManager | null>(null);
  const joinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingHostRef = useRef(false);
  const mountedRef = useRef(true);

  const clearJoinTimer = useCallback(() => {
    if (joinTimerRef.current !== null) {
      clearTimeout(joinTimerRef.current);
      joinTimerRef.current = null;
    }
  }, []);

  /** Stop the mic and peers. `notify` also tells the room we left voice. */
  const stopVoice = useCallback((notify: boolean) => {
    const manager = voiceRef.current;
    voiceRef.current = null;
    manager?.stop();
    setVoiceActive(false);
    setPeerStates({});

    if (!notify) {
      return;
    }
    hostSessionRef.current?.room.leaveVoice();
    guestSessionRef.current?.session.leaveVoice();
  }, []);

  const stopDiscovery = useCallback(() => {
    const discovery = discoveryRef.current;
    discoveryRef.current = null;
    discovery?.stop();
    setScanning(false);
    setRooms([]);
  }, []);

  const stopAdvertiser = useCallback(() => {
    const advertiser = advertiserRef.current;
    advertiserRef.current = null;
    advertiser?.stop().catch(() => {});
  }, []);

  const startForegroundNotification = useCallback(
    (title: string, message: string) => {
      if (
        Platform.OS === 'android' &&
        NativeModules.KonvoiLocationModule?.startForegroundService
      ) {
        NativeModules.KonvoiLocationModule.startForegroundService(
          title,
          message,
        ).catch(() => {});
      }
    },
    [],
  );

  const stopForegroundNotification = useCallback(() => {
    if (
      Platform.OS === 'android' &&
      NativeModules.KonvoiLocationModule?.stopForegroundService
    ) {
      NativeModules.KonvoiLocationModule.stopForegroundService().catch(() => {});
    }
  }, []);

  const disposeGuest = useCallback(() => {
    stopForegroundNotification();
    locationService.stopTracking();
    setLocationSharingActive(false);
    clearJoinTimer();
      clearReconnectTimer();
    stopVoice(false);
    const session = guestSessionRef.current;
    guestSessionRef.current = null;
    session?.close();
  }, [clearJoinTimer, clearReconnectTimer, stopForegroundNotification, stopVoice]);

  const disposeHost = useCallback(() => {
    stopForegroundNotification();
    clearReconnectTimer();
    locationService.stopTracking().catch(() => {});
    setLocationSharingActive(false);
    const session = hostSessionRef.current;
    hostSessionRef.current = null;
    stopVoice(false);
    closingHostRef.current = true;
    try {
      session?.stop();
    } finally {
      closingHostRef.current = false;
    }
    stopAdvertiser();
  }, [clearReconnectTimer, stopAdvertiser, stopForegroundNotification, stopVoice]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearJoinTimer();
      voiceRef.current?.stop();
      voiceRef.current = null;
      guestSessionRef.current?.close();
      guestSessionRef.current = null;
      hostSessionRef.current?.stop();
      hostSessionRef.current = null;
      advertiserRef.current?.stop().catch(() => {});
      advertiserRef.current = null;
      discoveryRef.current?.stop();
      discoveryRef.current = null;
    };
  }, [clearJoinTimer]);

  const navigate = useCallback(
    (next: ScreenName) => {
      setError(null);
      setScreen(next);
      if (next !== 'join') {
        stopDiscovery();
      }
    },
    [stopDiscovery],
  );

  const goBack = useCallback(() => {
    setError(null);
    setScreen(current => {
      if (current === 'home' || current === 'host') {
        return current;
      }
      if (current === 'room') {
        return hostSessionRef.current ? 'host' : 'home';
      }
      if (current === 'map') {
        return hostSessionRef.current ? 'host' : 'room';
      }
      return 'home';
    });
    stopDiscovery();
  }, [stopDiscovery]);

  const handleHostState = useCallback(
    (state: ClientRoomState) => {
      if (!mountedRef.current) {
        return;
      }
      setRoom(state);
      if (state.status !== 'closed') {
        return;
      }
      // A stop triggered from `disposeHost` (failed start, leave, unmount)
      // already handles navigation and notices.
      const alreadyClosing = closingHostRef.current;
      disposeHost();
      setHost(null);
      setGuest(null);
      setRoom(null);
      if (!alreadyClosing) {
        setNotice('Ruangan ditutup.');
        setScreen('home');
      }
    },
    [disposeHost],
  );

  const handleGuestState = useCallback(
    (state: ClientRoomState) => {
      if (!mountedRef.current) {
        return;
      }
      setRoom(state);

      switch (state.status) {
        case 'joined':
          clearJoinTimer();
          clearReconnectTimer();
          reconnectingRef.current = false;
          setReconnecting(false);
          setBusy(false);
          setScreen('room');
          startForegroundNotification(
            'Konvoi Terhubung',
            `Terhubung di rombongan ${state.roomName}`,
          );
          if (lastJoinedRef.current?.voiceWasActive) {
            startVoiceRef.current().catch(() => {});
          }
          if (lastJoinedRef.current?.locationWasActive) {
            startLocationSharingRef.current().catch(() => {});
          }
          break;

        case 'rejected':
          clearJoinTimer();
          setBusy(false);
          setError(joinRejectionText(state));
          disposeGuest();
          setGuest(null);
          setScreen('join');
          break;

        case 'kicked':
          clearJoinTimer();
          setBusy(false);
          setError('Anda dikeluarkan dari ruangan oleh host.');
          disposeGuest();
          setGuest(null);
          setRoom(null);
          setScreen('join');
          break;

        case 'closed':
          clearJoinTimer();
          setBusy(false);
          setError('Host menutup ruangan.');
          disposeGuest();
          setGuest(null);
          setRoom(null);
          setScreen('join');
          break;

        case 'disconnected':
          clearJoinTimer();
          setBusy(false);
          stopVoice(false);
          locationService.stopTracking().catch(() => {});
          setLocationSharingActive(false);

          if (lastJoinedRef.current && mountedRef.current) {
            reconnectingRef.current = true;
            setReconnecting(true);
            setNotice(
              'Sinyal Wi-Fi terputus. Konvoi akan otomatis menyambung kembali saat mendekati host…',
            );
            const sess = guestSessionRef.current;
            guestSessionRef.current = null;
            sess?.close();
            triggerAutoReconnectRef.current();
          } else {
            setError(
              'Koneksi terputus. Pastikan kedua HP berada di Wi-Fi/hotspot yang sama, lalu coba lagi.',
            );
            disposeGuest();
            setGuest(null);
            setRoom(null);
            setScreen('join');
          }
          break;

        default:
          break;
      }
    }, [clearJoinTimer, clearReconnectTimer, disposeGuest, startForegroundNotification, stopVoice]);

  const voiceRosterIds = useMemo(
    () => (room?.voiceParticipants ?? []).map(entry => entry.participantId),
    [room?.voiceParticipants],
  );

  const startVoice = useCallback(async () => {
    if (lastJoinedRef.current) lastJoinedRef.current.voiceWasActive = true;
    if (voiceRef.current || !room || room.status !== 'joined' || !room.selfId) {
      return;
    }
    if (
      room.voiceParticipants.filter(
        entry => entry.participantId !== room.selfId,
      ).length >= room.voiceCapacity
    ) {
      setError(
        'Kapasitas suara penuh. Keluar dari suara di HP lain atau tunggu sampai ada yang keluar.',
      );
      return;
    }

    setVoiceBusy(true);
    setError(null);

    let manager!: VoiceManager;
    manager = new VoiceManager({
      sendSignal: (targetId, signal) => {
        if (voiceRef.current !== manager) {
          return;
        }
        if (hostSessionRef.current) {
          hostSessionRef.current.room.sendVoiceSignal(targetId, signal);
        } else {
          guestSessionRef.current?.session.sendVoiceSignal(targetId, signal);
        }
      },
      onPeerState: (peerId, state) => {
        if (mountedRef.current && voiceRef.current === manager) {
          setPeerStates(current => ({ ...current, [peerId]: state }));
        }
      },
      onError: message => {
        if (mountedRef.current && voiceRef.current === manager) {
          setError(message);
        }
      },
      onEnded: () => {
        if (voiceRef.current !== manager) {
          return;
        }
        voiceRef.current = null;
        setVoiceActive(false);
        setPeerStates({});
        hostSessionRef.current?.room.leaveVoice();
        guestSessionRef.current?.session.leaveVoice();
      },
    });

    if (Platform.OS === 'android') {
      try {
        if (Platform.Version >= 33) {
          await PermissionsAndroid.request(
            'android.permission.POST_NOTIFICATIONS' as any,
          );
        }
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Izin Mikrofon',
            message: 'Konvoi membutuhkan mikrofon untuk komunikasi suara antar-pengendara.',
            buttonPositive: 'Izinkan',
            buttonNegative: 'Batal',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setVoiceBusy(false);
          setError('Izin mikrofon ditolak. Aktifkan izin mikrofon di pengaturan HP untuk berbicara.');
          return;
        }
      } catch {}
    }

    if (Platform.OS === 'android' && NativeModules.KonvoiLocationModule?.setSpeakerphoneOn) {
      try {
        await NativeModules.KonvoiLocationModule.setSpeakerphoneOn(true);
      } catch {}
    }

    voiceRef.current = manager;

    // Join voice in room engine BEFORE manager.start() so member.voice is TRUE
    // and WebRTC offers/candidates are not rejected with NOT_IN_VOICE
    if (hostSessionRef.current) {
      hostSessionRef.current.room.joinVoice();
    } else {
      guestSessionRef.current?.session.joinVoice();
    }

    try {
      const started = await manager.start(
        room.selfId,
        room.voiceParticipants.map(entry => entry.participantId),
      );
      if (!started || !mountedRef.current || voiceRef.current !== manager) {
        manager.stop();
        if (voiceRef.current === manager) {
          voiceRef.current = null;
        }
        if (hostSessionRef.current) {
          hostSessionRef.current.room.leaveVoice();
        } else {
          guestSessionRef.current?.session.leaveVoice();
        }
        return;
      }
      
      startForegroundNotification(
        'Konvoi Interkom Aktif',
        'Terhubung dalam rombongan · Interkom suara aktif',
      );
      manager.stop();
      if (voiceRef.current === manager) {
        voiceRef.current = null;
      }
      if (hostSessionRef.current) {
        hostSessionRef.current.room.leaveVoice();
      } else {
        guestSessionRef.current?.session.leaveVoice();
      }
      if (mountedRef.current) {
        setError(
          'Mikrofon tidak bisa diaktifkan. Beri izin mikrofon untuk Konvoi di pengaturan HP, lalu coba lagi.',
        );
      }
    } finally {
      if (mountedRef.current) {
        setVoiceBusy(false);
      }
    }
  }, [room, startForegroundNotification]);

  const leaveVoice = useCallback(() => {
    stopVoice(true);
    if (room?.roomName) {
      startForegroundNotification('Konvoi Terhubung', 'Terhubung di rombongan ' + (room?.roomName ?? ''),
      );
    } else {
      stopForegroundNotification();
    }
  }, [room?.roomName, startForegroundNotification, stopForegroundNotification, stopVoice]);

  const toggleMute = useCallback(() => {
    if (!voiceRef.current || !room?.selfId) {
      return;
    }
    const current =
      room.voiceParticipants.find(entry => entry.participantId === room.selfId)
        ?.muted ?? false;
    const next = !current;
    voiceRef.current.setMuted(next);
    if (hostSessionRef.current) {
      hostSessionRef.current.room.setMuted(next);
    } else {
      guestSessionRef.current?.session.setMuted(next);
    }
  }, [room]);

  useEffect(() => {
    if (!voiceActive) {
      return;
    }
    voiceRef.current?.syncPeers(voiceRosterIds);
  }, [voiceActive, voiceRosterIds]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background' || state === 'inactive') {
        if (voiceRef.current) {
          startForegroundNotification(
            'Konvoi Interkom Aktif',
            'Suara dan koneksi rombongan tetap aktif di latar belakang',
          );
        } else if (room?.status === 'joined') {
          startForegroundNotification('Konvoi Terhubung', 'Terhubung di rombongan ' + (room?.roomName ?? ''),
          );
        }
      }
    });
    return () => subscription.remove();
  }, [room?.roomName, room?.status, startForegroundNotification]);

  const createRoom = useCallback(
    async (input: CreateRoomInput) => {
      const displayNameError = validateDisplayName(input.displayName);
      if (displayNameError) {
        setError(displayNameError);
        return;
      }
      const roomNameError = validateRoomName(input.roomName);
      if (roomNameError) {
        setError(roomNameError);
        return;
      }

      setBusy(true);
      setError(null);
      setNotice(null);

      const roomId = generateRoomId();
      const pin = generatePin();
      const config = {
        roomId,
        roomName: input.roomName.trim(),
        pin,
        hostDisplayName: input.displayName.trim(),
      };

      const session = new HostTcpSession({
        config,
        handlers: {
          onStateChange: handleHostState,
          onVoiceSignal: message => {
            voiceRef.current?.handleSignal(message.fromId, message.signal);
          },
          onClosed: () => {
            // handleHostState already navigates home; this keeps parity with
            // future host-side callbacks that only report the reason.
          },
          onError: () => {
            if (mountedRef.current) {
              setError(
                'Server lokal gagal berjalan. Tutup aplikasi lain yang memakai port, lalu coba lagi.',
              );
            }
          },
        },
      });
      hostSessionRef.current = session;

      try {
        const port = await session.start(0);
        if (!mountedRef.current) {
          session.stop();
          return;
        }

        let advertised = false;
        const advertiser = new RoomAdvertiser({
          onError: message => {
            if (mountedRef.current) {
              setNotice(message);
            }
          },
        });
        advertiserRef.current = advertiser;
        try {
          await advertiser.start({
            roomId,
            roomName: config.roomName,
            port,
            pin,
          });
          advertised = true;
        } catch {
          // Manual IP/port/PIN remains available.
        }

        setHost({
          roomId,
          roomName: config.roomName,
          pin,
          port,
          advertised,
        });
        setGuest(null);
        
        startForegroundNotification('Konvoi Host Aktif', 'Ruangan ' + config.roomName + ' aktif sebagai host',
        );
        disposeHost();
        setHost(null);
        setRoom(null);
        setError(
          'Tidak bisa membuka server lokal. Pastikan Wi-Fi/hotspot aktif, lalu coba lagi.',
        );
      } finally {
        if (mountedRef.current) {
          setBusy(false);
        }
      }
    },
    [disposeHost, handleHostState, startForegroundNotification],
  );

  const joinRoom = useCallback(
    async (input: JoinRoomInput) => {
      const displayNameError = validateDisplayName(input.displayName);
      if (displayNameError) {
        setError(displayNameError);
        return;
      }
      if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(input.pin.trim())) {
        setError(`PIN harus ${PIN_LENGTH} angka.`);
        return;
      }
      const hostAddress = input.host.trim();
      if (hostAddress.length === 0 || /\s/.test(hostAddress)) {
        setError('Alamat IP host tidak valid.');
        return;
      }
      const port = parsePort(input.port);
      if (port === null) {
        setError('Port harus angka 1-65535.');
        return;
      }

      disposeGuest();
      setBusy(true);
      setError(null);
      setNotice(null);
      setRoom(null);

      let session: GuestTcpSession;
      try {
        session = new GuestTcpSession({
          host: hostAddress,
          port,
          connectTimeoutMs: JOIN_TIMEOUT_MS,
          handlers: {
            onStateChange: handleGuestState,
            onVoiceSignal: message => {
              voiceRef.current?.handleSignal(message.fromId, message.signal);
            },
            onTransportError: () => {
              // The state change to `disconnected` carries the user-facing text.
            },
          },
        });
      } catch {
        setBusy(false);
        setGuest(null);
        setError(
          'Tidak bisa membuka koneksi. Periksa alamat IP dan port host.',
        );
        return;
      }
      guestSessionRef.current = session;
      setGuest({ host: hostAddress, port });

      joinTimerRef.current = setTimeout(() => {
        joinTimerRef.current = null;
        if (!mountedRef.current) {
          return;
        }
        const status = guestSessionRef.current?.session.getState().status;
        if (status !== 'joined') {
          setBusy(false);
          setError(
            'Tidak ada jawaban dari host. Periksa IP/port, PIN, dan pastikan kedua HP di Wi-Fi yang sama.',
          );
          disposeGuest();
          setGuest(null);
        }
      }, JOIN_TIMEOUT_MS);

      lastJoinedRef.current = {
        displayName: input.displayName.trim(),
        pin: input.pin.trim().length === PIN_LENGTH ? input.pin.trim() : '000000',
        host: hostAddress,
        port: String(port),
        roomId: input.roomId,
        voiceWasActive: voiceActive,
        locationWasActive: locationSharingActive,
      };

      session.join({
        displayName: input.displayName.trim(),
        pin: input.pin.trim().length === PIN_LENGTH ? input.pin.trim() : '000000',
        ...(input.roomId ? { roomId: input.roomId } : {}),
      });
    },
    [disposeGuest, handleGuestState, locationSharingActive, voiceActive],
  );

  const leaveRoom = useCallback(async () => {
    clearJoinTimer();
    clearReconnectTimer();
    reconnectingRef.current = false;
    setReconnecting(false);
    lastJoinedRef.current = null;
    const wasHost = hostSessionRef.current !== null;
    if (wasHost) {
      disposeHost();
      setHost(null);
    } else {
      disposeGuest();
      setGuest(null);
    }
    setRoom(null);
    setBusy(false);
    setScreen('home');
    setNotice(wasHost ? 'Ruangan ditutup.' : 'Anda keluar dari ruangan.');
  }, [clearJoinTimer, clearReconnectTimer, disposeGuest, disposeHost]);

  const closeRoom = useCallback(() => {
    const session = hostSessionRef.current;
    if (!session) {
      return;
    }
    session.room.closeRoom();
  }, []);

  const kick = useCallback((participantId: string) => {
    hostSessionRef.current?.room.kick(participantId);
  }, []);

    const startDiscovery = useCallback(async () => {
    if (discoveryRef.current) {
      return;
    }
    const discovery = new RoomDiscovery({
      onRoomsChanged: nextRooms => {
        if (mountedRef.current) {
          setRooms(nextRooms);
          if (reconnectingRef.current && lastJoinedRef.current) {
            const target = lastJoinedRef.current;
            const match = nextRooms.find(r => r.roomId === target.roomId);
            if (match) {
              target.host = match.host;
              target.port = String(match.port);
              if (match.pin) {
                target.pin = match.pin;
              }
              joinRoomRef.current({
                displayName: target.displayName,
                pin: target.pin,
                host: match.host,
                port: String(match.port),
                roomId: match.roomId,
              }).catch(() => {});
            }
          }
        }
      },
      onError: message => {
        if (mountedRef.current) {
          setError(message);
        }
      },
    });
    discoveryRef.current = discovery;
    setScanning(true);
    const started = await discovery.start();
    if (!mountedRef.current || discoveryRef.current !== discovery) {
      return;
    }
    setScanning(started);
  }, []);

  const triggerAutoReconnect = useCallback(() => {
    clearReconnectTimer();
    reconnectTimerRef.current = setTimeout(async () => {
      if (!mountedRef.current || !lastJoinedRef.current || !reconnectingRef.current) {
        return;
      }
      const target = lastJoinedRef.current;
      startDiscovery().catch(() => {});
      try {
        await joinRoomRef.current({
          displayName: target.displayName,
          pin: target.pin,
          host: target.host,
          port: target.port,
          roomId: target.roomId,
        });
      } catch {
        if (mountedRef.current && lastJoinedRef.current && reconnectingRef.current) {
          triggerAutoReconnect();
        }
      }
    }, 3500);
  }, [clearReconnectTimer, startDiscovery]);

    const startLocationSharing = useCallback(async () => {
    if (lastJoinedRef.current) lastJoinedRef.current.locationWasActive = true;
    if (!room || room.status !== 'joined' || !room.selfId) {
      return;
    }
    const started = await locationService.startTracking(location => {
      if (hostSessionRef.current) {
        hostSessionRef.current.room.sendLocation(location);
      } else {
        guestSessionRef.current?.session.sendLocation(location);
      }
    });
    if (started) {
      setLocationSharingActive(true);
      if (hostSessionRef.current) {
        hostSessionRef.current.room.setLocationSharing(true);
      } else {
        guestSessionRef.current?.session.setLocationSharing(true);
      }
    } else {
      setError('Izin GPS ditolak atau GPS tidak aktif. Aktifkan GPS untuk berbagi lokasi.');
    }
  }, [room]);

  const stopLocationSharing = useCallback(() => {
    locationService.stopTracking();
    setLocationSharingActive(false);
    if (hostSessionRef.current) {
      hostSessionRef.current.room.stopLocationSharing();
    } else {
      guestSessionRef.current?.session.stopLocationSharing();
    }
  }, []);

  const refreshDiscovery = useCallback(async () => {
    stopDiscovery();
    await startDiscovery();
  }, [startDiscovery, stopDiscovery]);

  const dismissError = useCallback(() => setError(null), []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  return {
    screen,
    host,
    guest,
    room,
    rooms,
    scanning,
    busy,
    error,
    notice,
    voiceActive,
    voiceBusy,
    peerStates,
    navigate,
    goBack,
    createRoom,
    joinRoom,
    leaveRoom,
    closeRoom,
    kick,
    startVoice,
    leaveVoice,
    toggleMute,
    startDiscovery,
    refreshDiscovery,
    stopDiscovery,
    dismissError,
    dismissNotice,
    locationSharingActive,
    reconnecting,
    startLocationSharing,
    stopLocationSharing,
  };
}
