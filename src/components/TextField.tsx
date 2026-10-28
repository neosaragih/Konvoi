import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme/theme';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  helper?: string;
  error?: string | null;
}

export function TextField({
  label,
  helper,
  error,
  onFocus,
  onBlur,
  ...input
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        onFocus={e => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={e => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
        ]}
        {...input}
      />
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '500',
    marginBottom: spacing.sm - 2,
    letterSpacing: -0.1,
  },
  input: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: typography.body,
  },
  inputFocused: {
    borderColor: colors.primary,
  },
  inputError: {
    borderColor: colors.danger,
  },
  helper: {
    color: colors.muted,
    fontSize: typography.tiny,
    marginTop: spacing.xs + 1,
    lineHeight: 16,
  },
  error: {
    color: colors.danger,
    fontSize: typography.tiny,
    marginTop: spacing.xs + 1,
    lineHeight: 16,
  },
});
