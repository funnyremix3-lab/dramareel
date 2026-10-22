import { spawn } from 'node:child_process';
import { RenditionPlan } from './ladder';

export const SEGMENT_SECONDS = 6;
const KEYFRAME_SECONDS = 2;

/** HLS VOD encode of one rendition into `outDir/index.m3u8` + `outDir/seg_000.ts`… */
export function renditionArgs(opts: {
  input: string;
  outDir: string;
  plan: RenditionPlan;
  hasAudio: boolean;
  preset: string;
}): string[] {
  const { input, outDir, plan, hasAudio, preset } = opts;
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', input,
    '-map', '0:v:0',
    ...(hasAudio ? ['-map', '0:a:0'] : []),
    '-vf', `scale=${plan.width}:${plan.height}:flags=lanczos,format=yuv420p`,
    '-c:v', 'libx264', '-preset', preset, '-profile:v', 'main',
    '-b:v', `${plan.videoBitrateKbps}k`, '-maxrate', `${plan.maxrateKbps}k`, '-bufsize', `${plan.bufsizeKbps}k`,
    // Fixed keyframe cadence so every rendition's segments align for ABR switching.
    '-force_key_frames', `expr:gte(t,n_forced*${KEYFRAME_SECONDS})`, '-sc_threshold', '0',
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000'] : []),
    '-f', 'hls', '-hls_time', String(SEGMENT_SECONDS), '-hls_playlist_type', 'vod',
    '-hls_segment_type', 'mpegts',
    '-hls_segment_filename', `${outDir}/seg_%03d.ts`,
    `${outDir}/index.m3u8`,
  ];
}

export function thumbnailArgs(input: string, output: string, atSeconds: number, width: number): string[] {
  return ['-hide_banner', '-loglevel', 'error', '-y', '-ss', atSeconds.toFixed(2), '-i', input, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '3', output];
}

export function probeArgs(input: string): string[] {
  return ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', input];
}

/** Runs a binary, collecting stdout; rejects with the tail of stderr on non-zero exit. */
export function run(bin: string, args: string[], timeoutMs = 60 * 60 * 1000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-4000)));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${bin} exited with ${code}: ${stderr.trim()}`));
    });
  });
}
