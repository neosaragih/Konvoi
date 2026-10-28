import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppBanners } from '../components/AppBanners';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { KonvoiMap, type MapMarkerItem } from '../components/KonvoiMap';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { LOCATION_STALE_AFTER_MS } from '../protocol/protocolVersion';
import type { RoomApp } from '../state/useRoomApp';
import { colors, spacing } from '../theme/theme';

interface LiveMapScreenProps {
  app: RoomApp;
}

function clockTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function LiveMapScreen({ app }: LiveMapScreenProps) {
  const room = app.room;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  const selfLocation = useMemo(() => {
    if (!room?.selfId) return null;
    return room.locations[room.selfId]?.location ?? null;
  }, [room?.selfId, room?.locations]);

  const markers: MapMarkerItem[] = useMemo(() => {
    if (!room) {
      return [];
    }
    const list: MapMarkerItem[] = [];
    for (const participant of room.participants) {
      const entry = room.locations[participant.id];
      if (
        entry &&
        typeof entry.location?.lat === 'number' &&
        typeof entry.location?.lon === 'number'
      ) {
        const isSelf = participant.id === room.selfId;
        let distanceMeters: number | undefined;
        if (!isSelf && selfLocation) {
          distanceMeters = calculateDistanceMeters(
            selfLocation.lat,
            selfLocation.lon,
            entry.location.lat,
            entry.location.lon,
          );
        }
        list.push({
          id: participant.id,
          name: participant.displayName,
          lat: entry.location.lat,
          lon: entry.location.lon,
          accuracy: entry.location.accuracy || 10,
          speed: entry.location.speed,
          heading: entry.location.heading,
          isSelf,
          distanceMeters,
        });
      }
    }
    return list;
  }, [room, selfLocation]);

  if (!room) {
    return (
      <Screen>
        <ScreenHeader
          title="Peta Langsung"
          subtitle="Tidak ada ruangan aktif."
          onBack={app.goBack}
        />
        <Button label="Kembali ke Ruangan" onPress={app.goBack} />
      </Screen>
    );
  }

  const sharingCount = Object.keys(room.locations).length;

  return (
    <Screen>
      <ScreenHeader
        title="Peta Konvoi"
        subtitle={`${sharingCount} dari ${room.participants.length} anggota membagikan lokasi GPS`}
        onBack={app.goBack}
        right={
          <Badge
            label={app.locationSharingActive ? 'GPS Aktif' : 'GPS Mati'}
            tone={app.locationSharingActive ? 'success' : 'neutral'}
          />
        }
      />

      <AppBanners
        error={app.error}
        notice={app.notice}
        onDismissError={app.dismissError}
        onDismissNotice={app.dismissNotice}
      />

      <Card style={styles.card}>
        <KonvoiMap markers={markers} />
        <View style={styles.attribution}>
          <Text style={styles.mapTitle}>
            Peta offline belum tersedia paket unduhan khusus, peta live memakai
            OpenStreetMap & CARTO bergaya Google Maps.
          </Text>
        </View>
      </Card>

      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Jarak Antar-Motor (Distance)</Text>
          <Badge
            label={
              app.locationSharingActive ? 'Memancarkan GPS' : 'GPS Nonaktif'
            }
            tone={app.locationSharingActive ? 'success' : 'warning'}
          />
        </View>
        <Text style={styles.sectionBody}>
          Jarak dihitung secara akurat antar-motor rombongan. Memudahkan
          memantau peserta yang tertinggal di jalan.
        </Text>

        {room.participants.map(participant => {
          const entry = room.locations[participant.id];
          const sharing = room.locationSharing[participant.id] === true;
          const stale =
            entry !== undefined &&
            now - entry.receivedAt > LOCATION_STALE_AFTER_MS;

          let distanceMeters: number | null = null;
          if (
            participant.id !== room.selfId &&
            selfLocation &&
            entry?.location
          ) {
            distanceMeters = calculateDistanceMeters(
              selfLocation.lat,
              selfLocation.lon,
              entry.location.lat,
              entry.location.lon,
            );
          }

          return (
            <View key={participant.id} style={styles.locationRow}>
              <View style={styles.locationBody}>
                <View style={styles.nameRow}>
                  <Text style={styles.locationName}>
                    {participant.displayName}
                    {participant.id === room.selfId ? ' (Anda)' : ''}
                  </Text>
                  {distanceMeters !== null ? (
                    <Badge
                      label={`Jarak: ${formatDistance(distanceMeters)}`}
                      tone={
                        distanceMeters > 500
                          ? 'warning'
                          : distanceMeters > 150
                          ? 'neutral'
                          : 'success'
                      }
                    />
                  ) : null}
                </View>
                {entry ? (
                  <>
                    <Text style={styles.locationMeta}>
                      {entry.location.lat.toFixed(5)},{' '}
                      {entry.location.lon.toFixed(5)} · akurasi{' '}
                      {Math.round(entry.location.accuracy)} m
                      {typeof entry.location.speed === 'number' &&
                      entry.location.speed > 0
                        ? ` · ${Math.round(entry.location.speed * 3.6)} km/j`
                        : ''}
                    </Text>
                    <Text style={styles.locationMeta}>
                      Diperbarui {clockTime(entry.receivedAt)}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.locationMeta}>
                    {sharing ? 'Menunggu GPS…' : 'Tidak membagikan lokasi'}
                  </Text>
                )}
              </View>
              <Badge
                label={
                  entry
                    ? stale
                      ? 'Basi'
                      : 'Terbaru'
                    : sharing
                    ? 'Menunggu'
                    : 'Nonaktif'
                }
                tone={entry ? (stale ? 'warning' : 'success') : 'neutral'}
              />
            </View>
          );
        })}
      </Card>

      <Button
        label={
          app.locationSharingActive
            ? 'Hentikan Berbagi Lokasi'
            : 'Mulai Berbagi Lokasi (GPS)'
        }
        variant={app.locationSharingActive ? 'secondary' : 'primary'}
        onPress={() => {
          if (app.locationSharingActive) {
            app.stopLocationSharing();
          } else {
            app.startLocationSharing();
          }
        }}
        style={styles.control}
      />
      <Text style={styles.footer}>
        Lokasi disimpan di memori ruangan saja dan dihapus saat berbagi
        dihentikan, peserta keluar, atau ruangan ditutup.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
  },
  attribution: {
    paddingTop: spacing.xs,
  },
  mapTitle: {
    color: colors.muted,
    fontSize: 11,
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  sectionBody: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: spacing.md,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  locationBody: {
    flex: 1,
    marginRight: spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
  },
  locationName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  locationMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  control: {
    marginBottom: spacing.sm,
  },
  footer: {
    color: colors.muted,
    fontSize: 11,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
});
