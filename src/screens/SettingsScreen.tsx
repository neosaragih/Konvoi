import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppBanners } from '../components/AppBanners';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import type { RoomApp } from '../state/useRoomApp';
import { colors, spacing, typography } from '../theme/theme';

interface SettingsScreenProps {
  app: RoomApp;
}

interface SectionProps {
  title: string;
  badge?: string;
  children: React.ReactNode;
}

function Section({ title, badge, children }: SectionProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {badge ? <Badge label={badge} tone="neutral" /> : null}
      </View>
      {children}
    </Card>
  );
}

export function SettingsScreen({ app }: SettingsScreenProps) {
  return (
    <Screen>
      <ScreenHeader
        title="Pengaturan & Tentang"
        subtitle="Batasan, kompatibilitas, dan lisensi."
        onBack={app.goBack}
      />

      <AppBanners
        error={app.error}
        notice={app.notice}
        onDismissError={app.dismissError}
        onDismissNotice={app.dismissNotice}
      />

      <Section title="Tentang" badge="0.1.0">
        <Text style={styles.body}>
          Konvoi adalah aplikasi suara dan lokasi untuk konvoi kendaraan. HP
          host menjalankan server ruangan; peserta lain bergabung lewat Wi-Fi
          atau hotspot yang sama. Tidak ada chat dan tidak ada server internet.
        </Text>
        <Text style={styles.meta}>
          React Native 0.88.1 · Android & iOS · Protokol NDJSON v1
        </Text>
      </Section>

      <Section title="Batasan jaringan" badge="LAN saja">
        <Text style={styles.body}>
          Semua perangkat harus berada di Wi-Fi atau hotspot yang sama. Router
          dengan client isolation dapat memblokir koneksi antar-HP. Wi-Fi Direct
          tidak tersedia di iOS, jadi bukan jalur yang didukung.
        </Text>
        <Text style={styles.body}>
          Host harus tetap di depan layar. Belum ada hosting latar belakang,
          audio latar belakang, atau lokasi latar belakang.
        </Text>
        <Text style={styles.meta}>Kapasitas: 12 peserta · 6 di suara.</Text>
      </Section>

      <Section title="Suara & Bluetooth" badge="Belum teruji">
        <Text style={styles.body}>
          Suara WebRTC sudah terpasang: audio dikirim langsung antar-HP dengan
          iceServers kosong, tanpa STUN, TURN, atau server internet. Mikrofon
          hanya menyala setelah Anda menekan Mulai Suara, dan langsung berhenti
          saat keluar suara, keluar ruangan, dikeluarkan, ruangan ditutup, atau
          aplikasi masuk latar belakang.
        </Text>
        <Text style={styles.body}>
          Audio belum diverifikasi di perangkat fisik. Interkom Bluetooth
          memakai profil HFP/HSP yang diatur sistem. Perangkat A2DP saja tidak
          punya mikrofon yang bisa dipakai; Konvoi tidak akan memalsukan rute
          audio.
        </Text>
      </Section>

      <Section title="Peta & lokasi" badge="Belum aktif">
        <Text style={styles.body}>
          Paket peta offline MapLibre belum disertakan. Konvoi tidak memakai
          tile online, jadi tanpa paket offline peta tidak ditampilkan. Saat
          peta tersedia, atribusi OpenStreetMap wajib tampil.
        </Text>
        <Text style={styles.body}>
          Lokasi hanya disimpan di memori ruangan. Tidak ada riwayat, tidak ada
          unggahan, dan lokasi dihapus saat berbagi dihentikan, peserta keluar,
          atau ruangan ditutup.
        </Text>
      </Section>

      <Section title="Keterbukaan" badge="Tanpa enkripsi">
        <Text style={styles.body}>
          PIN hanya membatasi siapa yang boleh bergabung. Sinyal suara dan
          lokasi dikirim tanpa enkripsi di jaringan lokal. Jangan gunakan Konvoi
          di jaringan yang tidak Anda percaya.
        </Text>
        <Text style={styles.body}>
          PIN, koordinat, dan audio tidak pernah ditulis ke log atau disimpan ke
          disk.
        </Text>
      </Section>

      <Section title="Lisensi & atribusi">
        <Text style={styles.body}>
          React Native (MIT), react-native-tcp-socket (MIT), react-native-
          zeroconf (MIT). Peta nantinya memakai MapLibre dan data ©
          OpenStreetMap contributors (ODbL).
        </Text>
      </Section>

      <Text style={styles.footer}>
        Build pengembangan. Perilaku di perangkat fisik belum diverifikasi.
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
    marginTop: spacing.sm,
  },
  meta: {
    color: colors.text,
    fontSize: typography.tiny,
    lineHeight: 18,
    marginTop: spacing.md,
  },
  footer: {
    color: colors.muted,
    fontSize: typography.tiny,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
