import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, PressableProps, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, type } from './theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'coin';

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
  testID,
}: {
  label: string;
  onPress?: PressableProps['onPress'];
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.button, buttonVariants[variant], pressed && styles.pressed, inactive && styles.disabled, style]}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.text : colors.accent} />
      ) : (
        <View style={styles.buttonRow}>
          {icon}
          <Text style={[styles.buttonLabel, variant === 'coin' && { color: '#3A2A00' }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.heading, style]}>{children}</Text>;
}

export function Caption({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return (
    <Text style={[type.caption, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Centered({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.centered, style]}>{children}</View>;
}

export function LoadingState({ testID }: { testID?: string }) {
  return (
    <Centered>
      <ActivityIndicator testID={testID ?? 'loading'} color={colors.accent} size="large" />
    </Centered>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <Centered>
      <Text style={styles.stateText} testID="error-state">
        {message ?? t('common.error')}
      </Text>
      {onRetry ? <Button label={t('common.retry')} variant="secondary" onPress={onRetry} style={{ marginTop: spacing.lg }} /> : null}
    </Centered>
  );
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <Centered style={{ paddingVertical: spacing.xxl }}>
      <Text style={styles.stateText} testID="empty-state">
        {message}
      </Text>
      {action}
    </Centered>
  );
}

export function Pill({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const buttonVariants: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surfaceRaised },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  coin: { backgroundColor: colors.coin },
};

const styles = StyleSheet.create({
  button: { minHeight: 48, borderRadius: radius.pill, paddingHorizontal: spacing.xl, alignItems: 'center', justifyContent: 'center' },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  buttonLabel: { color: colors.text, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  stateText: { color: colors.textSecondary, fontSize: 15, textAlign: 'center' },
  pill: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surface },
  pillActive: { backgroundColor: colors.accent },
  pillText: { color: colors.textSecondary, fontWeight: '600' },
});
