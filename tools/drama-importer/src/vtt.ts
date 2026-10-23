import type { Cue } from './captions';

function vttTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`;
}

/** Cues that overlap [start, end), clipped to it and shifted so the episode starts at 0. */
export function sliceCues(cues: Cue[], start: number, end: number): Cue[] {
  return cues
    .filter((c) => c.end > start && c.start < end)
    .map((c) => ({ start: Math.max(c.start, start) - start, end: Math.min(c.end, end) - start, text: c.text }))
    .filter((c) => c.end - c.start >= 0.05);
}

export function toVtt(cues: Cue[]): string {
  const body = cues.map((c) => `${vttTime(c.start)} --> ${vttTime(c.end)}\n${c.text}`).join('\n\n');
  return `WEBVTT\n\n${body}\n`;
}
