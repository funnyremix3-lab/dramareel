export interface Boundary {
  /** Seconds from the start of the source. */
  at: number;
  /** Pause length in seconds (larger = safer place to cut). */
  gap: number;
}

export interface PlanOptions {
  /** Ideal episode length in seconds (e.g. 200 = 3:20). */
  target: number;
  /** Cuts are only placed inside [target - tolerance, target + tolerance]. */
  tolerance: number;
  /** A final remainder shorter than this is merged into the previous episode. */
  minLast: number;
}

export interface Segment {
  number: number;
  start: number;
  end: number;
  /** True when no pause was found in the window and the cut fell back to the exact target. */
  forced: boolean;
}

/** Each second away from the target costs this much; each second of pause earns it back. */
const PAUSE_WEIGHT = 8;

/**
 * Splits [0, duration] into episodes close to `target` seconds, each cut placed on the pause
 * (between sentences) that best balances closeness to the target against pause length.
 */
export function planEpisodes(duration: number, boundaries: Boundary[], opts: PlanOptions): Segment[] {
  const sorted = [...boundaries].sort((a, b) => a.at - b.at);
  const segments: Segment[] = [];
  let start = 0;
  while (duration - start > opts.target + opts.tolerance) {
    const ideal = start + opts.target;
    const lo = ideal - opts.tolerance;
    const hi = ideal + opts.tolerance;
    let best: Boundary | undefined;
    let bestScore = Infinity;
    for (const b of sorted) {
      if (b.at < lo) continue;
      if (b.at > hi) break;
      const score = Math.abs(b.at - ideal) - PAUSE_WEIGHT * Math.min(b.gap, 3);
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    const end = best ? best.at : ideal;
    segments.push({ number: segments.length + 1, start, end, forced: !best });
    start = end;
  }
  const last = segments[segments.length - 1];
  if (last && duration - start < opts.minLast) last.end = duration;
  else segments.push({ number: segments.length + 1, start, end: duration, forced: false });
  return segments.map((s) => ({ ...s, start: round(s.start), end: round(s.end) }));
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Parses `ffmpeg -af silencedetect` stderr into pauses. */
export function parseSilences(stderr: string): Boundary[] {
  const out: Boundary[] = [];
  let open: number | null = null;
  for (const line of stderr.split(/\r?\n/)) {
    const s = /silence_start: (-?[\d.]+)/.exec(line);
    if (s) open = Math.max(0, Number(s[1]));
    const e = /silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/.exec(line);
    if (e && open !== null) {
      const end = Number(e[1]);
      out.push({ at: (open + end) / 2, gap: Number(e[2]) });
      open = null;
    }
  }
  return out;
}

/**
 * Merges caption pauses and audio silences. A caption pause confirmed by real silence nearby gets
 * the larger gap plus a bonus, because both signals agree that nobody is talking there.
 */
export function mergeBoundaries(speech: Boundary[], silences: Boundary[], window = 0.6): Boundary[] {
  const merged = speech.map((p) => {
    const near = silences.find((s) => Math.abs(s.at - p.at) <= window);
    return near ? { at: near.at, gap: Math.max(p.gap, near.gap) + 0.5 } : p;
  });
  for (const s of silences) if (!merged.some((m) => Math.abs(m.at - s.at) <= window)) merged.push(s);
  return merged.sort((a, b) => a.at - b.at);
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = sec.toFixed(3).padStart(6, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
}
