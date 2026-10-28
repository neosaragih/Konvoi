import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppBanners } from '../components/AppBanners';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { LOCATION_STALE_AFTER_MS } from '../protocol/protocolVersion';
import type { RoomApp } from '../state/useRoomApp';
import { colors, radius, spacing, typography } from '../theme/theme';

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

export function LiveMapScreen({ app }: LiveMapScreenProps) {
  const room = app.room;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

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
        title="Peta Langsung"
        subtitle="Lokasi hanya dibagikan oleh peserta yang menyalakannya."
        onBack={app.goBack}
        right={<Badge label={`${sharingCount} berbagi`} tone="primary" />}
      />

      <AppBanners
        error={app.error}
        notice={app.notice}
        onDismissError={app.dismissError}
        onDismissNotice={app.dismissNotice}
      />

      <Card style={styles.card}>
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapTitle}>Peta offline belum tersedia</Text>
          <Text style={styles.mapBody}>
            Build ini belum menyertakan paket peta MapLibre. Konvoi tidak akan
            memuat tile dari internet; tanpa paket offline, peta memang tidak
            bisa ditampilkan.
          </Text>
        </View>
        <View style={styles.attribution}>
          <Text style={styles.attributionText}>
            Nantinya: © OpenStreetMap contributors, data peta offline.
          </Text>
        </View>
      </Card>

      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Status berbagi</Text>
          <Badge label="GPS belum aktif" tone="warning" />
        </View>
        <Text style={styles.sectionBody}>
          Geolocation belum diaktifkan di build ini, jadi belum ada posisi yang
          dikirim. Daftar di bawah hanya menampilkan status dari protokol
          ruangan.
        </Text>

        {room.participants.map(participant => {
          const entry = room.locations[participant.id];
          const sharing = room.locationSharing[participant.id] === true;
          const stale =
            entry !== undefined &&
            now - entry.receivedAt > LOCATION_STALE_AFTER_MS;

          return (
            <View key={participant.id} style={styles.locationRow}>
              <View style={styles.locationBody}>
                <Text style={styles.locationName}>
                  {participant.displayName}
                  {participant.id === room.selfId ? ' (Anda)' : ''}
                </Text>
                {entry ? (
                  <>
                    <Text style={styles.locationMeta}>
                      {entry.location.lat.toFixed(5)},{' '}
                      {entry.location.lon.toFixed(5)} · akurasi{' '}
                      {Math.round(entry.location.accuracy)} m
                    </Text>
                    <Text style={styles.locationMeta}>
                      Diperbarui {clockTime(entry.receivedAt)}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.locationMeta}>
                    {sharing ? 'Menunggu lokasi…' : 'Tidak membagikan lokasi'}
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
        label="Hentikan Berbagi Lokasi"
        variant="secondary"
        onPress={() => {}}
        disabled
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
  mapPlaceholder: {
    minHeight: 180,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  mapTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '800',
    textAlign: 'center',
  },
  mapBody: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 20,
    textAlign: 'center',
  },
  attribution: {
    marginTop: spacing.sm,
  },
  attributionText: {
    color: colors.muted,
    fontSize: typography.tiny,
    textAlign: 'right',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '800',
  },
  sectionBody: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 20,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  locationBody: {
    flex: 1,
  },
  locationName: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '700',
  },
  locationMeta: {
    color: colors.muted,
    fontSize: typography.tiny,
    lineHeight: 17,
    marginTop: 2,
  },
  control: {
    marginBottom: spacing.md,
  },
  footer: {
    color: colors.muted,
    fontSize: typography.tiny,
    lineHeight: 18,
    textAlign: 'center',
  },
});
