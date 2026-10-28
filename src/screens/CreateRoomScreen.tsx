import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { AppBanners } from '../components/AppBanners';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { TextField } from '../components/TextField';
import type { RoomApp } from '../state/useRoomApp';
import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_ROOM_NAME_LENGTH,
} from '../protocol/protocolVersion';
import { colors, spacing, typography } from '../theme/theme';

interface CreateRoomScreenProps {
  app: RoomApp;
}

interface FieldErrors {
  displayName?: string;
  roomName?: string;
}

export function CreateRoomScreen({ app }: CreateRoomScreenProps) {
  const [displayName, setDisplayName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function submit() {
    const nextErrors: FieldErrors = {};
    if (displayName.trim().length === 0) {
      nextErrors.displayName = 'Nama panggilan wajib diisi.';
    }
    if (roomName.trim().length === 0) {
      nextErrors.roomName = 'Nama ruangan wajib diisi.';
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    app.createRoom({ displayName, roomName });
  }

  return (
    <Screen>
      <ScreenHeader
        title="Buat Ruangan"
        subtitle="HP ini akan menjadi host. Peserta lain bergabung lewat Wi-Fi atau hotspot yang sama."
        onBack={app.goBack}
      />

      <AppBanners
        error={app.error}
        notice={app.notice}
        onDismissError={app.dismissError}
        onDismissNotice={app.dismissNotice}
      />

      <TextField
        label="Nama panggilan"
        value={displayName}
        onChangeText={value => {
          setDisplayName(value);
          if (fieldErrors.displayName) {
            setFieldErrors(current => ({ ...current, displayName: undefined }));
          }
        }}
        placeholder="Contoh: Rafi"
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={MAX_DISPLAY_NAME_LENGTH}
        error={fieldErrors.displayName ?? null}
        helper="Tampil di daftar peserta ruangan."
        returnKeyType="next"
      />

      <TextField
        label="Nama ruangan"
        value={roomName}
        onChangeText={value => {
          setRoomName(value);
          if (fieldErrors.roomName) {
            setFieldErrors(current => ({ ...current, roomName: undefined }));
          }
        }}
        placeholder="Contoh: Konvoi Bromo"
        autoCapitalize="words"
        maxLength={MAX_ROOM_NAME_LENGTH}
        error={fieldErrors.roomName ?? null}
        helper="Terlihat oleh peserta yang menemukan ruangan ini."
        returnKeyType="done"
        onSubmitEditing={submit}
      />

      <Button
        label="Buat Ruangan"
        onPress={submit}
        busy={app.busy}
        disabled={app.busy}
      />

      <Card style={styles.note}>
        <Text style={styles.noteTitle}>Yang perlu disiapkan</Text>
        <Text style={styles.noteBody}>
          Aktifkan Wi-Fi atau hotspot sebelum membuat ruangan. PIN dibuat
          otomatis dan hanya ditampilkan di layar host; PIN tidak disiarkan
          lewat pencarian mDNS.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: {
    marginTop: spacing.xl,
  },
  noteTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  noteBody: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 21,
  },
});
