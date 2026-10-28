import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  testID,
  style,
}: ButtonProps) {
  const isDisabled = disabled || busy;
  const spinnerColor = variant === 'primary' ? colors.onPrimary : colors.text;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy }}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={spinnerColor} size="small" />
      ) : (
        <Text style={[styles.label, labelStyles[variant]]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 46,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  label: {
    fontSize: typography.body,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  disabled: {
    opacity: 0.45,
  },
});

const variantStyles: Record<ButtonVariant, ViewStyle> = {
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surfaceAlt,
    borderColor: '#3F3F46',
  },
  danger: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
};

const labelStyles: Record<ButtonVariant, { color: string }> = {
  primary: { color: colors.onPrimary },
  secondary: { color: colors.text },
  danger: { color: '#FFFFFF' },
  ghost: { color: colors.muted },
};
