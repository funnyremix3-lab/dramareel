/** A timed piece of speech, in seconds. */
export interface Cue {
  start: number;
  end: number;
  text: string;
}

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  aAppend?: number;
  segs?: { utf8?: string; tOffsetMs?: number }[];
}

/**
 * Parses YouTube "json3" captions into word-level cues. Auto-captions carry one event per line with
 * per-word offsets; a word ends where the next one starts (or at the end of its event).
 */
export function parseJson3(raw: string): Cue[] {
  const events: Json3Event[] = JSON.parse(raw).events ?? [];
  const words: Cue[] = [];
  for (const ev of events) {
    if (ev.aAppend || !ev.segs || ev.tStartMs === undefined) continue;
    const evStart = ev.tStartMs / 1000;
    const evEnd = (ev.tStartMs + (ev.dDurationMs ?? 0)) / 1000;
    const segs = ev.segs.filter((s) => (s.utf8 ?? '').trim() !== '');
    segs.forEach((s, i) => {
      const start = evStart + (s.tOffsetMs ?? 0) / 1000;
      const next = segs[i + 1];
      const end = next ? evStart + (next.tOffsetMs ?? 0) / 1000 : evEnd;
      words.push({ start, end: Math.max(start, end), text: (s.utf8 ?? '').trim() });
    });
  }
  words.sort((a, b) => a.start - b.start);
  // Event durations overlap the next line; clamp each word to the start of the following one.
  for (let i = 0; i < words.length - 1; i++) words[i].end = Math.min(words[i].end, words[i + 1].start);
  return words;
}

const TIMESTAMP = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})/;

function parseTimestamp(t: string): number {
  const m = TIMESTAMP.exec(t);
  if (!m) throw new Error(`Bad timestamp: ${t}`);
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

/** Parses WebVTT cues (inline tags stripped). YouTube's rolling auto-captions repeat lines; repeats are dropped. */
export function parseVtt(raw: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of raw.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.split('\n');
    const timing = lines.findIndex((l) => l.includes('-->'));
    if (timing < 0) continue;
    const [a, b] = lines[timing].split('-->');
    const text = lines
      .slice(timing + 1)
      .map((l) => l.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean)
      .join('\n');
    if (!text) continue;
    const cue = { start: parseTimestamp(a), end: parseTimestamp(b.trim().split(/\s+/)[0]), text };
    const prev = cues[cues.length - 1];
    if (prev && prev.text === cue.text) {
      prev.end = Math.max(prev.end, cue.end);
      continue;
    }
    cues.push(cue);
  }
  return cues;
}

/** Collapses YouTube rolling captions ("line1\nline2" then "line2\nline3") into single, non-repeating lines. */
export function dedupeRollingCues(cues: Cue[]): Cue[] {
  const out: Cue[] = [];
  let lastLine = '';
  for (const c of cues) {
    const lines = c.text.split('\n').filter((l) => l !== lastLine);
    if (!lines.length) continue;
    const text = lines.join('\n');
    lastLine = c.text.split('\n').pop() ?? '';
    const prev = out[out.length - 1];
    if (prev && prev.end > c.start) prev.end = c.start;
    out.push({ start: c.start, end: Math.max(c.start + 0.3, c.end), text });
  }
  return out;
}

/**
 * Points where speech pauses: the gap between consecutive words. A gap after sentence-ending
 * punctuation counts double, so cuts land between sentences rather than between phrases.
 */
export function speechPauses(words: Cue[], minGap = 0.35): { at: number; gap: number }[] {
  const pauses: { at: number; gap: number }[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const gap = words[i + 1].start - words[i].end;
    const sentenceEnd = /[.!?।]["')\]]?$/.test(words[i].text);
    if (gap >= minGap || (sentenceEnd && gap >= 0.1)) {
      pauses.push({ at: words[i].end + gap / 2, gap: sentenceEnd ? gap * 2 + 0.5 : gap });
    }
  }
  return pauses;
}
