import {
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import type { SharedLocation } from '../protocol/messageTypes';

const { KonvoiLocationModule } = NativeModules;

interface LocationEventPayload {
  lat: number;
  lon: number;
  accuracy: number;
  speed?: number;
  heading?: number;
  capturedAt?: number;
}

export class LocationService {
  private listener: { remove: () => void } | null = null;
  private active = false;

  get isActive(): boolean {
    return this.active;
  }

  async requestPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }
    try {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]);
      const fineGranted =
        results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
        PermissionsAndroid.RESULTS.GRANTED;
      const coarseGranted =
        results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] ===
        PermissionsAndroid.RESULTS.GRANTED;
      return fineGranted || coarseGranted;
    } catch {
      return false;
    }
  }

  async startTracking(
    onLocation: (location: SharedLocation) => void,
  ): Promise<boolean> {
    if (this.active) {
      return true;
    }

    const hasPermission = await this.requestPermission();
    if (!hasPermission) {
      return false;
    }

    if (!KonvoiLocationModule) {
      if (Platform.OS === 'ios') {
        // Real iOS device: no native location module yet. Do not fake an
        // active GPS state — the UI must not claim we are broadcasting.
        return false;
      }
      // Test/non-Android environment: stay active without a native crash.
      this.active = true;
      return true;
    }

    const emitter = new NativeEventEmitter(KonvoiLocationModule);
    this.listener = emitter.addListener('KonvoiLocationUpdate', (...args: unknown[]) => {
      const data = args[0] as LocationEventPayload | undefined;
      if (!data || typeof data.lat !== 'number' || typeof data.lon !== 'number') {
        return;
      }
      const location: SharedLocation = {
        lat: data.lat,
        lon: data.lon,
        accuracy: data.accuracy ?? 10,
        capturedAt: data.capturedAt ?? Date.now(),
        ...(typeof data.speed === 'number' ? { speed: data.speed } : {}),
        ...(typeof data.heading === 'number' ? { heading: data.heading } : {}),
      };
      onLocation(location);
    });

    try {
      await KonvoiLocationModule.startLocationUpdates(3000, 5);
      this.active = true;
      return true;
    } catch {
      this.listener?.remove();
      this.listener = null;
      return false;
    }
  }

  async stopTracking(): Promise<void> {
    this.active = false;
    if (this.listener) {
      this.listener.remove();
      this.listener = null;
    }
    if (KonvoiLocationModule?.stopLocationUpdates) {
      try {
        await KonvoiLocationModule.stopLocationUpdates();
      } catch {}
    }
  }
}

export const locationService = new LocationService();
