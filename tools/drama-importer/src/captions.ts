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
 * Groups word cues into readable subtitle lines: a line ends at a sentence end, a pause, or when
 * it would exceed `maxChars` characters or `maxSeconds` on screen.
 */
export function wordsToLines(words: Cue[], maxChars = 42, maxSeconds = 4, pause = 0.6): Cue[] {
  const lines: Cue[] = [];
  let current: Cue | null = null;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (current && (current.text.length + 1 + w.text.length > maxChars || w.end - current.start > maxSeconds)) {
      lines.push(current);
      current = null;
    }
    current = current ? { start: current.start, end: w.end, text: `${current.text} ${w.text}` } : { ...w };
    const next = words[i + 1];
    if (!next || /[.!?।]["')\]]?$/.test(w.text) || next.start - w.end >= pause) {
      lines.push(current);
      current = null;
    }
  }
  // Keep each line on screen a little longer when the next one starts later.
  for (let i = 0; i < lines.length; i++) {
    const nextStart = lines[i + 1]?.start ?? Infinity;
    lines[i].end = Math.min(Math.max(lines[i].end, lines[i].start + 1), lines[i].end + 0.6, nextStart);
  }
  return lines;
}

/**
 * Middle of the longest stretch without speech inside [from, to]. Burned-in subtitles only show
 * while someone speaks, so a frame from here has no caption text on it.
 */
export function quietestMoment(words: Cue[], from: number, to: number, maxWord = 0.7): number | null {
  const inside = words.filter((w) => w.end > from && w.start < to);
  let best: { at: number; len: number } | null = null;
  let cursor = from;
  for (const w of [...inside, { start: to, end: to, text: '' }]) {
    const len = w.start - cursor;
    if (len > (best?.len ?? 0)) best = { at: cursor + len / 2, len };
    cursor = Math.max(cursor, Math.min(w.end, w.start + maxWord));
  }
  // Under ~1.5 s there is no reliable caption-free frame.
  return best && best.len >= 1.5 ? best.at : null;
}

/**
 * Points where speech pauses: the gap between consecutive words. A gap after sentence-ending
 * punctuation counts double, so cuts land between sentences rather than between phrases.
 */
export function speechPauses(words: Cue[], minGap = 0.35, maxWord = 0.7): { at: number; gap: number }[] {
  const pauses: { at: number; gap: number }[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    // Auto-captions stretch each word until the next one starts, which hides pauses; a spoken
    // word rarely lasts longer than maxWord, so anything beyond that is silence.
    const end = Math.min(words[i].end, words[i].start + maxWord);
    const gap = Math.max(0, words[i + 1].start - end);
    const sentenceEnd = /[.!?।]["')\]]?$/.test(words[i].text);
    if (sentenceEnd) pauses.push({ at: end + gap / 2, gap: gap * 2 + 0.5 });
    else if (gap >= minGap) pauses.push({ at: end + gap / 2, gap });
  }
  return pauses;
}
