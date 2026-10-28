import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/theme';

export type BadgeTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'primary';

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: ViewStyle;
}

const toneStyles: Record<BadgeTone, { background: string; color: string }> = {
  neutral: { background: colors.surfaceAlt, color: colors.muted },
  success: { background: '#15392C', color: colors.success },
  warning: { background: '#3A3017', color: colors.warning },
  danger: { background: colors.dangerSurface, color: colors.danger },
  primary: { background: '#3A2418', color: colors.primary },
};

export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const palette = toneStyles[tone];
  return (
    <View style={[styles.base, { backgroundColor: palette.background }, style]}>
      <Text style={[styles.label, { color: palette.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  label: {
    fontSize: typography.tiny,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
