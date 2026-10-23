import { canShowInterstitial } from '@/features/ads/policy';
import {
  effectiveQuality,
  formatTime,
  playbackStaleTime,
  qualityOptions,
  shouldMountPlayer,
  shouldPlay,
  shouldReportProgress,
} from '@/features/player/logic';
import type { AdPlacementConfig } from '@/lib/api/types';

describe('player lifecycle', () => {
  it('mounts at most previous, current and next players', () => {
    const mounted = [0, 1, 2, 3, 4, 5].filter((i) => shouldMountPlayer(i, 3));
    expect(mounted).toEqual([2, 3, 4]);
  });

  it('plays only the active slide on a focused, foreground screen with no sheet open', () => {
    const base = { isActive: true, screenFocused: true, appActive: true, userPaused: false, overlayOpen: false };
    expect(shouldPlay(base)).toBe(true);
    expect(shouldPlay({ ...base, isActive: false })).toBe(false);
    expect(shouldPlay({ ...base, screenFocused: false })).toBe(false);
    expect(shouldPlay({ ...base, appActive: false })).toBe(false);
    expect(shouldPlay({ ...base, userPaused: true })).toBe(false);
    expect(shouldPlay({ ...base, overlayOpen: true })).toBe(false);
  });

  it('reports progress every 15 seconds', () => {
    expect(shouldReportProgress(0.4, null)).toBe(false);
    expect(shouldReportProgress(2, null)).toBe(true);
    expect(shouldReportProgress(16, 2)).toBe(false);
    expect(shouldReportProgress(17, 2)).toBe(true);
    expect(shouldReportProgress(3, 40)).toBe(true); // seeked backwards
  });
});

describe('quality selection', () => {
  const renditions = [
    { name: '480p', width: 480, height: 854 },
    { name: '720p', width: 720, height: 1280 },
  ];

  it('offers Auto plus the available renditions, highest first', () => {
    expect(qualityOptions(renditions).map((o) => o.value)).toEqual(['auto', 720, 480]);
  });

  it('falls back to auto when the saved quality is unavailable', () => {
    expect(effectiveQuality(1080, renditions)).toBe('auto');
    expect(effectiveQuality(480, renditions)).toBe(480);
    expect(effectiveQuality('auto', renditions)).toBe('auto');
  });
});

describe('playback URL freshness', () => {
  it('refreshes five minutes before expiry and never goes negative', () => {
    const now = Date.parse('2026-10-22T10:00:00Z');
    expect(playbackStaleTime('2026-10-22T11:00:00Z', now)).toBe(55 * 60_000);
    expect(playbackStaleTime('2026-10-22T10:01:00Z', now)).toBe(0);
  });

  it('formats times', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
  });
});

describe('interstitial policy', () => {
  const placement: AdPlacementConfig = {
    key: 'between_episodes_interstitial',
    format: 'INTERSTITIAL',
    source: 'ADMOB',
    enabled: true,
    adUnitId: 'ca-app-pub-3940256099942544/1033173712',
    minEpisodesBetween: 4,
    minSecondsBetween: 300,
    maxPerUserPerDay: 12,
    rewardCoins: null,
    remainingToday: null,
  };
  const now = 1_000_000_000;

  it('never shows on every transition', () => {
    for (let n = 0; n < 4; n++) {
      expect(canShowInterstitial(placement, { transitionsSinceLast: n, lastShownAt: null, shownToday: 0 }, now)).toBe(false);
    }
    expect(canShowInterstitial(placement, { transitionsSinceLast: 4, lastShownAt: null, shownToday: 0 }, now)).toBe(true);
  });

  it('respects the time gap and daily cap', () => {
    expect(canShowInterstitial(placement, { transitionsSinceLast: 9, lastShownAt: now - 60_000, shownToday: 1 }, now)).toBe(false);
    expect(canShowInterstitial(placement, { transitionsSinceLast: 9, lastShownAt: now - 400_000, shownToday: 1 }, now)).toBe(true);
    expect(canShowInterstitial(placement, { transitionsSinceLast: 9, lastShownAt: null, shownToday: 12 }, now)).toBe(false);
  });

  it('is off for disabled placements (e.g. ad-free subscribers) and enforces a floor of 2 episodes', () => {
    expect(canShowInterstitial({ ...placement, enabled: false }, { transitionsSinceLast: 99, lastShownAt: null, shownToday: 0 }, now)).toBe(false);
    expect(canShowInterstitial({ ...placement, minEpisodesBetween: 0 }, { transitionsSinceLast: 1, lastShownAt: null, shownToday: 0 }, now)).toBe(false);
    expect(canShowInterstitial(undefined, { transitionsSinceLast: 99, lastShownAt: null, shownToday: 0 }, now)).toBe(false);
  });
});

describe('subtitle selection', () => {
  const { chooseSubtitle } = jest.requireActual<typeof import('@/features/player/logic')>('@/features/player/logic');
  const subs = [
    { language: 'en', isDefault: true },
    { language: 'hi', isDefault: false },
  ];

  it('auto prefers the app language, then the default track', () => {
    expect(chooseSubtitle(subs, 'auto', 'hi')).toBe('hi');
    expect(chooseSubtitle(subs, 'auto', 'ta')).toBe('en');
    expect(chooseSubtitle([{ language: 'hi', isDefault: false }], 'auto', 'en')).toBeNull();
  });

  it('respects an explicit choice or off', () => {
    expect(chooseSubtitle(subs, 'en', 'hi')).toBe('en');
    expect(chooseSubtitle(subs, 'off', 'hi')).toBeNull();
    expect(chooseSubtitle(subs, 'ta', 'hi')).toBeNull();
    expect(chooseSubtitle([], 'auto', 'hi')).toBeNull();
  });
});
