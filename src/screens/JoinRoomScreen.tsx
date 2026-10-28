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
import { scanQrCode } from '../scanner/qrScanner';
import type { RoomApp } from '../state/useRoomApp';
import { colors, radius, spacing } from '../theme/theme';

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
  const [showManual, setShowManual] = useState(false);
  const [scanningQr, setScanningQr] = useState(false);

  useEffect(() => {
    startDiscovery();
    return () => stopDiscovery();
  }, [startDiscovery, stopDiscovery]);

  async function handleScanQr() {
    if (displayName.trim().length === 0) {
      setFieldErrors({ displayName: 'Masukkan nama panggilan Anda dulu.' });
      return;
    }
    setFieldErrors({});
    setScanningQr(true);
    try {
      const data = await scanQrCode();
      if (data) {
        app.joinRoom({
          displayName,
          host: data.host,
          port: data.port,
          pin: data.pin || '000000',
          roomId: data.roomId,
        });
      }
    } catch {
      app.dismissError();
    } finally {
      setScanningQr(false);
    }
  }

  function joinDiscoveredDirect(room: DiscoveredRoom) {
    if (displayName.trim().length === 0) {
      setFieldErrors({ displayName: 'Masukkan nama panggilan Anda dulu.' });
      return;
    }
    setFieldErrors({});
    app.joinRoom({
      displayName,
      pin: room.pin || '000000',
      host: room.host,
      port: String(room.port),
      roomId: room.roomId,
    });
  }

  function pickRoom(room: DiscoveredRoom) {
    setSelectedRoom(room);
    setHostAddress(room.host);
    setPort(String(room.port));
    if (room.pin) {
      setPin(room.pin);
    }
    setFieldErrors(current => ({
      ...current,
      host: undefined,
      port: undefined,
      pin: undefined,
    }));
  }

  function clearSelection() {
    setSelectedRoom(null);
  }

  function submitManual() {
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
    if (pin.trim().length > 0 && !/^\d{6}$/.test(pin)) {
      nextErrors.pin = 'PIN harus 6 angka jika diisi.';
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    app.joinRoom({
      displayName,
      pin: pin.trim().length > 0 ? pin : '000000',
      host: hostAddress,
      port,
      ...(selectedRoom?.roomId ? { roomId: selectedRoom.roomId } : {}),
    });
  }

  return (
    <Screen>
      <ScreenHeader
        title="Gabung Ruangan"
        subtitle="Scan QR kamera atau pilih ruangan di Wi-Fi untuk langsung bergabung."
        onBack={app.goBack}
      />

      <AppBanners
        error={app.error}
        notice={app.notice}
        onDismissError={app.dismissError}
        onDismissNotice={app.dismissNotice}
      />

      <Card style={styles.card}>
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
          helper="Nama Anda akan terlihat oleh seluruh peserta konvoi."
        />

        <Button
          label={
            scanningQr
              ? 'Membuka Kamera…'
              : '📷 Scan QR Code Kamera (Tanpa PIN)'
          }
          onPress={handleScanQr}
          busy={scanningQr}
          disabled={scanningQr}
          style={styles.scanBtn}
        />
      </Card>

      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Ruangan di sekitar (Wi-Fi)</Text>
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
                : 'Belum ada ruangan terdeteksi. Pastikan host sudah membuat ruangan di Wi-Fi yang sama.'}
            </Text>
          </View>
        ) : (
          app.rooms.map(room => {
            const selected = selectedRoom?.key === room.key;
            const incompatible =
              room.protocolVersion !== null &&
              room.protocolVersion !== PROTOCOL_VERSION;
            return (
              <View key={room.key} style={styles.roomItem}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Pilih ruangan ${room.roomName}`}
                  onPress={() => pickRoom(room)}
                  style={({ pressed }) => [
                    styles.roomBodyWrap,
                    pressed && styles.roomRowPressed,
                  ]}
                >
                  <View style={styles.roomBody}>
                    <Text style={styles.roomName} numberOfLines={1}>
                      {room.roomName}
                    </Text>
                    <Text style={styles.roomSub}>
                      {incompatible
                        ? 'Versi berbeda'
                        : 'Siap gabung tanpa kunci/PIN'}
                    </Text>
                  </View>
                </Pressable>
                <Button
                  label={app.busy && selected ? 'Menghubungkan…' : 'Gabung'}
                  disabled={app.busy || incompatible}
                  busy={app.busy && selected}
                  onPress={() => joinDiscoveredDirect(room)}
                  style={styles.directJoinBtn}
                />
              </View>
            );
          })
        )}

        <Text style={styles.discoveryNote}>
          Otomatis mendeteksi host tanpa perlu ketik IP atau PIN.
        </Text>
      </Card>

      <Card style={styles.card}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Buka opsi gabung manual"
          onPress={() => setShowManual(v => !v)}
          style={styles.manualToggleHeader}
        >
          <Text style={styles.sectionTitle}>Gabung manual (IP & Port)</Text>
          <Badge
            label={showManual ? 'Tutup ▲' : 'Buka ▼'}
            tone="neutral"
          />
        </Pressable>

        {showManual ? (
          <View style={styles.manualBody}>
            <Text style={styles.manualNote}>
              Gunakan opsi ini jika router Anda memblokir pencarian otomatis
              (mDNS).
            </Text>

            {selectedRoom ? (
              <View style={styles.selectedRow}>
                <Badge
                  label={`Dipilih: ${selectedRoom.roomName}`}
                  tone="primary"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Batalkan pilihan ruangan"
                  onPress={clearSelection}
                  hitSlop={8}
                >
                  <Text style={styles.clear}>Reset</Text>
                </Pressable>
              </View>
            ) : null}

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
              placeholder="41234"
              keyboardType="number-pad"
              maxLength={5}
              error={fieldErrors.port ?? null}
            />

            <TextField
              label="PIN (opsional)"
              value={pin}
              onChangeText={value => {
                setPin(digitsOnly(value, 6));
                if (fieldErrors.pin) {
                  setFieldErrors(current => ({ ...current, pin: undefined }));
                }
              }}
              placeholder="6 angka (jika host memasang PIN)"
              keyboardType="number-pad"
              maxLength={6}
              error={fieldErrors.pin ?? null}
            />

            <Button
              label="Gabung Manual"
              onPress={submitManual}
              busy={app.busy}
              disabled={app.busy}
            />
          </View>
        ) : null}

        {app.busy && app.guest ? (
          <View style={styles.progress}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.progressText}>
              Menghubungkan ke ruangan…
            </Text>
          </View>
        ) : null}
      </Card>

      <Text style={styles.footer}>
        Pastikan kedua HP terhubung ke Wi-Fi atau hotspot yang sama.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
  },
  scanBtn: {
    marginTop: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  refresh: {
    color: colors.primary,
    fontSize: 13,
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
    fontSize: 13,
    textAlign: 'center',
  },
  roomItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: '#1e293b',
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#334155',
  },
  roomBodyWrap: {
    flex: 1,
    marginRight: spacing.sm,
  },
  roomRowPressed: {
    opacity: 0.7,
  },
  roomBody: {
    flex: 1,
  },
  roomName: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '700',
  },
  roomSub: {
    fontSize: 11,
    color: '#38bdf8',
    marginTop: 2,
  },
  directJoinBtn: {
    minWidth: 80,
  },
  discoveryNote: {
    color: colors.muted,
    fontSize: 11,
    marginTop: spacing.xs,
  },
  manualToggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  manualBody: {
    marginTop: spacing.md,
  },
  manualNote: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: spacing.md,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  clear: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  progressText: {
    color: colors.muted,
    fontSize: 13,
  },
  footer: {
    color: colors.muted,
    fontSize: 11,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
});
