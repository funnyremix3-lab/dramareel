/**
 * Pure player decisions, kept out of components so they are unit-tested.
 */

/** Keep at most prev/current/next mounted: the next one buffers, nothing else holds a decoder. */
export const MOUNT_RADIUS = 1;

export function shouldMountPlayer(index: number, activeIndex: number): boolean {
  return Math.abs(index - activeIndex) <= MOUNT_RADIUS;
}

/** Only the visible slide on a focused, foregrounded screen may play. */
export function shouldPlay(opts: { isActive: boolean; screenFocused: boolean; appActive: boolean; userPaused: boolean; overlayOpen: boolean }) {
  return opts.isActive && opts.screenFocused && opts.appActive && !opts.userPaused && !opts.overlayOpen;
}

export const PROGRESS_REPORT_SECONDS = 15;

/** Report every 15 s of playback, plus whenever playback stops (pause/blur/end/unmount). */
export function shouldReportProgress(position: number, lastReported: number | null): boolean {
  if (lastReported === null) return position >= 1;
  return Math.abs(position - lastReported) >= PROGRESS_REPORT_SECONDS;
}

export type Quality = 'auto' | number; // number = rendition height (short edge for portrait)

/** Quality choices offered to the user, highest first, from the renditions the API returned. */
export function qualityOptions(renditions: { name: string; width: number; height: number }[]): { label: string; value: Quality }[] {
  const byShortEdge = [...new Map(renditions.map((r) => [Math.min(r.width, r.height), r])).values()].sort(
    (a, b) => Math.min(b.width, b.height) - Math.min(a.width, a.height),
  );
  return [{ label: 'auto', value: 'auto' }, ...byShortEdge.map((r) => ({ label: r.name, value: Math.min(r.width, r.height) as Quality }))];
}

/** A saved preference that this episode cannot honour falls back to auto. */
export function effectiveQuality(preferred: Quality, renditions: { width: number; height: number }[]): Quality {
  if (preferred === 'auto') return 'auto';
  return renditions.some((r) => Math.min(r.width, r.height) === preferred) ? preferred : 'auto';
}

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

/** Playback URLs expire; refresh a little before they do. */
export function playbackStaleTime(expiresAt: string, now = Date.now()): number {
  return Math.max(0, new Date(expiresAt).getTime() - now - 5 * 60_000);
}

export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
