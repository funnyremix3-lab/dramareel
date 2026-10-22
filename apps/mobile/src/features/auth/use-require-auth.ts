import { router } from 'expo-router';
import { useCallback } from 'react';
import { useAuth } from './auth-store';

/** Wraps an action so signed-out users are sent to sign-in first. */
export function useRequireAuth() {
  const signedIn = useAuth((s) => s.status === 'signedIn');
  return useCallback(
    <T,>(action: () => T): T | undefined => {
      if (signedIn) return action();
      router.push('/sign-in');
      return undefined;
    },
    [signedIn],
  );
}
