import type { Service } from 'react-native-zeroconf';
import { toDiscoveredRoom } from '../discovery';

describe('toDiscoveredRoom', () => {
  it('filters out loopback and link-local addresses, picking a usable LAN IP', () => {
    const service: Service = {
      name: 'Konvoi-r1',
      fullName: 'Konvoi-r1._konvoi._tcp.local.',
      host: 'phone.local.',
      port: 42000,
      addresses: ['fe80::1', '127.0.0.1', '10.100.19.77'],
      ipv4: ['127.0.0.1', '10.100.19.77'],
      ipv6: ['fe80::1'],
      txt: {
        room: 'r1',
        name: 'Tour Group',
        proto: '1',
      },
    };

    const room = toDiscoveredRoom(service);
    expect(room).not.toBeNull();
    expect(room?.host).toBe('10.100.19.77');
    expect(room?.port).toBe(42000);
    expect(room?.roomId).toBe('r1');
    expect(room?.roomName).toBe('Tour Group');
    expect(room?.protocolVersion).toBe(1);
  });

  it('falls back to service.host if addresses are missing or unparseable', () => {
    const service: Service = {
      name: 'Konvoi-r2',
      fullName: 'Konvoi-r2._konvoi._tcp.local.',
      host: '192.168.1.50',
      port: 5000,
      addresses: [],
      ipv4: [],
      ipv6: [],
      txt: {
        room: 'r2',
        name: 'Solo Room',
      },
    };

    const room = toDiscoveredRoom(service);
    expect(room).not.toBeNull();
    expect(room?.host).toBe('192.168.1.50');
    expect(room?.port).toBe(5000);
    expect(room?.roomId).toBe('r2');
  });

  it('returns null if port is invalid', () => {
    const service: Service = {
      name: 'Konvoi-r3',
      fullName: 'Konvoi-r3._konvoi._tcp.local.',
      host: '192.168.1.50',
      port: -1,
      addresses: ['192.168.1.50'],
      ipv4: ['192.168.1.50'],
      ipv6: [],
      txt: {},
    };

    expect(toDiscoveredRoom(service)).toBeNull();
  });
});
