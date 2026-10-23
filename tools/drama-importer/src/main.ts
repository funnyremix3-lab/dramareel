/**
 * Splits one long, licensed video into short-drama episodes and imports it through the Admin API.
 *
 *   npm run import -- plan    --video src.mp4 --captions src.en-orig.json3 --out work/
 *   npm run import -- import  --video src.mp4 --captions … --subs en=src.en.vtt,hi=src.hi.vtt \
 *                              --title "…" --slug my-drama --out work/ [--categories romance,family]
 *   npm run import -- publish --out work/
 *
 * Cuts land on pauses between sentences (caption word gaps confirmed by audio silence) as close
 * as possible to --target seconds (default 200 = 3:20). `import` is resumable: progress is kept in
 * <out>/state.json, so re-running skips clips, episodes and uploads that already exist.
 * Only import content you own or are licensed to distribute.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AdminApi } from './api';
import { parseJson3, parseVtt, dedupeRollingCues, speechPauses, type Cue } from './captions';
import { formatTime, mergeBoundaries, parseSilences, planEpisodes, type Segment } from './plan';
import { sliceCues, toVtt } from './vtt';

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): { command: string; args: Args } {
  const [command = 'help', ...rest] = argv;
  const args: Args = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i].replace(/^--/, '');
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else args[key] = next, i++;
  }
  return { command, args };
}

const str = (args: Args, key: string, fallback?: string): string => {
  const v = args[key];
  if (typeof v === 'string') return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`--${key} is required`);
};
const num = (args: Args, key: string, fallback: number) => (typeof args[key] === 'string' ? Number(args[key]) : fallback);

const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';

function exec(cmd: string, argv: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, argv, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    p.on('error', fail);
    p.on('close', (code) => (code === 0 ? ok({ stdout, stderr }) : fail(new Error(`${cmd} exited ${code}: ${stderr.slice(-500)}`))));
  });
}

async function probeDuration(video: string): Promise<number> {
  const { stdout } = await exec(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', video]);
  return Number(stdout.trim());
}

async function detectSilences(video: string) {
  // Audio only, so this is much faster than real time.
  const { stderr } = await exec(FFMPEG, ['-hide_banner', '-nostats', '-vn', '-i', video, '-af', 'silencedetect=noise=-32dB:d=0.35', '-f', 'null', '-']);
  return parseSilences(stderr);
}

async function buildPlan(args: Args) {
  const video = resolve(str(args, 'video'));
  const duration = await probeDuration(video);
  const captions = typeof args.captions === 'string' ? parseJson3(await readFile(args.captions, 'utf8')) : [];
  console.log(`source ${formatTime(duration)}, ${captions.length} caption words; detecting silences…`);
  const silences = await detectSilences(video);
  const boundaries = mergeBoundaries(speechPauses(captions), silences);
  const segments = planEpisodes(duration, boundaries, {
    target: num(args, 'target', 200),
    tolerance: num(args, 'tolerance', 25),
    minLast: num(args, 'min-last', 60),
  });
  return { video, duration, segments, boundaries: boundaries.length };
}

function printPlan(segments: Segment[]) {
  for (const s of segments) {
    console.log(`  EP${String(s.number).padStart(2, '0')}  ${formatTime(s.start)} → ${formatTime(s.end)}  (${formatTime(s.end - s.start)})${s.forced ? '  ⚠ no pause found, exact cut' : ''}`);
  }
  console.log(`${segments.length} episodes`);
}

async function cutClip(video: string, s: Segment, out: string) {
  // Re-encode (not stream copy) so cuts are frame-accurate at sentence boundaries; the transcoder
  // re-encodes again into the HLS ladder, so this intermediate favours quality over size.
  await exec(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', s.start.toFixed(3), '-i', video, '-t', (s.end - s.start).toFixed(3),
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart',
    out,
  ]);
}

interface State {
  dramaId?: string;
  posterKey?: string;
  segments: Segment[];
  episodes: Record<number, { id: string; assetId?: string; subs?: string[] }>;
}

async function loadState(out: string): Promise<State | null> {
  const f = join(out, 'state.json');
  return existsSync(f) ? (JSON.parse(await readFile(f, 'utf8')) as State) : null;
}
const saveState = (out: string, state: State) => writeFile(join(out, 'state.json'), JSON.stringify(state, null, 2));

async function api(args: Args): Promise<AdminApi> {
  const base = str(args, 'api', process.env.API_URL ?? 'http://localhost:3000/api/v1').replace(/\/$/, '');
  const token = process.env.ADMIN_TOKEN ?? (await AdminApi.devToken(base, str(args, 'dev-account', 'owner')));
  return new AdminApi(base, token);
}

function parseSubs(spec: string | undefined): { lang: string; file: string }[] {
  if (!spec) return [];
  return spec.split(',').map((pair) => {
    const [lang, file] = pair.split('=');
    if (!/^[a-z]{2}$/.test(lang) || !file) throw new Error(`--subs expects lang=file pairs, got "${pair}"`);
    return { lang, file: resolve(file) };
  });
}

const LABELS: Record<string, string> = { en: 'English', hi: 'हिन्दी' };

async function importDrama(args: Args) {
  const out = resolve(str(args, 'out'));
  await mkdir(out, { recursive: true });
  let state = await loadState(out);
  const video = resolve(str(args, 'video'));
  if (!state) {
    const plan = await buildPlan(args);
    state = { segments: plan.segments, episodes: {} };
    await saveState(out, state);
  }
  printPlan(state.segments);

  // 1. Clips and per-episode subtitles (local, resumable).
  const subs = parseSubs(typeof args.subs === 'string' ? args.subs : undefined);
  const subCues = new Map<string, Cue[]>();
  for (const s of subs) subCues.set(s.lang, dedupeRollingCues(parseVtt(await readFile(s.file, 'utf8'))));
  for (const seg of state.segments) {
    const clip = join(out, `ep${String(seg.number).padStart(2, '0')}.mp4`);
    if (!existsSync(clip)) {
      const t0 = Date.now();
      await cutClip(video, seg, clip + '.part.mp4');
      await import('node:fs/promises').then((fs) => fs.rename(clip + '.part.mp4', clip));
      console.log(`cut EP${seg.number} in ${Math.round((Date.now() - t0) / 1000)}s`);
    }
    for (const [lang, cues] of subCues) {
      const vtt = join(out, `ep${String(seg.number).padStart(2, '0')}.${lang}.vtt`);
      if (!existsSync(vtt)) await writeFile(vtt, toVtt(sliceCues(cues, seg.start, seg.end)), 'utf8');
    }
  }
  const poster = join(out, 'poster.jpg');
  if (!existsSync(poster)) {
    const at = num(args, 'poster-at', Math.min(30, state.segments[0].end / 2));
    await exec(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(at), '-i', video, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', poster]);
  }

  // 2. Drama, episodes and uploads through the Admin API (resumable).
  const client = await api(args);
  if (!state.dramaId) {
    const drama = await client.createDrama({
      slug: str(args, 'slug'),
      title: str(args, 'title'),
      primaryLanguageCode: str(args, 'language', 'en'),
      ...(typeof args.synopsis === 'string' ? { synopsis: args.synopsis } : {}),
      ...(typeof args.categories === 'string' ? { categorySlugs: args.categories.split(',') } : {}),
      orientation: 'PORTRAIT',
      freeEpisodeCount: num(args, 'free', 5),
      defaultUnlockCoins: num(args, 'coins', 30),
    });
    state.dramaId = drama.id;
    await saveState(out, state);
    console.log(`created drama ${drama.slug} (${drama.id})`);
  }
  if (!state.posterKey) {
    state.posterKey = await client.uploadPoster(state.dramaId, poster);
    await client.updateDrama(state.dramaId, { posterKey: state.posterKey, coverKey: state.posterKey });
    await saveState(out, state);
  }
  for (const seg of state.segments) {
    const tag = String(seg.number).padStart(2, '0');
    const ep = (state.episodes[seg.number] ??= { id: (await client.createEpisode(state.dramaId, { number: seg.number, title: `Episode ${seg.number}` })).id });
    await saveState(out, state);
    if (!ep.assetId) {
      ep.assetId = await client.uploadVideo(ep.id, join(out, `ep${tag}.mp4`));
      await saveState(out, state);
    }
    ep.subs ??= [];
    for (const [i, s] of subs.entries()) {
      if (ep.subs.includes(s.lang)) continue;
      await client.uploadSubtitle(ep.id, s.lang, LABELS[s.lang] ?? s.lang, i === 0, join(out, `ep${tag}.${s.lang}.vtt`));
      ep.subs.push(s.lang);
      await saveState(out, state);
    }
    console.log(`EP${tag} uploaded (asset ${ep.assetId}), transcoding queued`);
  }
  console.log('import done. When the transcoder has finished, run: npm run import -- publish --out <out>');
}

async function publish(args: Args) {
  const out = resolve(str(args, 'out'));
  const state = await loadState(out);
  if (!state?.dramaId) throw new Error(`no import state in ${out}`);
  const client = await api(args);
  for (;;) {
    const statuses = await Promise.all(Object.values(state.episodes).map((e) => client.videoAsset(e.assetId!)));
    const failed = statuses.filter((s) => s.status === 'FAILED');
    if (failed.length) throw new Error(`transcode failed for ${failed.map((f) => f.id).join(', ')}: ${failed[0].lastError ?? ''}`);
    const ready = statuses.filter((s) => s.status === 'READY').length;
    console.log(`${ready}/${statuses.length} episodes transcoded`);
    if (ready === statuses.length) break;
    await new Promise((r) => setTimeout(r, 30_000));
  }
  for (const e of Object.values(state.episodes)) await client.publishEpisode(e.id).catch((err: Error) => console.warn(err.message));
  await client.publishDrama(state.dramaId);
  console.log('drama published');
}

async function main() {
  const { command, args } = parseArgs(process.argv.slice(2));
  if (command === 'plan') {
    const plan = await buildPlan(args);
    printPlan(plan.segments);
    if (typeof args.out === 'string') {
      await mkdir(args.out, { recursive: true });
      await writeFile(join(args.out, 'plan.json'), JSON.stringify(plan.segments, null, 2));
    }
  } else if (command === 'import') await importDrama(args);
  else if (command === 'publish') await publish(args);
  else console.log('usage: npm run import -- <plan|import|publish> --video … --captions … --out …  (see src/main.ts)');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
