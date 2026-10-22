import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';
import { DramaGrid } from '@/features/dramas/components';
import { track } from '@/lib/analytics';
import { Api } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { EmptyState, ErrorState, LoadingState } from '@/ui/primitives';
import { colors, radius, spacing } from '@/ui/theme';

export default function SearchScreen() {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');

  // Debounce typing so we search once the user pauses.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = text.trim();
      setQ(next);
      if (next.length >= 2) track('search', { length: next.length });
    }, 350);
    return () => clearTimeout(timer);
  }, [text]);

  const results = useQuery({ queryKey: qk.search(q), queryFn: () => Api.search(q), enabled: q.length >= 2 });

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        testID="search-input"
        autoFocus
        value={text}
        onChangeText={setText}
        placeholder={t('search.placeholder')}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        returnKeyType="search"
        maxLength={60}
      />
      {q.length < 2 ? (
        <EmptyState message={t('search.hint')} />
      ) : results.isPending ? (
        <LoadingState />
      ) : results.isError ? (
        <ErrorState message={errorMessage(results.error)} onRetry={() => results.refetch()} />
      ) : (
        <DramaGrid dramas={results.data.items} empty={<EmptyState message={t('search.empty', { q })} />} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { margin: spacing.lg, backgroundColor: colors.surface, color: colors.text, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: 16 },
});
