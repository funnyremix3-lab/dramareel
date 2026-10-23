import { Children, ReactNode } from 'react';
import { ActivityIndicator, Pressable, PressableProps, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from './Icon';
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

export function EmptyState({ message, action, icon, title, style }: { message: string; action?: ReactNode; icon?: IconName; title?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Centered style={[{ paddingVertical: spacing.xxl, gap: spacing.sm }, style]}>
      {icon ? (
        <View style={styles.emptyIcon}>
          <Icon name={icon} size={30} color={colors.accent} />
        </View>
      ) : null}
      {title ? <Text style={[type.heading, { textAlign: 'center' }]}>{title}</Text> : null}
      <Text style={styles.stateText} testID="empty-state">
        {message}
      </Text>
      {action}
    </Centered>
  );
}

/** Tappable settings/menu row: leading icon, label, optional value and chevron. */
export function ListRow({
  icon,
  label,
  value,
  onPress,
  danger,
  testID,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  testID?: string;
}) {
  const tint = danger ? colors.danger : colors.text;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceRaised }]}>
      <View style={[styles.rowIcon, danger && { backgroundColor: 'rgba(255,69,58,0.12)' }]}>
        <Icon name={icon} size={18} color={tint} />
      </View>
      <Text style={[styles.rowLabel, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress && !danger ? <Icon name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

/** Rounded container that groups ListRows with hairline separators. */
export function ListGroup({ children, title }: { children: ReactNode; title?: string }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={{ gap: spacing.sm }}>
      {title ? <Text style={styles.groupTitle}>{title}</Text> : null}
      <View style={styles.group}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 ? <View style={styles.separator} /> : null}
            {row}
          </View>
        ))}
      </View>
    </View>
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
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,45,85,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 52 },
  rowIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  rowValue: { color: colors.textSecondary, fontSize: 14, maxWidth: '40%' },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  groupTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: spacing.xs },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.lg + 32 + spacing.md },
});
