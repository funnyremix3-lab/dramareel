import { ScrollView, StyleSheet, Text } from 'react-native';
import { colors, spacing, type } from '@/ui/theme';

/** Attribution required by the licences of code and assets we ship. */
const NOTICES = [
  {
    name: 'BytePlus VideoOne (React Native client)',
    license: 'Apache License 2.0',
    text: 'Portions of the user interface, icons and animations are derived from BytePlus VideoOne. Copyright 2023 BytePlus Pte. Ltd. Licensed under the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0). Modified by Reel Drama.',
  },
  { name: 'Expo project template', license: 'MIT', text: 'Copyright (c) 2015-present 650 Industries, Inc. (aka Expo).' },
  { name: 'react-native-video', license: 'MIT', text: 'Copyright (c) 2016 Project Video.' },
  { name: 'React Native, Expo SDK, TanStack Query, Zustand, i18next, Zod', license: 'MIT', text: 'See each package for its copyright notice.' },
];

export default function LicensesScreen() {
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      {NOTICES.map((n) => (
        <Text key={n.name} style={styles.block}>
          <Text style={type.heading}>{n.name}</Text>
          {'\n'}
          <Text style={styles.license}>{n.license}</Text>
          {'\n'}
          {n.text}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  block: { color: colors.textSecondary, lineHeight: 20 },
  license: { color: colors.accent, fontWeight: '600' },
});
