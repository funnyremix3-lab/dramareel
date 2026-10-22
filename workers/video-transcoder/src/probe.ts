/** Validated facts about an uploaded source file, from `ffprobe -print_format json`. */
export interface MediaInfo {
  durationMs: number;
  /** Display dimensions (rotation already applied). */
  width: number;
  height: number;
  videoCodec: string;
  hasAudio: boolean;
  formatName: string;
}

export class InvalidMediaError extends Error {}

const ALLOWED_VIDEO_CODECS = new Set(['h264', 'hevc', 'vp8', 'vp9', 'av1', 'mpeg4', 'prores']);
const MIN_DURATION_MS = 1_000;
const MAX_DURATION_MS = 3 * 60 * 60 * 1000;
const MAX_EDGE = 4096;
const MIN_EDGE = 144;

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  tags?: { rotate?: string };
  side_data_list?: { rotation?: number }[];
}

interface ProbeOutput {
  streams?: ProbeStream[];
  format?: { duration?: string; format_name?: string };
}

/** Parses and validates ffprobe JSON. Throws InvalidMediaError for anything we will not process. */
export function parseProbe(json: unknown): MediaInfo {
  const probe = json as ProbeOutput;
  const video = probe.streams?.find((s) => s.codec_type === 'video');
  if (!video || !video.codec_name || !video.width || !video.height) throw new InvalidMediaError('No video stream found');
  if (!ALLOWED_VIDEO_CODECS.has(video.codec_name)) throw new InvalidMediaError(`Unsupported video codec ${video.codec_name}`);

  const rotation = Math.abs(
    Number(video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0),
  );
  const swap = rotation % 180 === 90;
  const width = swap ? video.height : video.width;
  const height = swap ? video.width : video.height;
  if (Math.min(width, height) < MIN_EDGE || Math.max(width, height) > MAX_EDGE) {
    throw new InvalidMediaError(`Unsupported resolution ${width}x${height}`);
  }

  const seconds = Number(probe.format?.duration ?? video.duration);
  if (!Number.isFinite(seconds)) throw new InvalidMediaError('Unknown duration');
  const durationMs = Math.round(seconds * 1000);
  if (durationMs < MIN_DURATION_MS || durationMs > MAX_DURATION_MS) throw new InvalidMediaError(`Unsupported duration ${seconds}s`);

  return {
    durationMs,
    width,
    height,
    videoCodec: video.codec_name,
    hasAudio: !!probe.streams?.some((s) => s.codec_type === 'audio'),
    formatName: probe.format?.format_name ?? 'unknown',
  };
}
