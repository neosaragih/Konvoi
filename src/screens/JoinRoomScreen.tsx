import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppBanners } from '../components/AppBanners';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { TextField } from '../components/TextField';
import type { DiscoveredRoom } from '../networking/discovery';
import { PROTOCOL_VERSION } from '../protocol/protocolVersion';
import type { RoomApp } from '../state/useRoomApp';
import { colors, radius, spacing, typography } from '../theme/theme';

interface JoinRoomScreenProps {
  app: RoomApp;
}

interface FieldErrors {
  displayName?: string;
  host?: string;
  port?: string;
  pin?: string;
}

function digitsOnly(value: string, maxLength: number): string {
  return value.replace(/\D/g, '').slice(0, maxLength);
}

export function JoinRoomScreen({ app }: JoinRoomScreenProps) {
  const { startDiscovery, stopDiscovery } = app;
  const [displayName, setDisplayName] = useState('');
  const [hostAddress, setHostAddress] = useState('');
  const [port, setPort] = useState('');
  const [pin, setPin] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<DiscoveredRoom | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    startDiscovery();
    return () => stopDiscovery();
  }, [startDiscovery, stopDiscovery]);

  function pickRoom(room: DiscoveredRoom) {
    setSelectedRoom(room);
    setHostAddress(room.host);
    setPort(String(room.port));
    setFieldErrors(current => ({
      ...current,
      host: undefined,
      port: undefined,
    }));
  }

  function clearSelection() {
    setSelectedRoom(null);
  }

  function submit() {
    const nextErrors: FieldErrors = {};

    if (displayName.trim().length === 0) {
      nextErrors.displayName = 'Nama panggilan wajib diisi.';
    }
    if (hostAddress.trim().length === 0) {
      nextErrors.host = 'Alamat IP host wajib diisi.';
    }
    if (!/^\d{1,5}$/.test(port.trim())) {
      nextErrors.port = 'Port harus angka 1-65535.';
    } else {
      const portNumber = Number(port.trim());
      if (portNumber < 1 || portNumber > 65_535) {
        nextErrors.port = 'Port harus angka 1-65535.';
      }
    }
    if (!/^\d{6}$/.test(pin)) {
      nextErrors.pin = 'PIN harus 6 angka.';
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    app.joinRoom({
      displayName,
      pin,
      host: hostAddress,
      port,
      ...(selectedRoom?.roomId ? { roomId: selectedRoom.roomId } : {}),
    });
  }

  return (
    <Screen>
      <ScreenHeader
        title="Gabung Ruangan"
        subtitle="Pilih ruangan yang ditemukan, atau masukkan IP dan port host secara manual."
        onBack={app.goBack}
      />

      <AppBanners
        error={app.error}
        notice={app.notice}
        onDismissError={app.dismissError}
        onDismissNotice={app.dismissNotice}
      />

      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Ruangan di sekitar</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Muat ulang daftar ruangan"
            onPress={() => {
              app.refreshDiscovery();
            }}
            hitSlop={10}
            disabled={app.scanning}
          >
            <Text style={[styles.refresh, app.scanning && styles.refreshBusy]}>
              {app.scanning ? 'Mencari…' : 'Muat ulang'}
            </Text>
          </Pressable>
        </View>

        {app.rooms.length === 0 ? (
          <View style={styles.emptyWrap}>
            {app.scanning ? <ActivityIndicator color={colors.primary} /> : null}
            <Text style={styles.empty}>
              {app.scanning
                ? 'Mencari ruangan Konvoi di Wi-Fi ini…'
                : 'Belum ada ruangan ditemukan. Pastikan host sudah membuka ruangan di Wi-Fi yang sama, lalu muat ulang.'}
            </Text>
          </View>
        ) : (
          app.rooms.map(room => {
            const selected = selectedRoom?.key === room.key;
            const incompatible =
              room.protocolVersion !== null &&
              room.protocolVersion !== PROTOCOL_VERSION;
            return (
              <Pressable
                key={room.key}
                accessibilityRole="button"
                accessibilityLabel={`Pilih ruangan ${room.roomName}`}
                onPress={() => pickRoom(room)}
                style={({ pressed }) => [
                  styles.roomRow,
                  selected && styles.roomRowSelected,
                  pressed && styles.roomRowPressed,
                ]}
              >
                <View style={styles.roomBody}>
                  <Text style={styles.roomName} numberOfLines={1}>
                    {room.roomName}
                  </Text>
                  <Text style={styles.roomMeta}>
                    {room.host}:{room.port}
                  </Text>
                </View>
                <Badge
                  label={
                    selected ? 'Dipilih' : incompatible ? 'Versi beda' : 'Pilih'
                  }
                  tone={
                    selected ? 'success' : incompatible ? 'warning' : 'neutral'
                  }
                />
              </Pressable>
            );
          })
        )}

        <Text style={styles.discoveryNote}>
          Pencarian otomatis memakai mDNS. Di iOS, izinkan akses Jaringan Lokal
          saat diminta. Jika ruangan tidak muncul, gunakan IP manual di bawah.
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Gabung manual</Text>
        <Text style={styles.manualNote}>
          Selalu tersedia, termasuk saat mDNS diblokir atau Wi-Fi memisahkan
          perangkat.
        </Text>

        {selectedRoom ? (
          <View style={styles.selectedRow}>
            <Badge label={`Dipilih: ${selectedRoom.roomName}`} tone="primary" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Batalkan pilihan ruangan"
              onPress={clearSelection}
              hitSlop={8}
            >
              <Text style={styles.clear}>Ganti manual</Text>
            </Pressable>
          </View>
        ) : null}

        <TextField
          label="Nama panggilan"
          value={displayName}
          onChangeText={value => {
            setDisplayName(value);
            if (fieldErrors.displayName) {
              setFieldErrors(current => ({
                ...current,
                displayName: undefined,
              }));
            }
          }}
          placeholder="Contoh: Dina"
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={32}
          error={fieldErrors.displayName ?? null}
        />

        <TextField
          label="IP host"
          value={hostAddress}
          onChangeText={value => {
            setHostAddress(value);
            clearSelection();
            if (fieldErrors.host) {
              setFieldErrors(current => ({ ...current, host: undefined }));
            }
          }}
          placeholder="192.168.43.1"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          error={fieldErrors.host ?? null}
        />

        <TextField
          label="Port"
          value={port}
          onChangeText={value => {
            setPort(digitsOnly(value, 5));
            clearSelection();
            if (fieldErrors.port) {
              setFieldErrors(current => ({ ...current, port: undefined }));
            }
          }}
          placeholder="Contoh: 41234"
          keyboardType="number-pad"
          maxLength={5}
          error={fieldErrors.port ?? null}
        />

        <TextField
          label="PIN"
          value={pin}
          onChangeText={value => {
            setPin(digitsOnly(value, 6));
            if (fieldErrors.pin) {
              setFieldErrors(current => ({ ...current, pin: undefined }));
            }
          }}
          placeholder="6 angka"
          keyboardType="number-pad"
          maxLength={6}
          secureTextEntry
          error={fieldErrors.pin ?? null}
          helper="PIN ditampilkan di layar host."
        />

        <Button
          label="Gabung Ruangan"
          onPress={submit}
          busy={app.busy}
          disabled={app.busy}
        />

        {app.busy && app.guest ? (
          <View style={styles.progress}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.progressText}>
              Menghubungkan ke {app.guest.host}:{app.guest.port}…
            </Text>
          </View>
        ) : null}
      </Card>

      <Text style={styles.footer}>
        Kedua HP harus berada di Wi-Fi atau hotspot yang sama. Jika router
        memakai client isolation, perangkat tidak bisa saling terhubung.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
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
  refresh: {
    color: colors.primary,
    fontSize: typography.small,
    fontWeight: '700',
  },
  refreshBusy: {
    color: colors.muted,
  },
  emptyWrap: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  empty: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 20,
    textAlign: 'center',
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    marginTop: spacing.sm,
  },
  roomRowSelected: {
    borderColor: colors.success,
  },
  roomRowPressed: {
    opacity: 0.8,
  },
  roomBody: {
    flex: 1,
  },
  roomName: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '700',
  },
  roomMeta: {
    color: colors.muted,
    fontSize: typography.small,
    marginTop: 2,
  },
  discoveryNote: {
    color: colors.muted,
    fontSize: typography.tiny,
    lineHeight: 17,
    marginTop: spacing.md,
  },
  manualNote: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 20,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  clear: {
    color: colors.muted,
    fontSize: typography.small,
    fontWeight: '700',
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  progressText: {
    color: colors.muted,
    fontSize: typography.small,
  },
  footer: {
    color: colors.muted,
    fontSize: typography.tiny,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
