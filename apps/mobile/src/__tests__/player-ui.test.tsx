import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EpisodeGrid } from '@/features/player/EpisodesSheet';
import { EpisodeSlide, EpisodeSlideProps } from '@/features/player/EpisodeSlide';
import { ApiError } from '@/lib/api/client';
import { Api } from '@/lib/api/endpoints';
import type { Episode } from '@/lib/api/types';
import '@/lib/i18n';

jest.mock('@/lib/api/endpoints', () => ({ Api: { playback: jest.fn(), progress: jest.fn(async () => ({})), like: jest.fn() } }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));

const playback = Api.playback as jest.Mock;

const episode = (n: number, over: Partial<Episode> = {}): Episode => ({
  id: `ep-${n}`,
  number: n,
  title: null,
  durationSeconds: 60,
  thumbnailUrl: null,
  access: n <= 5 ? 'FREE' : 'PREMIUM',
  locked: false,
  unlockCoins: null,
  likeCount: 3,
  commentCount: 1,
  liked: false,
  ...over,
});

async function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const baseProps = (e: Episode): EpisodeSlideProps => ({
  episode: e,
  dramaTitle: 'My Boss Is My Ex',
  height: 844,
  isActive: true,
  mounted: true,
  screenActive: true,
  overlayOpen: false,
  onEnded: jest.fn(),
  onUnlock: jest.fn(),
  onOpenComments: jest.fn(),
  onOpenSettings: jest.fn(),
});

describe('EpisodeSlide states', () => {
  beforeEach(() => playback.mockReset());

  it('plays an unlocked episode: fetches playback and mounts the video', async () => {
    playback.mockResolvedValue({
      manifestUrl: 'https://media.test/p/t/a/master.m3u8',
      renditions: [{ name: '720p', width: 720, height: 1280, bandwidth: 1 }],
      subtitles: [],
      resumePositionSeconds: 0,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await wrap(<EpisodeSlide {...baseProps(episode(1))} />);
    expect(await screen.findByTestId('video-1')).toBeTruthy();
    expect(screen.getByText('Episode 1')).toBeTruthy();
    expect(playback).toHaveBeenCalledWith('ep-1');
  });

  it('shows the locked state and never requests playback for a locked episode', async () => {
    const props = baseProps(episode(8, { locked: true, unlockCoins: 30 }));
    await wrap(<EpisodeSlide {...props} />);
    expect(screen.getByTestId('locked-state')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('open-unlock'));
    expect(props.onUnlock).toHaveBeenCalledWith(expect.objectContaining({ number: 8 }));
    expect(playback).not.toHaveBeenCalled();
    expect(screen.queryByTestId('video-8')).toBeNull();
  });

  it('treats a server EPISODE_LOCKED answer as locked', async () => {
    playback.mockRejectedValue(new ApiError(403, 'EPISODE_LOCKED', 'locked'));
    await wrap(<EpisodeSlide {...baseProps(episode(7))} />);
    expect(await screen.findByTestId('locked-state')).toBeTruthy();
  });

  it('shows an error with retry for other failures', async () => {
    playback.mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'offline'));
    await wrap(<EpisodeSlide {...baseProps(episode(2))} />);
    expect(await screen.findByTestId('player-error')).toBeTruthy();
    playback.mockResolvedValueOnce({ manifestUrl: 'https://m/x.m3u8', renditions: [], subtitles: [], resumePositionSeconds: 0, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    await fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByTestId('video-2')).toBeTruthy());
  });

  it('does not mount a player for slides outside the window', async () => {
    await wrap(<EpisodeSlide {...baseProps(episode(3))} mounted={false} isActive={false} />);
    expect(playback).not.toHaveBeenCalled();
    expect(screen.queryByTestId('video-3')).toBeNull();
  });
});

describe('EpisodeGrid', () => {
  it('marks locked episodes and reports selection', async () => {
    const onSelect = jest.fn();
    const episodes = [episode(1), episode(6, { locked: true }), episode(7, { locked: true })];
    await wrap(<EpisodeGrid episodes={episodes} currentNumber={1} onSelect={onSelect} />);
    expect(screen.queryByTestId('episode-lock-1')).toBeNull();
    expect(screen.getByTestId('episode-lock-6')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('episode-cell-7'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ number: 7 }));
  });
});
