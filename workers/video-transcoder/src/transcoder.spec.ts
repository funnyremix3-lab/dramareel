import { renditionArgs, thumbnailArgs } from './ffmpeg';
import { masterPlaylist } from './hls';
import { planRenditions } from './ladder';
import { InvalidMediaError, parseProbe } from './probe';

describe('planRenditions', () => {
  const names = (w: number, h: number) => planRenditions(w, h).map((p) => `${p.name}:${p.width}x${p.height}`);

  it('produces 480p/720p/1080p for a 1080x1920 portrait source', () => {
    expect(names(1080, 1920)).toEqual(['480p:480x854', '720p:720x1280', '1080p:1080x1920']);
  });

  it('never upscales: 720x1280 source stops at 720p', () => {
    expect(names(720, 1280)).toEqual(['480p:480x854', '720p:720x1280']);
  });

  it('handles landscape sources by short edge', () => {
    expect(names(1920, 1080)).toEqual(['480p:854x480', '720p:1280x720', '1080p:1920x1080']);
  });

  it('keeps a tiny source at its own size', () => {
    expect(names(360, 640)).toEqual(['360p:360x640']);
  });

  it('always yields even dimensions', () => {
    for (const p of planRenditions(1080, 2340)) {
      expect(p.width % 2).toBe(0);
      expect(p.height % 2).toBe(0);
    }
  });

  it('rejects nonsense dimensions', () => {
    expect(() => planRenditions(0, 100)).toThrow();
  });
});

describe('parseProbe', () => {
  const probe = (overrides: Record<string, unknown> = {}, extraStreams: unknown[] = [{ codec_type: 'audio', codec_name: 'aac' }]) => ({
    streams: [{ codec_type: 'video', codec_name: 'h264', width: 1080, height: 1920, ...overrides }, ...extraStreams],
    format: { duration: '95.4', format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
  });

  it('extracts dimensions, duration and audio presence', () => {
    expect(parseProbe(probe())).toMatchObject({ width: 1080, height: 1920, durationMs: 95_400, hasAudio: true, videoCodec: 'h264' });
  });

  it('applies rotation metadata (phone recordings)', () => {
    const rotated = parseProbe(probe({ width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] }));
    expect([rotated.width, rotated.height]).toEqual([1080, 1920]);
  });

  it('detects missing audio', () => {
    expect(parseProbe(probe({}, [])).hasAudio).toBe(false);
  });

  it.each([
    ['no video stream', { streams: [{ codec_type: 'audio' }], format: { duration: '5' } }],
    ['unsupported codec', probe({ codec_name: 'gif' })],
    ['too large', probe({ width: 8000, height: 8000 })],
    ['too small', probe({ width: 100, height: 100 })],
  ])('rejects %s', (_, json) => {
    expect(() => parseProbe(json)).toThrow(InvalidMediaError);
  });

  it('rejects zero and absurd durations', () => {
    expect(() => parseProbe({ ...probe(), format: { duration: '0.2' } })).toThrow(InvalidMediaError);
    expect(() => parseProbe({ ...probe(), format: { duration: String(4 * 3600) } })).toThrow(InvalidMediaError);
    expect(() => parseProbe({ ...probe(), format: {} })).toThrow(InvalidMediaError);
  });
});

describe('masterPlaylist', () => {
  it('lists renditions highest first with resolution and codecs', () => {
    const text = masterPlaylist(planRenditions(720, 1280), true);
    const lines = text.trim().split('\n');
    expect(lines[0]).toBe('#EXTM3U');
    expect(lines[4]).toBe('720p/index.m3u8');
    expect(lines[6]).toBe('480p/index.m3u8');
    expect(lines[3]).toContain('RESOLUTION=720x1280');
    expect(lines[3]).toContain('CODECS="avc1.4d401f,mp4a.40.2"');
  });

  it('omits the audio codec for silent sources', () => {
    expect(masterPlaylist(planRenditions(1080, 1920), false)).not.toContain('mp4a');
  });
});

describe('ffmpeg arguments', () => {
  const plan = planRenditions(720, 1280)[1];

  it('builds an HLS VOD encode with aligned keyframes', () => {
    const args = renditionArgs({ input: 'in.mp4', outDir: 'out/720p', plan, hasAudio: true, preset: 'veryfast' });
    const joined = args.join(' ');
    expect(joined).toContain('-hls_playlist_type vod');
    expect(joined).toContain('scale=720:1280');
    expect(joined).toContain('-force_key_frames expr:gte(t,n_forced*2)');
    expect(joined).toContain('-c:a aac');
    expect(args[args.length - 1]).toBe('out/720p/index.m3u8');
  });

  it('drops audio mapping for silent sources', () => {
    const args = renditionArgs({ input: 'in.mp4', outDir: 'o', plan, hasAudio: false, preset: 'veryfast' }).join(' ');
    expect(args).not.toContain('0:a:0');
    expect(args).not.toContain('aac');
  });

  it('passes the input as a separate argument (no shell interpolation)', () => {
    const args = thumbnailArgs('weird; rm -rf / .mp4', 't.jpg', 3, 360);
    expect(args).toContain('weird; rm -rf / .mp4');
  });
});
