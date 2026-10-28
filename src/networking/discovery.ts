import Zeroconf, {
  type Service,
  type ZeroconfError,
} from 'react-native-zeroconf';
import { PROTOCOL_VERSION } from '../protocol/protocolVersion';

/**
 * mDNS advertising and discovery for `_konvoi._tcp`.
 *
 * The PIN is never advertised. TXT records carry only the room ID and room
 * name; the PIN still has to be typed by the guest.
 */
export const KONVOI_SERVICE_TYPE = 'konvoi';
export const KONVOI_SERVICE_PROTOCOL = 'tcp';

export interface DiscoveredRoom {
  /** Unique mDNS instance name, used as a list key. */
  key: string;
  roomId: string;
  roomName: string;
  protocolVersion: number | null;
  host: string;
  port: number;
  addresses: string[];
  pin?: string;
}

export interface RoomDiscoveryHandlers {
  onRoomsChanged?: (rooms: DiscoveredRoom[]) => void;
  onError?: (message: string) => void;
}

function describeZeroconfError(error: ZeroconfError): string {
  const code = String(error.code);
  if (code === '-65555') {
    return 'Layanan Bonjour belum terdaftar di Info.plist. Pencarian otomatis tidak aktif.';
  }
  if (code === '-65570') {
    return 'Izin jaringan lokal ditolak. Aktifkan di Pengaturan iOS, atau masukkan IP manual.';
  }
  if (code === 'TIMEOUT') {
    return 'Pencarian mDNS timeout. Coba lagi atau masukkan IP host manual.';
  }
  return 'Pencarian mDNS gagal. Masukkan IP host dan port secara manual.';
}

function isUsableHostAddress(address?: string): boolean {
  if (!address) {
    return false;
  }
  const clean = address.trim();
  if (
    clean === '127.0.0.1' ||
    clean.startsWith('127.') ||
    clean === '::1' ||
    clean.toLowerCase().startsWith('fe80:')
  ) {
    return false;
  }
  return true;
}

export function toDiscoveredRoom(service: Service): DiscoveredRoom | null {
  const ipv4List = Array.isArray(service.ipv4) ? service.ipv4 : [];
  const addressesList = Array.isArray(service.addresses) ? service.addresses : [];
  const allAddresses = ipv4List.length > 0 ? ipv4List : addressesList;

  // Filter out loopback and link-local addresses
  const usableIpv4 = ipv4List.filter(isUsableHostAddress);
  const usableAll = addressesList.filter(isUsableHostAddress);
  const hostCandidates = usableIpv4.length > 0 ? usableIpv4 : usableAll;

  const host =
    hostCandidates[0] ??
    (isUsableHostAddress(service.host) ? service.host : null) ??
    allAddresses[0] ??
    service.host;

  if (!host || !Number.isInteger(service.port) || service.port <= 0) {
    return null;
  }

  const txt = service.txt ?? {};
  const rawProtocol = txt.proto;
  const protocolVersion =
    typeof rawProtocol === 'number'
      ? rawProtocol
      : typeof rawProtocol === 'string' && /^\d+$/.test(rawProtocol)
      ? Number(rawProtocol)
      : null;

  return {
    key: service.name,
    roomId: typeof txt.room === 'string' ? txt.room : '',
    roomName:
      typeof txt.name === 'string' && txt.name.length > 0
        ? txt.name
        : service.name,
    protocolVersion,
    host,
    port: service.port,
    addresses: allAddresses,
    ...(typeof txt.pin === 'string' && txt.pin.length > 0 ? { pin: txt.pin } : {}),
  };
}

export class RoomDiscovery {
  private readonly zeroconf = new Zeroconf();
  private readonly rooms = new Map<string, DiscoveredRoom>();
  private scanning = false;
  private stopped = false;

  constructor(private readonly handlers: RoomDiscoveryHandlers = {}) {
    this.zeroconf.on('resolved', this.handleResolved);
    this.zeroconf.on('remove', this.handleRemove);
    this.zeroconf.on('error', this.handleError);
  }

