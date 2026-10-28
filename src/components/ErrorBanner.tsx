import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/theme';

interface ErrorBannerProps {
  message: string | null;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  if (!message) {
    return null;
  }
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <Text style={styles.text}>{message}</Text>
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tutup pesan"
          onPress={onDismiss}
          hitSlop={10}
        >
          <Text style={styles.dismiss}>Tutup</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  text: {
    flex: 1,
    color: colors.danger,
    fontSize: typography.small,
    lineHeight: 20,
  },
  dismiss: {
    color: colors.danger,
    fontSize: typography.small,
    fontWeight: '800',
  },
});
