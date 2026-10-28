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

interface VoiceRoomScreenProps {
  app: RoomApp;
}

export function VoiceRoomScreen({ app }: VoiceRoomScreenProps) {
  const room = app.room;

  if (!room) {
    return (
      <Screen>
        <ScreenHeader
          title="Ruang Suara"
          subtitle="Tidak ada ruangan aktif."
          onBack={app.goBack}
        />
        <Button
          label="Kembali ke Beranda"
          onPress={() => app.navigate('home')}
        />
      </Screen>
    );
  }

  const isHost = app.host !== null;
  const voiceParticipants = room.voiceParticipants;
  const selfVoice = voiceParticipants.find(
    entry => entry.participantId === room.selfId,
  );
  const selfMuted = selfVoice?.muted ?? false;

  function confirmLeave() {
    if (isHost) {
      Alert.alert(
        'Tutup ruangan?',
        'Sebagai host, keluar dari ruangan akan menutupnya untuk semua peserta.',
        [
          { text: 'Batal', style: 'cancel' },
          {
            text: 'Tutup Ruangan',
            style: 'destructive',
            onPress: () => {
              app.leaveRoom();
            },
          },
        ],
      );
      return;
    }
    Alert.alert('Keluar ruangan?', 'Anda akan terputus dari peserta lain.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Keluar',
        style: 'destructive',
        onPress: () => {
          app.leaveRoom();
        },
      },
    ]);
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
        title={room.roomName ?? 'Ruang Suara'}
        subtitle={`${room.participants.length} peserta · ${
          voiceParticipants.length
        }/${room.voiceCapacity || 6} di suara`}
        onBack={app.goBack}
        right={<Badge label={isHost ? 'Host' : 'Peserta'} tone="primary" />}
      />

      <AppBanners
        error={app.error}
        notice={app.notice}
        onDismissError={app.dismissError}
        onDismissNotice={app.dismissNotice}
      />

      <Card style={styles.card}>
        <View style={styles.controlHeader}>
          <Text style={styles.sectionTitle}>Suara</Text>
          <Badge
            label={app.voiceActive ? 'Aktif' : 'Nonaktif'}
            tone={app.voiceActive ? 'success' : 'neutral'}
          />
        </View>
        <Text style={styles.body}>
          {app.voiceActive
            ? 'Mikrofon menyala. Suara dikirim langsung antar-HP lewat WebRTC; host hanya meneruskan sinyal koneksi. Tidak ada STUN/TURN, jadi semua HP harus bisa saling menjangkau di Wi-Fi ini.'
            : 'Mikrofon hanya menyala setelah Anda menekan Mulai Suara. Audio berjalan peer-to-peer tanpa server internet, dan berhenti otomatis saat aplikasi masuk latar belakang.'}
        </Text>
        {app.voiceActive ? (
          <>
            <View style={styles.controlRow}>
              <Button
                label={selfMuted ? 'Bunyikan' : 'Bisukan'}
                variant="secondary"
                onPress={app.toggleMute}
                style={styles.rowButton}
              />
              <Button
                label="Keluar dari Suara"
                variant="secondary"
                onPress={app.leaveVoice}
                style={styles.rowButton}
              />
            </View>
            <View style={styles.routeRow}>
              <Badge
                label={selfMuted ? 'Mikrofon dibisukan' : 'Mikrofon aktif'}
                tone={selfMuted ? 'warning' : 'success'}
              />
              <Text style={styles.routeNote}>
                Rute audio mengikuti pengaturan HP. Bluetooth intercom memakai
                profil HFP/HSP; perangkat A2DP saja tidak punya mikrofon.
              </Text>
            </View>
          </>
        ) : (
          <>
            <Button
              label="Mulai Suara"
              onPress={app.startVoice}
              busy={app.voiceBusy}
              disabled={app.voiceBusy}
              style={styles.control}
            />
            <View style={styles.routeRow}>
              <Badge label="Mikrofon mati" tone="neutral" />
              <Text style={styles.routeNote}>
                Suara WebRTC sudah terpasang di build ini, tetapi belum diuji di
                perangkat fisik. Bluetooth intercom memakai rute HFP/HSP dari
                pengaturan HP.
              </Text>
            </View>
          </>
        )}
      </Card>

      <Card style={styles.card}>
        <View style={styles.controlHeader}>
          <Text style={styles.sectionTitle}>
            Peserta ({room.participants.length}/12)
          </Text>
          <Badge
            label={`Lokasi ${Object.keys(room.locations).length}`}
            tone="neutral"
          />
        </View>
        {room.participants.map(participant => (
          <ParticipantTile
            key={participant.id}
            participant={participant}
            isSelf={participant.id === room.selfId}
            isHost={participant.id === room.hostId}
            voice={voiceParticipants.find(
              entry => entry.participantId === participant.id,
            )}
            sharing={room.locationSharing[participant.id] === true}
            peerState={app.peerStates[participant.id]}
            onKick={
              isHost &&
              participant.id !== room.selfId &&
              participant.id !== room.hostId
                ? () => confirmKick(participant.id, participant.displayName)
                : undefined
            }
          />
        ))}
      </Card>

      <Button
        label="Peta Langsung"
        variant="secondary"
        onPress={() => app.navigate('map')}
        style={styles.control}
      />
      <Button
        label={isHost ? 'Tutup Ruangan' : 'Keluar Ruangan'}
        variant="danger"
        onPress={confirmLeave}
        style={styles.control}
      />

      <Text style={styles.footer}>
        Tidak ada chat di Konvoi. Suara dan lokasi hanya berjalan selama
        aplikasi terbuka di depan.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
  },
  controlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '800',
  },
  body: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 21,
    marginBottom: spacing.lg,
  },
  control: {
    marginBottom: spacing.md,
  },
  controlRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  rowButton: {
    flex: 1,
  },
  routeRow: {
    gap: spacing.sm,
  },
  routeNote: {
    color: colors.muted,
    fontSize: typography.tiny,
    lineHeight: 17,
  },
  footer: {
    color: colors.muted,
    fontSize: typography.tiny,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
