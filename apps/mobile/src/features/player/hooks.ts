import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError } from '@/lib/api/client';
import { Api } from '@/lib/api/endpoints';
import { qk } from '@/lib/query';
import { useAuth } from '../auth/auth-store';
import { playbackStaleTime, shouldReportProgress } from './logic';

/** Tokenised playback URLs for an episode, refreshed shortly before they expire. */
export function usePlayback(episodeId: string, enabled: boolean) {
  const signedIn = useAuth((s) => s.status === 'signedIn');
  return useQuery({
    queryKey: [...qk.playback(episodeId), signedIn],
    queryFn: () => Api.playback(episodeId),
    enabled,
    staleTime: (q) => (q.state.data ? playbackStaleTime(q.state.data.expiresAt) : 0),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });
}

/** True while this screen is focused and the app is in the foreground. */
export function useScreenActive(): boolean {
  const [focused, setFocused] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  return focused && appActive;
}

/**
 * Saves watch progress every ~15 s and when playback stops. Signed-out viewers are not tracked.
 * Returns callbacks to wire into the player.
 */
export function useProgressReporter(episodeId: string) {
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const lastReported = useRef<number | null>(null);
  const position = useRef(0);

  const send = useCallback(
    (pos: number, completed?: boolean) => {
      if (!signedIn) return;
      lastReported.current = pos;
      Api.progress(episodeId, pos, completed).catch(() => undefined); // best effort
    },
    [episodeId, signedIn],
  );

  const onProgress = useCallback(
    (pos: number) => {
      position.current = pos;
      if (shouldReportProgress(pos, lastReported.current)) send(pos);
    },
    [send],
  );

  const flush = useCallback(() => {
    if (position.current >= 1 && position.current !== lastReported.current) send(position.current);
  }, [send]);

  const onEnd = useCallback(() => send(position.current, true), [send]);

  // Flush when the slide unmounts (swiped away, screen closed).
  useEffect(() => flush, [flush]);

  return { onProgress, flush, onEnd };
}
