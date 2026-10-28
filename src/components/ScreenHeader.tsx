import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: ScreenHeaderProps) {
  return (
    <View style={styles.wrap}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kembali"
          onPress={onBack}
          hitSlop={8}
          style={({ pressed }) => [
            styles.back,
            pressed && styles.backPressed,
          ]}
        >
          <Text style={styles.backLabel}>Kembali</Text>
        </Pressable>
      ) : null}
      <View style={styles.row}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.xl,
  },
  back: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceAlt,
    borderColor: '#3F3F46',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginBottom: spacing.md,
  },
  backPressed: {
    opacity: 0.8,
  },
  backLabel: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: typography.title,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  right: {
    paddingTop: spacing.xs,
  },
});
