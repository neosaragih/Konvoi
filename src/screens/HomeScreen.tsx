import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppBanners } from '../components/AppBanners';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import type { RoomApp } from '../state/useRoomApp';
import { colors, radius, spacing, typography } from '../theme/theme';

interface HomeScreenProps {
  app: RoomApp;
}

export function HomeScreen({ app }: HomeScreenProps) {
  return (
    <Screen>
      <View style={styles.topRow}>
        <View style={styles.brandWrap}>
          <Text style={styles.brand}>Konvoi</Text>
          <Text style={styles.tagline}>
            Suara dan lokasi di jalan, tanpa internet.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Buka pengaturan"
          onPress={() => app.navigate('settings')}
          hitSlop={8}
          style={({ pressed }) => [
            styles.settingsBtn,
            pressed && styles.settingsBtnPressed,
          ]}
        >
          <Text style={styles.settingsLabel}>Pengaturan</Text>
        </Pressable>
      </View>

      <AppBanners
        error={app.error}
        notice={app.notice}
        onDismissError={app.dismissError}
        onDismissNotice={app.dismissNotice}
      />

      <View style={styles.actions}>
        <Button label="Buat Ruangan" onPress={() => app.navigate('create')} />
        <Button
          label="Gabung Ruangan"
          variant="secondary"
          onPress={() => app.navigate('join')}
          style={styles.secondButton}
        />
      </View>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Satu Wi-Fi, tanpa internet</Text>
        <Text style={styles.cardBody}>
          HP host menjadi server ruangan. Peserta lain bergabung lewat Wi-Fi
          atau hotspot yang sama. Tidak ada server di internet dan tidak ada
          data yang dikirim ke cloud.
        </Text>
      </Card>

      <Card style={styles.card}>
        <Badge label="Rombongan Siap" tone="success" />
        <Text style={styles.cardBody}>
          Ruangan, interkom suara WebRTC, peta GPS langsung, dan pemindai QR kamera
          siap digunakan di jaringan Wi-Fi atau hotspot lokal tanpa kuota internet.
        </Text>
      </Card>

      <Text style={styles.footer}>
        Konvoi 0.1.0 · Android & iOS · Tanpa chat
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  brandWrap: {
    flex: 1,
  },
  brand: {
    color: colors.text,
    fontSize: typography.hero,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  tagline: {
    color: colors.muted,
    fontSize: typography.body,
    lineHeight: 22,
    marginTop: spacing.xs,
  },
  settingsBtn: {
    backgroundColor: colors.surfaceAlt,
    borderColor: '#3F3F46',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  settingsBtnPressed: {
    opacity: 0.8,
  },
  settingsLabel: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  actions: {
    marginBottom: spacing.xl,
  },
  secondButton: {
    marginTop: spacing.md,
  },
  card: {
    marginBottom: spacing.lg,
  },
  cardTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: spacing.sm,
  },
  cardBody: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 21,
    marginTop: spacing.sm,
  },
  footer: {
    color: colors.muted,
    fontSize: typography.tiny,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
