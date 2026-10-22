import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Api } from '@/lib/api/endpoints';
import type { Comment } from '@/lib/api/types';
import { errorMessage } from '@/lib/i18n';
import { qk, queryClient } from '@/lib/query';
import { Caption, EmptyState, ErrorState } from '@/ui/primitives';
import { Sheet } from '@/ui/Sheet';
import { colors, radius, spacing } from '@/ui/theme';
import { useRequireAuth } from '../auth/use-require-auth';

const REASONS = ['SPAM', 'ABUSE', 'HATE', 'SEXUAL', 'OTHER'] as const;

export function CommentsSheet({ episodeId, visible, onClose }: { episodeId: string; visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const requireAuth = useRequireAuth();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const comments = useInfiniteQuery({
    queryKey: qk.comments(episodeId),
    queryFn: ({ pageParam }) => Api.comments(episodeId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: visible,
  });
  const items = comments.data?.pages.flatMap((p) => p.items) ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.comments(episodeId) });

  const post = useMutation({
    mutationFn: (body: string) => Api.postComment(episodeId, body),
    onSuccess: () => {
      setDraft('');
      setError(null);
      void refresh();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const openActions = (c: Comment) => {
    if (c.isMine) {
      Alert.alert(c.author.displayName, undefined, [
        { text: t('comments.delete'), style: 'destructive', onPress: () => Api.deleteComment(c.id).then(refresh).catch(() => undefined) },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
      return;
    }
    requireAuth(() =>
      Alert.alert(c.author.displayName, undefined, [
        { text: t('comments.report'), onPress: () => chooseReason(c) },
        {
          text: t('comments.block'),
          style: 'destructive',
          onPress: () =>
            Api.blockUser(c.author.id)
              .then(() => (Alert.alert(t('comments.blocked')), refresh()))
              .catch((e) => Alert.alert(errorMessage(e))),
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]),
    );
  };

  const chooseReason = (c: Comment) =>
    Alert.alert(t('comments.reportReason'), undefined, [
      ...REASONS.map((r) => ({
        text: t(`comments.reasons.${r}`),
        onPress: () =>
          Api.reportComment(c.id, r)
            .then(() => Alert.alert(t('comments.reported')))
            .catch((e) => Alert.alert(errorMessage(e))),
      })),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);

  return (
    <Sheet visible={visible} onClose={onClose} title={t('comments.title')} heightRatio={0.75} testID="comments-sheet">
      {comments.isError ? (
        <ErrorState message={errorMessage(comments.error)} onRetry={() => comments.refetch()} />
      ) : comments.isPending ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.xl }} />
      ) : (
        <FlatList
          style={{ flexGrow: 0, minHeight: 200 }}
          data={items}
          keyExtractor={(c) => c.id}
          onEndReached={() => comments.hasNextPage && comments.fetchNextPage()}
          ListEmptyComponent={<EmptyState message={t('comments.empty')} />}
          renderItem={({ item }) => (
            <Pressable onLongPress={() => openActions(item)} style={styles.comment}>
              <Text style={styles.author}>{item.author.displayName}</Text>
              <Text style={styles.body}>{item.body}</Text>
              <Caption>{new Date(item.createdAt).toLocaleDateString()}</Caption>
            </Pressable>
          )}
        />
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.composer}>
        <TextInput
          testID="comment-input"
          value={draft}
          onChangeText={setDraft}
          placeholder={t('comments.placeholder')}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          maxLength={500}
          onFocus={() => requireAuth(() => undefined)}
        />
        <Pressable
          testID="comment-post"
          disabled={!draft.trim() || post.isPending}
          onPress={() => requireAuth(() => post.mutate(draft.trim()))}
          style={[styles.post, (!draft.trim() || post.isPending) && { opacity: 0.4 }]}>
          <Text style={styles.postText}>{t('comments.post')}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  comment: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 2 },
  author: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  body: { color: colors.text, fontSize: 15 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
  input: { flex: 1, color: colors.text, backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  post: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  postText: { color: colors.accent, fontWeight: '700' },
  error: { color: colors.danger, marginTop: spacing.sm },
});
