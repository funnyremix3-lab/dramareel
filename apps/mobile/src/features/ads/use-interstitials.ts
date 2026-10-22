import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { Api } from '@/lib/api/endpoints';
import { qk } from '@/lib/query';
import { InterstitialSlot } from './ads';
import { canShowInterstitial, InterstitialState } from './policy';

const dayKey = () => new Date().toISOString().slice(0, 10);

/** Counts episode transitions and occasionally shows an interstitial when the policy allows. */
export function useBetweenEpisodeInterstitial() {
  const { data } = useQuery({ queryKey: qk.adsConfig, queryFn: Api.adsConfig, staleTime: 10 * 60_000 });
  const placement = data?.placements.find((p) => p.key === 'between_episodes_interstitial');
  const slot = useRef<InterstitialSlot | null>(null);
  const state = useRef<InterstitialState & { day: string }>({ transitionsSinceLast: 0, lastShownAt: null, shownToday: 0, day: dayKey() });

  useEffect(() => {
    if (!placement?.enabled || !placement.adUnitId || data?.adFree) {
      slot.current = null;
      return;
    }
    slot.current = new InterstitialSlot(placement.adUnitId);
    slot.current.preload();
  }, [placement?.enabled, placement?.adUnitId, data?.adFree]);

  /** Call on every episode change. Resolves true if an ad was shown (caller pauses meanwhile). */
  return useCallback(async (): Promise<boolean> => {
    const s = state.current;
    if (s.day !== dayKey()) Object.assign(s, { shownToday: 0, day: dayKey() });
    s.transitionsSinceLast += 1;
    if (!slot.current?.ready || data?.adFree || !canShowInterstitial(placement, s, Date.now())) {
      slot.current?.preload();
      return false;
    }
    const shown = await slot.current.show();
    if (shown) Object.assign(s, { transitionsSinceLast: 0, lastShownAt: Date.now(), shownToday: s.shownToday + 1 });
    slot.current.preload();
    return shown;
  }, [placement, data?.adFree]);
}
