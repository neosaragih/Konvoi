import {
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';

const { KonvoiLocationModule } = NativeModules;

export interface ScannedJoinData {
  host: string;
  port: string;
  pin: string;
  roomId?: string;
  roomName?: string;
}

export function buildJoinQr(params: {
  host: string;
  port: number;
  pin: string;
  roomId: string;
  roomName: string;
}): string {
  const query = new URLSearchParams({
    host: params.host,
    port: String(params.port),
    pin: params.pin,
    room: params.roomId,
    name: params.roomName,
  });
  return `konvoi://join?${query.toString()}`;
}

export function parseJoinQr(qrString: string): ScannedJoinData | null {
  try {
    if (!qrString || typeof qrString !== 'string') {
      return null;
    }
    // Support URL format konvoi://join?... or https://konvoi.local/join?...
    let queryPart = qrString;
    const qIndex = qrString.indexOf('?');
    if (qIndex >= 0) {
      queryPart = qrString.slice(qIndex + 1);
    }
    const params = new URLSearchParams(queryPart);
    const host = params.get('host') || params.get('ip');
    const port = params.get('port');
    const pin = params.get('pin') || '000000';
    const roomId = params.get('room') || params.get('roomId') || undefined;
    const roomName = params.get('name') || params.get('roomName') || undefined;

    if (host && port) {
      return { host, port, pin, roomId, roomName };
    }

    // Support JSON format {"host":"...","port":...,"pin":"..."}
    if (qrString.trim().startsWith('{')) {
      const data = JSON.parse(qrString.trim());
      if (data && data.host && data.port) {
        return {
          host: String(data.host),
          port: String(data.port),
          pin: String(data.pin || '000000'),
          roomId: data.roomId || data.room,
          roomName: data.roomName || data.name,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function scanQrCode(): Promise<ScannedJoinData | null> {
  if (!KonvoiLocationModule?.scanQrCode) {
    throw new Error('Scanner kamera belum didukung di platform ini.');
  }

  // The native scanner needs the camera; ask before launching it so the
  // user gets one clear flow instead of a silent failure.
  if (Platform.OS === 'android') {
    try {
      const alreadyGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.CAMERA,
      );
      if (!alreadyGranted) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Izin Kamera',
            message: 'Konvoi membutuhkan kamera untuk memindai QR code ruangan.',
            buttonPositive: 'Izinkan',
            buttonNegative: 'Batal',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error(
            'Izin kamera ditolak. Masukkan IP, port, dan PIN secara manual.',
          );
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        throw err;
      }
      throw new Error('Gagal meminta izin kamera.');
    }
  }

  try {
    const raw: string = await KonvoiLocationModule.scanQrCode();
    if (!raw) {
      return null;
    }
    const parsed = parseJoinQr(raw);
    if (!parsed) {
      throw new Error('Format QR Code tidak valid untuk ruangan Konvoi.');
    }
    return parsed;
  } catch (err: unknown) {
    const msg = (err as Error)?.message || '';
    if (msg.includes('CANCELLED') || msg.includes('dibatalkan')) {
      return null;
    }
    throw err;
  }
}
