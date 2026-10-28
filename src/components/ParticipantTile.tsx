import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Participant, VoiceParticipant } from '../protocol/messageTypes';
import { colors, radius, spacing, typography } from '../theme/theme';
import type { VoicePeerState } from '../voice/voiceManager';
import { Badge, type BadgeTone } from './Badge';

interface ParticipantTileProps {
  participant: Participant;
  isSelf: boolean;
  isHost: boolean;
  voice?: VoiceParticipant;
  sharing: boolean;
  /** Local P2P state for remote voice peers; the host cannot observe media. */
  peerState?: VoicePeerState;
  onKick?: () => void;
}

export function ParticipantTile({
  participant,
  isSelf,
  isHost,
  voice,
  sharing,
  peerState,
  onKick,
}: ParticipantTileProps) {
  const initial = participant.displayName.trim().charAt(0).toUpperCase() || '?';

  const voiceStatus = (): { label: string; tone: BadgeTone } => {
    if (!voice) {
      return { label: 'Tidak di suara', tone: 'neutral' };
    }
    if (voice.muted) {
      return { label: 'Bisu', tone: 'warning' };
    }
    if (isSelf) {
      return { label: 'Mikrofon aktif', tone: 'success' };
    }
    switch (peerState) {
      case 'failed':
        return { label: 'Gagal', tone: 'danger' };
      case 'disconnected':
        return { label: 'Terputus', tone: 'danger' };
      case 'connected':
        return { label: 'Tersambung', tone: 'success' };
      default:
        return { label: 'Menghubungkan', tone: 'warning' };
    }
  };
  const status = voiceStatus();

  return (
    <View style={styles.tile}>
      <View style={styles.avatar}>
        <Text style={styles.initial}>{initial}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {participant.displayName}
            {isSelf ? ' (Anda)' : ''}
          </Text>
          {isHost ? <Badge label="Host" tone="primary" /> : null}
        </View>
        <View style={styles.badges}>
          {voice ? (
            <Badge label={status.label} tone={status.tone} />
          ) : (
            <Badge label="Tidak di suara" />
          )}
          {sharing ? <Badge label="Lokasi" tone="primary" /> : null}
        </View>
      </View>
      {onKick && !isSelf && !isHost ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Keluarkan ${participant.displayName}`}
          onPress={onKick}
          hitSlop={8}
          style={styles.kick}
        >
          <Text style={styles.kickLabel}>Keluarkan</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  initial: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '800',
  },
  body: {
    flex: 1,
    gap: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '700',
    flexShrink: 1,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  kick: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  kickLabel: {
    color: colors.danger,
    fontSize: typography.small,
    fontWeight: '700',
  },
});
