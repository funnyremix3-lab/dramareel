import { dedupeRollingCues, parseJson3, parseVtt, speechPauses, wordsToLines } from './captions';
import { formatTime, mergeBoundaries, parseSilences, planEpisodes } from './plan';
import { sliceCues, toVtt } from './vtt';

describe('planEpisodes', () => {
  const opts = { target: 200, tolerance: 25, minLast: 60 };

  it('cuts on the pause nearest the target, preferring longer pauses', () => {
    const plan = planEpisodes(600, [
      { at: 190, gap: 0.4 },
      { at: 205, gap: 1.5 }, // longer pause, 5 s from target → wins
      { at: 199, gap: 0.2 },
      { at: 400, gap: 0.8 },
    ], opts);
    expect(plan.map((s) => [s.start, s.end])).toEqual([[0, 205], [205, 400], [400, 600]]);
    expect(plan.every((s) => !s.forced)).toBe(true);
  });

  it('falls back to an exact cut when no pause is inside the window', () => {
    const plan = planEpisodes(500, [{ at: 100, gap: 2 }], opts);
    expect(plan[0]).toMatchObject({ start: 0, end: 200, forced: true });
  });

  it('merges a short remainder into the last episode', () => {
    const plan = planEpisodes(430, [{ at: 200, gap: 1 }, { at: 400, gap: 1 }], opts);
    expect(plan.map((s) => [s.start, s.end])).toEqual([[0, 200], [200, 430]]);
  });

  it('keeps a single episode for short sources', () => {
    expect(planEpisodes(150, [], opts)).toEqual([{ number: 1, start: 0, end: 150, forced: false }]);
  });

  it('never leaves gaps or overlaps between episodes', () => {
    const bounds = Array.from({ length: 300 }, (_, i) => ({ at: i * 20 + 7, gap: (i % 5) / 4 }));
    const plan = planEpisodes(6129, bounds, opts);
    expect(plan[0].start).toBe(0);
    expect(plan[plan.length - 1].end).toBe(6129);
    for (let i = 1; i < plan.length; i++) expect(plan[i].start).toBe(plan[i - 1].end);
    for (const s of plan.slice(0, -1)) expect(Math.abs(s.end - s.start - 200)).toBeLessThanOrEqual(25);
  });
});

describe('captions', () => {
  const json3 = JSON.stringify({
    events: [
      { tStartMs: 1000, dDurationMs: 3000, segs: [{ utf8: 'hello' }, { utf8: ' there.', tOffsetMs: 500 }] },
      { tStartMs: 2000, aAppend: 1, segs: [{ utf8: '\n' }] },
      { tStartMs: 3000, dDurationMs: 2000, segs: [{ utf8: 'next' }, { utf8: ' line', tOffsetMs: 400 }] },
    ],
  });

  it('parses json3 into clamped word cues', () => {
    const words = parseJson3(json3);
    expect(words.map((w) => w.text)).toEqual(['hello', 'there.', 'next', 'line']);
    expect(words[1]).toMatchObject({ start: 1.5, end: 3 });
    expect(words[3]).toMatchObject({ start: 3.4, end: 5 });
  });

  it('finds pauses and boosts sentence ends', () => {
    const pauses = speechPauses([
      { start: 0, end: 0.5, text: 'one' },
      { start: 0.6, end: 1.2, text: 'done.' },
      { start: 1.4, end: 2, text: 'next' },
      { start: 2.5, end: 3, text: 'word' },
    ]);
    expect(pauses).toEqual([
      { at: expect.closeTo(1.3, 5), gap: expect.closeTo(0.9, 5) },
      { at: expect.closeTo(2.25, 5), gap: expect.closeTo(0.5, 5) },
    ]);
  });

  it('treats sentence ends as boundaries even when captions leave no gap', () => {
    const pauses = speechPauses([
      { start: 0, end: 1, text: 'Stop.' },
      { start: 1, end: 1.4, text: 'Now' },
    ]);
    expect(pauses).toEqual([{ at: expect.closeTo(0.85, 5), gap: expect.closeTo(1.1, 5) }]);
  });

  it('caps stretched auto-caption words so real pauses show up', () => {
    expect(speechPauses([{ start: 0, end: 2, text: 'well' }, { start: 2, end: 2.3, text: 'then' }])).toEqual([
      { at: expect.closeTo(1.35, 5), gap: expect.closeTo(1.3, 5) },
    ]);
  });

  it('groups words into subtitle lines at sentence ends, pauses and length limits', () => {
    const w = (start: number, text: string) => ({ start, end: start + 0.3, text });
    const lines = wordsToLines([w(0, 'I'), w(0.3, 'know.'), w(0.7, 'Wait'), w(2, 'what'), w(2.3, 'happened')], 42, 4, 0.6);
    expect(lines.map((l) => l.text)).toEqual(['I know.', 'Wait', 'what happened']);
    expect(lines[0]).toMatchObject({ start: 0, end: 0.7 });
    expect(wordsToLines([w(0, 'aaaa'), w(0.3, 'bbbb'), w(0.6, 'cccc')], 9).map((l) => l.text)).toEqual(['aaaa bbbb', 'cccc']);
  });

  it('parses VTT and drops rolling-caption repeats', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<c>first</c>\n\n00:00:02.000 --> 00:00:03.000\nfirst\nsecond\n\n00:00:03.000 --> 00:00:04.000\nsecond\nthird\n';
    expect(dedupeRollingCues(parseVtt(vtt)).map((c) => c.text)).toEqual(['first', 'second', 'third']);
  });
});

describe('silences and merging', () => {
  it('parses silencedetect output', () => {
    const log = '[silencedetect @ 0x1] silence_start: 10.5\n[silencedetect @ 0x1] silence_end: 11.5 | silence_duration: 1\n';
    expect(parseSilences(log)).toEqual([{ at: 11, gap: 1 }]);
  });

  it('boosts caption pauses confirmed by silence and keeps silence-only pauses', () => {
    const merged = mergeBoundaries([{ at: 10, gap: 0.4 }], [{ at: 10.2, gap: 0.8 }, { at: 50, gap: 0.5 }]);
    expect(merged).toEqual([{ at: 10.2, gap: 1.3 }, { at: 50, gap: 0.5 }]);
  });
});

describe('per-episode subtitles', () => {
  it('clips and shifts cues to the episode window', () => {
    const cues = [
      { start: 195, end: 202, text: 'across the cut' },
      { start: 203, end: 205, text: 'inside' },
      { start: 410, end: 412, text: 'after' },
    ];
    expect(sliceCues(cues, 200, 400)).toEqual([
      { start: 0, end: 2, text: 'across the cut' },
      { start: 3, end: 5, text: 'inside' },
    ]);
    expect(toVtt([{ start: 3, end: 5.25, text: 'inside' }])).toBe('WEBVTT\n\n00:00:03.000 --> 00:00:05.250\ninside\n');
  });

  it('formats times', () => {
    expect(formatTime(200)).toBe('03:20.000');
    expect(formatTime(6129.5)).toBe('1:42:09.500');
  });
});