  /** Resolves false when local-network access is denied or the scan fails. */
  async start(): Promise<boolean> {
    if (this.scanning) {
      return true;
    }
    if (this.stopped) {
      return false;
    }

    try {
      const access = await this.zeroconf.checkLocalNetworkAccess({
        type: KONVOI_SERVICE_TYPE,
        protocol: KONVOI_SERVICE_PROTOCOL,
      });
      if (this.stopped) {
        return false;
      }
      if (access === 'denied') {
        this.handlers.onError?.(
          'Izin jaringan lokal ditolak. Aktifkan di Pengaturan, atau masukkan IP manual.',
        );
        return false;
      }
    } catch {
      // Older platforms may not implement the check; scanning can still work.
    }

    if (this.stopped) {
      return false;
    }

    try {
      this.zeroconf.scan({
        type: KONVOI_SERVICE_TYPE,
        protocol: KONVOI_SERVICE_PROTOCOL,
      });
      this.scanning = true;
      return true;
    } catch {
      this.handlers.onError?.(
        'Pencarian mDNS gagal dimulai. Masukkan IP host dan port secara manual.',
      );
      return false;
    }
  }

  stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    if (this.scanning) {
      try {
        this.zeroconf.stop();
      } catch {
        // Already stopped.
      }
      this.scanning = false;
    }
    this.rooms.clear();
    this.zeroconf.removeAllListeners();
    this.zeroconf.removeDeviceListeners();
  }

  getRooms(): DiscoveredRoom[] {
    return Array.from(this.rooms.values());
  }

  private handleResolved = (service: Service): void => {
    const room = toDiscoveredRoom(service);
    if (!room) {
      return;
    }
    this.rooms.set(room.key, room);
    this.emitRooms();
  };

  private handleRemove = (name: string): void => {
    if (this.rooms.delete(name)) {
      this.emitRooms();
    }
  };

  private handleError = (error: ZeroconfError): void => {
    this.handlers.onError?.(describeZeroconfError(error));
  };

  private emitRooms(): void {
    this.handlers.onRoomsChanged?.(this.getRooms());
  }
}

export interface RoomAdvertisement {
  roomId: string;
  roomName: string;
  port: number;
  pin?: string;
}

export interface RoomAdvertiserHandlers {
  onError?: (message: string) => void;
}

/** Advertise the host's room while it is open. */
export class RoomAdvertiser {
  private readonly zeroconf = new Zeroconf();
  private serviceName: string | null = null;
  private stopped = false;

  constructor(private readonly handlers: RoomAdvertiserHandlers = {}) {}

  async start(advertisement: RoomAdvertisement): Promise<void> {
    if (this.serviceName || this.stopped) {
      return;
    }
    try {
      const service = await this.zeroconf.publishService({
        type: KONVOI_SERVICE_TYPE,
        protocol: KONVOI_SERVICE_PROTOCOL,
        name: `Konvoi-${advertisement.roomId}`,
        port: advertisement.port,
        txt: {
          room: advertisement.roomId,
          name: advertisement.roomName,
          proto: PROTOCOL_VERSION,
          ...(advertisement.pin ? { pin: advertisement.pin } : {}),
        },
      });
      if (this.stopped) {
        try {
          await this.zeroconf.unpublishService(service.name);
        } catch {
          // Already gone.
        }
        this.removeListeners();
        return;
      }
      this.serviceName = service.name;
    } catch {
      this.handlers.onError?.(
        'Ruangan aktif, tetapi pengumuman mDNS gagal. Tamu masih bisa memakai IP dan port manual.',
      );
      this.removeListeners();
      throw new Error('mDNS publish failed');
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) {
      return;
    }
    this.stopped = true;

    const serviceName = this.serviceName;
    this.serviceName = null;
    if (serviceName) {
      try {
        await this.zeroconf.unpublishService(serviceName);
      } catch {
        // The service may already be gone.
      }
    }
    this.removeListeners();
  }

  private removeListeners(): void {
    this.zeroconf.removeAllListeners();
    this.zeroconf.removeDeviceListeners();
  }
}
