import React, { useMemo } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  UIManager,
  View,
  type ViewStyle,
  requireNativeComponent,
} from 'react-native';
import { colors, radius, spacing } from '../theme/theme';

export interface MapMarkerItem {
  id: string;
  name: string;
  lat: number;
  lon: number;
  accuracy: number;
  isSelf: boolean;
  speed?: number;
  heading?: number;
  distanceMeters?: number;
}

interface KonvoiMapProps {
  markers: MapMarkerItem[];
  center?: { lat: number; lon: number; zoom?: number };
  style?: ViewStyle;
}

interface NativeMapProps {
  markersJson?: string;
  centerJson?: string;
  style?: ViewStyle;
}

const uiManagerAny = UIManager as unknown as {
  hasViewManagerConfig?: (name: string) => boolean;
  KonvoiMapView?: unknown;
};

const isNativeAvailable =
  Platform.OS === 'android' &&
  typeof UIManager !== 'undefined' &&
  (uiManagerAny.hasViewManagerConfig?.('KonvoiMapView') ??
    uiManagerAny.KonvoiMapView !== undefined);

let NativeKonvoiMap: React.ComponentType<NativeMapProps> | null = null;
if (isNativeAvailable) {
  try {
    NativeKonvoiMap = requireNativeComponent<NativeMapProps>('KonvoiMapView');
  } catch {
    NativeKonvoiMap = null;
  }
}

export function KonvoiMap({ markers, center, style }: KonvoiMapProps) {
  const markersJson = useMemo(() => JSON.stringify(markers), [markers]);
  const centerJson = useMemo(
    () => (center ? JSON.stringify(center) : undefined),
    [center],
  );

  if (NativeKonvoiMap) {
    return (
      <View style={[styles.container, style]}>
        <NativeKonvoiMap
          markersJson={markersJson}
          centerJson={centerJson}
          style={styles.nativeMap}
        />
      </View>
    );
  }

  // Graceful fallback for tests, iOS, or before WebView mount
  return (
    <View style={[styles.container, styles.fallbackContainer, style]}>
      <Text style={styles.fallbackTitle}>Peta Konvoi (OpenStreetMap)</Text>
      <Text style={styles.fallbackSubtitle}>
        Tampilan rute dan posisi GPS langsung antar-peserta konvoi
      </Text>
      <View style={styles.radarCard}>
        {markers.length > 0 ? (
          markers.map(item => (
            <View key={item.id} style={styles.markerBadge}>
              <Text style={[styles.markerText, item.isSelf && styles.selfText]}>
                {item.isSelf ? 'Anda' : item.name}:{' '}
                {item.lat.toFixed(5)}, {item.lon.toFixed(5)}
                {typeof item.distanceMeters === 'number'
                  ? ` · ${
                      item.distanceMeters < 1000
                        ? `${item.distanceMeters}m`
                        : `${(item.distanceMeters / 1000).toFixed(1)}km`
                    }`
                  : ''}
                {typeof item.speed === 'number' && item.speed > 0
                  ? ` · ${Math.round(item.speed * 3.6)} km/j`
                  : ''}{' '}
                (±{Math.round(item.accuracy)}m)
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.fallbackBody}>
            Belum ada koordinat GPS. Tekan &quot;Mulai Berbagi Lokasi&quot; untuk
            memancarkan posisi Anda di peta.
          </Text>
        )}
      </View>
      <Text style={styles.attribution}>
        © OpenStreetMap contributors © CARTO (Peta Sumber Terbuka)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 380,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  nativeMap: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: 380,
  },
  fallbackContainer: {
    padding: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
  },
  fallbackTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#38bdf8',
    marginBottom: spacing.xs,
  },
  fallbackSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  radarCard: {
    width: '100%',
    padding: spacing.sm,
    backgroundColor: '#1e293b',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#334155',
  },
  fallbackBody: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  markerBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    marginVertical: 3,
  },
  markerText: {
    fontSize: 12,
    color: '#bae6fd',
    fontWeight: '600',
  },
  selfText: {
    color: '#86efac',
  },
  attribution: {
    marginTop: spacing.md,
    fontSize: 10,
    color: colors.muted,
  },
});
