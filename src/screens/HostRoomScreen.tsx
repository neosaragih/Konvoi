import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppBanners } from '../components/AppBanners';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ParticipantTile } from '../components/ParticipantTile';
import { QrCodeView } from '../components/QrCodeView';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { buildJoinQr } from '../scanner/qrScanner';
import type { RoomApp } from '../state/useRoomApp';
import { colors, spacing } from '../theme/theme';

interface HostRoomScreenProps {
  app: RoomApp;
}

export function HostRoomScreen({ app }: HostRoomScreenProps) {
  const host = app.host;
  const room = app.room;
  const [showDetails, setShowDetails] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const qrData = useMemo(() => {
    if (!host) return '';
    return buildJoinQr({
      host: '192.168.43.1', // Standard default host IP for hotspot
      port: host.port,
      pin: host.pin,
      roomId: host.roomId,
      roomName: host.roomName,
    });
  }, [host]);

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
  const selfVoice = voiceParticipants.find(
    entry => entry.participantId === room?.selfId,
  );
  const selfMuted = selfVoice?.muted ?? false;

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
        subtitle="Ruangan siap. Tamu dapat scan QR kamera atau scan Wi-Fi langsung."
        onBack={app.goBack}
        right={
          <Badge
            label={host.advertised ? 'Siap Scan (mDNS)' : 'Mode manual'}
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

      {/* QR Code Card for Instant Camera Scan */}
      <Card style={styles.card}>
        <View style={styles.controlHeader}>
          <Text style={styles.sectionTitle}>QR Code Gabung Cepat</Text>
          <Badge
            label={showQr ? 'Tutup QR' : 'Tampilkan QR'}
            tone="primary"
          />
        </View>
        <Text style={styles.body}>
          Tamu cukup mengarahkan kamera ke QR code ini untuk bergabung secara
          otomatis tanpa mengetik PIN atau IP.
        </Text>
        {showQr ? (
          <View style={styles.qrContainer}>
            <QrCodeView value={qrData} size={180} />
            <Text style={styles.qrHint}>
              Arahkan kamera HP tamu ke QR di atas
            </Text>
          </View>
        ) : null}
        <Button
          label={showQr ? 'Sembunyikan QR' : 'Tampilkan QR Code Rombongan'}
          variant="secondary"
          onPress={() => setShowQr(v => !v)}
          style={styles.control}
        />
      </Card>

      {/* Direct Intercom Voice Control for Host */}
      <Card style={styles.card}>
        <View style={styles.controlHeader}>
          <Text style={styles.sectionTitle}>Interkom Suara</Text>
          <Badge
            label={app.voiceActive ? 'Suara Aktif' : 'Suara Mati'}
            tone={app.voiceActive ? 'success' : 'neutral'}
          />
        </View>
        <Text style={styles.body}>
          {app.voiceActive
            ? 'Mikrofon dan interkom aktif. Anda dapat berbicara langsung dengan seluruh peserta.'
            : 'Nyalakan mikrofon untuk mulai berbicara dengan peserta di rombongan Anda.'}
        </Text>
        {app.voiceActive ? (
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
        ) : (
          <Button
            label="Mulai Suara"
            onPress={app.startVoice}
            busy={app.voiceBusy}
            disabled={app.voiceBusy}
            style={styles.control}
          />
        )}
      </Card>

      <Card style={styles.card}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>
            Peserta ({participants.length}/16)
          </Text>
          <Text style={styles.listMeta}>
            Suara {voiceParticipants.length}/{room?.voiceCapacity || 16}
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
            Belum ada tamu yang bergabung. Minta teman scan QR di atas atau
            buka menu &quot;Gabung Ruangan&quot;.
          </Text>
        ) : null}
      </Card>

      <Button
        label="Buka Peta Konvoi (GPS)"
        onPress={() => app.navigate('map')}
        style={styles.action}
      />

      <Button
        label="Buka Ruang Suara Lengkap"
        variant="secondary"
        onPress={() => app.navigate('room')}
        style={styles.action}
      />

      {/* Collapsible Technical Details (IP, Port, PIN) */}
      <Card style={styles.card}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Buka detail teknis ruangan"
          onPress={() => setShowDetails(v => !v)}
          style={styles.toggleHeader}
        >
          <Text style={styles.sectionTitle}>
            Detail Teknis (IP, Port, PIN)
          </Text>
          <Badge
            label={showDetails ? 'Tutup' : 'Buka'}
            tone="neutral"
          />
        </Pressable>

        {showDetails ? (
          <View style={styles.detailsBody}>
            <Text style={styles.label}>PIN ruangan</Text>
            <Text style={styles.pin} accessibilityLabel={`PIN ${host.pin}`}>
              {host.pin}
            </Text>

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
            <Text style={styles.ipHint}>
              Tamu di Wi-Fi yang sama biasanya langsung terdeteksi otomatis
              tanpa mengetik data ini.
            </Text>
          </View>
        ) : (
          <Text style={styles.hiddenText}>
            PIN: {host.pin} · Port: {host.port}
          </Text>
        )}
      </Card>

      <Button
        label="Tutup Ruangan"
        variant="danger"
        onPress={confirmClose}
      />
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
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  body: {
    color: colors.muted,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  controlRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowButton: {
    flex: 1,
  },
  control: {
    marginTop: spacing.xs,
  },
  qrContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  qrHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: spacing.sm,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  listTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  listMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  empty: {
    color: colors.muted,
    fontSize: 13,
    paddingVertical: spacing.sm,
  },
  action: {
    marginBottom: spacing.md,
  },
  toggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailsBody: {
    marginTop: spacing.md,
  },
  hiddenText: {
    color: colors.muted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  pin: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 6,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  rowItem: {
    flex: 1,
  },
  value: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  valueSmall: {
    color: colors.muted,
    fontSize: 12,
  },
  ipHint: {
    color: colors.muted,
    fontSize: 11,
    marginTop: spacing.sm,
  },
});
