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

const toneStyles: Record<
  BadgeTone,
  { background: string; border: string; color: string }
> = {
  neutral: {
    background: colors.surfaceAlt,
    border: '#3F3F46',
    color: colors.muted,
  },
  success: {
    background: 'rgba(34, 197, 94, 0.12)',
    border: 'rgba(34, 197, 94, 0.35)',
    color: '#4ADE80',
  },
  warning: {
    background: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.35)',
    color: '#FBBF24',
  },
  danger: {
    background: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.35)',
    color: '#F87171',
  },
  primary: {
    background: 'rgba(56, 189, 248, 0.12)',
    border: 'rgba(56, 189, 248, 0.35)',
    color: '#38BDF8',
  },
};

export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const palette = toneStyles[tone];
  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
        },
        style,
      ]}
    >
      <Text style={[styles.label, { color: palette.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs - 1,
  },
  label: {
    fontSize: typography.tiny,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});
