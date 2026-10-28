import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppBanners } from '../components/AppBanners';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import type { RoomApp } from '../state/useRoomApp';
import { colors, spacing, typography } from '../theme/theme';

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
          hitSlop={10}
        >
          <Text style={styles.settings}>Pengaturan</Text>
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
        <Badge label="Build pengembangan" tone="warning" />
        <Text style={styles.cardBody}>
          Ruangan, daftar peserta, dan suara WebRTC sudah terpasang, tetapi
          belum diuji di perangkat fisik. GPS dan peta offline belum aktif, jadi
          tombol lokasi dan peta ditandai belum tersedia.
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
    fontWeight: '900',
    letterSpacing: -1,
  },
  tagline: {
    color: colors.muted,
    fontSize: typography.body,
    lineHeight: 23,
    marginTop: spacing.xs,
  },
  settings: {
    color: colors.primary,
    fontSize: typography.small,
    fontWeight: '700',
    paddingTop: spacing.sm,
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
    fontWeight: '800',
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
