import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { AppBanners } from '../components/AppBanners';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ParticipantTile } from '../components/ParticipantTile';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import type { RoomApp } from '../state/useRoomApp';
import { colors, spacing, typography } from '../theme/theme';

interface HostRoomScreenProps {
  app: RoomApp;
}

export function HostRoomScreen({ app }: HostRoomScreenProps) {
  const host = app.host;
  const room = app.room;

  if (!host) {
    return (
      <Screen>
        <ScreenHeader
          title="Ruang Host"
          subtitle="Ruangan tidak aktif."
          onBack={app.goBack}
        />
        <Button
          label="Kembali ke Beranda"
          onPress={() => app.navigate('home')}
        />
      </Screen>
    );
  }

  const participants = room?.participants ?? [];
  const voiceParticipants = room?.voiceParticipants ?? [];

  function confirmClose() {
    Alert.alert(
      'Tutup ruangan?',
      'Semua peserta akan terputus dan ruangan tidak bisa dipakai lagi.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Tutup',
          style: 'destructive',
          onPress: () => app.closeRoom(),
        },
      ],
    );
  }

  function confirmKick(participantId: string, displayName: string) {
    Alert.alert(
      `Keluarkan ${displayName}?`,
      'Peserta ini akan terputus dari ruangan.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Keluarkan',
          style: 'destructive',
          onPress: () => app.kick(participantId),
        },
      ],
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={host.roomName}
        subtitle="Bagikan PIN, IP, dan port di bawah ini ke peserta."
        onBack={app.goBack}
        right={
          <Badge
            label={host.advertised ? 'mDNS aktif' : 'Mode manual'}
            tone={host.advertised ? 'success' : 'warning'}
          />
        }
      />

      <AppBanners
        error={app.error}
        notice={app.notice}
        onDismissError={app.dismissError}
        onDismissNotice={app.dismissNotice}
      />

      <Card style={styles.pinCard}>
        <Text style={styles.label}>PIN ruangan</Text>
        <Text style={styles.pin} accessibilityLabel={`PIN ${host.pin}`}>
          {host.pin}
        </Text>
        <Text style={styles.pinHint}>
          Berikan PIN hanya kepada orang yang Anda kenal. PIN membatasi
          bergabung, bukan mengenkripsi suara atau lokasi.
        </Text>
      </Card>

      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Text style={styles.label}>Port</Text>
            <Text style={styles.value}>{host.port}</Text>
          </View>
          <View style={styles.rowItem}>
            <Text style={styles.label}>ID ruangan</Text>
            <Text style={styles.valueSmall} numberOfLines={1}>
              {host.roomId}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <Text style={styles.label}>Alamat IP HP ini</Text>
        <Text style={styles.ipHelp}>
          Buka Pengaturan HP → Wi-Fi → jaringan yang sedang aktif, lalu lihat
          alamat IP. Tamu mengetik IP itu dan port di atas pada menu Gabung
          Ruangan.
        </Text>
        <Text style={styles.ipHint}>
          Petunjuk umum: hotspot Android sering memakai 192.168.43.1, hotspot
          iPhone sering memakai 172.20.10.1. Selalu cocokkan dengan pengaturan
          HP.
        </Text>

        {!host.advertised ? (
          <Text style={styles.warning}>
            Pencarian otomatis tidak aktif. Peserta harus memakai IP dan port
            manual.
          </Text>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>
            Peserta ({participants.length}/12)
          </Text>
          <Text style={styles.listMeta}>
            Suara {voiceParticipants.length}/6
          </Text>
        </View>
        {participants.map(participant => (
          <ParticipantTile
            key={participant.id}
            participant={participant}
            isSelf={participant.id === room?.selfId}
            isHost={participant.id === room?.hostId}
            voice={voiceParticipants.find(
              entry => entry.participantId === participant.id,
            )}
            sharing={room?.locationSharing[participant.id] === true}
            peerState={app.peerStates[participant.id]}
            onKick={
              participant.id !== room?.selfId && participant.id !== room?.hostId
                ? () => confirmKick(participant.id, participant.displayName)
                : undefined
            }
          />
        ))}
        {participants.length <= 1 ? (
          <Text style={styles.empty}>
            Belum ada peserta. Minta tamu membuka Gabung Ruangan di HP mereka.
          </Text>
        ) : null}
      </Card>

      <Button
        label="Buka Ruang Suara"
        onPress={() => app.navigate('room')}
        style={styles.action}
      />
      <Button
        label="Tutup Ruangan"
        variant="danger"
        onPress={confirmClose}
        style={styles.action}
      />

      <Text style={styles.keepOpen}>
        Biarkan layar ini terbuka selama ruangan berjalan. Konvoi hanya berjalan
        di depan; hosting belum mendukung latar belakang atau layar terkunci.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pinCard: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.muted,
    fontSize: typography.tiny,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  pin: {
    color: colors.primary,
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: 8,
    marginVertical: spacing.sm,
    fontVariant: ['tabular-nums'],
  },
  pinHint: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 20,
    textAlign: 'center',
  },
  card: {
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  rowItem: {
    flex: 1,
  },
  value: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '800',
    marginTop: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
  valueSmall: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  ipHelp: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 21,
    marginTop: spacing.sm,
  },
  ipHint: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  warning: {
    color: colors.warning,
    fontSize: typography.small,
    lineHeight: 20,
    marginTop: spacing.md,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  listTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '800',
  },
  listMeta: {
    color: colors.muted,
    fontSize: typography.small,
  },
  empty: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 20,
    marginTop: spacing.md,
  },
  action: {
    marginBottom: spacing.md,
  },
  keepOpen: {
    color: colors.muted,
    fontSize: typography.tiny,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
