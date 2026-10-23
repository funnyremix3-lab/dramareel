/**
 * Splits one long, licensed video into short-drama episodes and imports it through the Admin API.
 *
 *   npm run import -- plan    --video src.mp4 --captions src.en-orig.json3 --out work/
 *   npm run import -- import  --video src.mp4 --captions … --subs en=src.en.vtt,hi=src.hi.vtt \
 *                              --title "…" --slug my-drama --out work/ [--categories romance,family]
 *   npm run import -- poster  --video src.mp4 --captions … --out work/ [--poster-at 42]   # replace poster
 *   npm run import -- publish --out work/ [--watch]   # publish each episode as soon as it is transcoded
 *
 * Cuts land on pauses between sentences (caption word gaps confirmed by audio silence) as close
 * as possible to --target seconds (default 200 = 3:20). `import` is resumable: progress is kept in
 * <out>/state.json, so re-running skips clips, episodes and uploads that already exist.
 * Only import content you own or are licensed to distribute.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AdminApi } from './api';
import { dedupeRollingCues, parseJson3, parseVtt, quietestMoment, speechPauses, wordsToLines, type Cue } from './captions';
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

interface PlanParams {
  target: number;
  tolerance: number;
  minLast: number;
  captionsFile?: string;
  log?: (msg: string) => void;
}

/** Plans episode cuts for a video from its silences (and captions, when available). */
async function planVideo(video: string, p: PlanParams) {
  const duration = await probeDuration(video);
  const captions = p.captionsFile ? parseJson3(await readFile(p.captionsFile, 'utf8')) : [];
  p.log?.(`source ${formatTime(duration)}, ${captions.length} caption words; detecting silences…`);
  const silences = await detectSilences(video);
  const boundaries = mergeBoundaries(speechPauses(captions), silences);
  const segments = planEpisodes(duration, boundaries, { target: p.target, tolerance: p.tolerance, minLast: p.minLast });
  return { video, duration, segments, boundaries: boundaries.length };
}

async function buildPlan(args: Args) {
  return planVideo(resolve(str(args, 'video')), {
    target: num(args, 'target', 200),
    tolerance: num(args, 'tolerance', 25),
    minLast: num(args, 'min-last', 60),
    captionsFile: typeof args.captions === 'string' ? args.captions : undefined,
    log: (m) => console.log(m),
  });
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

/**
 * Writes a poster frame. Without --poster-at it picks the longest speech-free moment in the first
 * three minutes, so burned-in subtitles are not on the poster.
 */
async function writePoster(args: Args, video: string, file: string): Promise<number> {
  let at = typeof args['poster-at'] === 'string' ? Number(args['poster-at']) : NaN;
  if (Number.isNaN(at)) {
    const words = typeof args.captions === 'string' ? parseJson3(await readFile(args.captions, 'utf8')) : [];
    at = quietestMoment(words, 5, Math.min(180, await probeDuration(video))) ?? 30;
  }
  await exec(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', at.toFixed(2), '-i', video, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', file]);
  return at;
}

/** Re-renders the poster of an already imported drama and replaces it through the Admin API. */
async function replacePoster(args: Args) {
  const out = resolve(str(args, 'out'));
  const state = await loadState(out);
  if (!state?.dramaId) throw new Error(`no import state in ${out}`);
  const file = join(out, 'poster.jpg');
  const at = await writePoster(args, resolve(str(args, 'video')), file);
  const client = await api(args);
  state.posterKey = await client.uploadPoster(state.dramaId, file);
  await client.updateDrama(state.dramaId, { posterKey: state.posterKey, coverKey: state.posterKey });
  await saveState(out, state);
  console.log(`poster replaced (frame at ${formatTime(at)})`);
}

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

  // Subtitle sources, sliced per episode below.
  const subs = parseSubs(typeof args.subs === 'string' ? args.subs : undefined);
  const subCues = new Map<string, Cue[]>();
  for (const s of subs) {
    const raw = await readFile(s.file, 'utf8');
    // A .json3 caption file is turned into subtitle lines; a .vtt file is used as is.
    subCues.set(s.lang, s.file.endsWith('.json3') ? wordsToLines(parseJson3(raw)) : dedupeRollingCues(parseVtt(raw)));
  }
  const poster = join(out, 'poster.jpg');
  if (!existsSync(poster)) await writePoster(args, video, poster);

  // Drama and poster first, so the app can show it as soon as episode 1 is ready.
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

  // One episode at a time: cut → subtitles → create → upload, so transcoding starts immediately.
  for (const seg of state.segments) {
    const tag = String(seg.number).padStart(2, '0');
    const clip = join(out, `ep${tag}.mp4`);
    if (!existsSync(clip)) {
      const t0 = Date.now();
      await cutClip(video, seg, clip + '.part.mp4');
      await rename(clip + '.part.mp4', clip);
      console.log(`cut EP${seg.number} in ${Math.round((Date.now() - t0) / 1000)}s`);
    }
    for (const [lang, cues] of subCues) {
      const vtt = join(out, `ep${tag}.${lang}.vtt`);
      if (!existsSync(vtt)) await writeFile(vtt, toVtt(sliceCues(cues, seg.start, seg.end)), 'utf8');
    }
    const ep = (state.episodes[seg.number] ??= { id: (await client.createEpisode(state.dramaId, { number: seg.number, title: `Episode ${seg.number}` })).id });
    await saveState(out, state);
    if (!ep.assetId) {
      ep.assetId = await client.uploadVideo(ep.id, clip);
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
  console.log('import done');
}

/**
 * Publishes each episode as soon as its video is READY (and the drama with the first one).
 * With --watch it keeps polling until every planned episode is uploaded and published.
 */
async function publish(args: Args) {
  const out = resolve(str(args, 'out'));
  const client = await api(args);
  const published = new Set<number>();
  let dramaPublished = false;
  for (;;) {
    const state = await loadState(out);
    if (state?.dramaId) {
      // Episodes are queued in order, so stop at the first one that is not ready yet: one request per poll.
      const pending = Object.entries(state.episodes)
        .map(([n, e]) => ({ number: Number(n), ...e }))
        .filter((e) => !published.has(e.number))
        .sort((x, y) => x.number - y.number);
      for (const e of pending) {
        const number = e.number;
        if (!e.assetId) break;
        const asset = await client.videoAsset(e.assetId);
        if (asset.status === 'FAILED') throw new Error(`EP${number} transcode failed: ${asset.lastError ?? ''}`);
        if (asset.status !== 'READY') break;
        await client.publishEpisode(e.id);
        published.add(number);
        if (!dramaPublished) {
          await client.publishDrama(state.dramaId);
          dramaPublished = true;
          console.log('drama published');
        }
        console.log(`EP${number} published (${published.size}/${state.segments.length})`);
      }
      if (published.size === state.segments.length) {
        console.log('all episodes published');
        return;
      }
    }
    if (!args.watch) {
      console.log(`${published.size} episode(s) published; run with --watch to keep going`);
      return;
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
}

/**
 * Local import runner: claims admin import jobs, splits the uploaded source into episodes, uploads
 * them and reports progress back. The heavy ffmpeg work stays on this machine. Uploaded sources have
 * no captions, so cuts come from audio silence.
 */
async function worker(args: Args) {
  const client = await api(args);
  const root = resolve(str(args, 'work', process.env.IMPORT_WORK_DIR ?? './import-runs'));
  await mkdir(root, { recursive: true });
  const pollMs = num(args, 'poll', 15) * 1000;
  console.log(`import runner ready; work dir ${root}, polling every ${pollMs / 1000}s`);
  for (;;) {
    let job;
    try {
      job = (await client.listImports('PENDING')).items.sort((a, b) => a.id.localeCompare(b.id))[0];
    } catch (e) {
      console.warn(`poll failed: ${(e as Error).message}`);
      await sleep(pollMs);
      continue;
    }
    if (!job) {
      if (args.once) return;
      await sleep(pollMs);
      continue;
    }
    try {
      const { job: claimed, sourceUrl } = await client.claimImport(job.id);
      await runJob(client, claimed, sourceUrl, join(root, claimed.id));
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`job ${job.id} failed: ${msg}`);
      await client.patchImport(job.id, { status: 'FAILED', lastError: msg.slice(0, 1900) }).catch(() => undefined);
    }
  }
}

async function runJob(client: AdminApi, job: import('./api').ImportJob, sourceUrl: string, out: string) {
  await mkdir(out, { recursive: true });
  const tag = (n: number) => String(n).padStart(3, '0');
  const step = (s: string, extra: import('./api').ImportPatch = {}) => client.patchImport(job.id, { step: s, ...extra }).catch(() => undefined);
  console.log(`\n▶ ${job.slug} (${job.id})`);

  const source = join(out, 'source.mp4');
  if (!existsSync(source)) {
    await step('Downloading source');
    await client.download(sourceUrl, source + '.part');
    await rename(source + '.part', source);
  }

  await step('Planning episodes');
  const { segments } = await planVideo(source, { target: job.targetSeconds, tolerance: job.toleranceSeconds, minLast: Math.min(30, job.targetSeconds / 3), log: (m) => console.log(m) });
  console.log(`${segments.length} episodes`);
  await step('Creating drama', { totalEpisodes: segments.length });

  const drama = await client.createDrama({
    slug: job.slug,
    title: job.title,
    primaryLanguageCode: job.primaryLanguageCode,
    ...(job.synopsis ? { synopsis: job.synopsis } : {}),
    ...(job.categorySlugs.length ? { categorySlugs: job.categorySlugs } : {}),
    orientation: 'PORTRAIT',
    freeEpisodeCount: job.freeEpisodeCount,
    defaultUnlockCoins: job.defaultUnlockCoins,
  });
  await client.patchImport(job.id, { dramaId: drama.id });

  const poster = join(out, 'poster.jpg');
  // No captions for uploaded sources, so take a frame partway into the first episode.
  const posterAt = Math.min(30, segments[0].end / 2);
  await exec(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(posterAt), '-i', source, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', poster]);
  const posterKey = await client.uploadPoster(drama.id, poster);
  await client.updateDrama(drama.id, { posterKey, coverKey: posterKey });

  const assets: { episodeId: string; assetId: string }[] = [];
  for (const seg of segments) {
    const clip = join(out, `ep${tag(seg.number)}.mp4`);
    await cutClip(source, seg, clip);
    const ep = await client.createEpisode(drama.id, { number: seg.number, title: `Episode ${seg.number}` });
    const assetId = await client.uploadVideo(ep.id, clip);
    assets.push({ episodeId: ep.id, assetId });
    await rm(clip, { force: true });
    await step(`Uploaded ${seg.number}/${segments.length}`, { uploadedEpisodes: seg.number });
    console.log(`EP${tag(seg.number)} uploaded`);
  }

  if (!job.autoPublish) {
    await client.patchImport(job.id, { status: 'READY', step: 'Uploaded; transcoding' });
    console.log('uploaded; auto-publish off, leaving episodes for manual publish');
    return;
  }

  await step('Transcoding & publishing');
  let published = 0;
  let dramaPublished = false;
  while (published < assets.length) {
    const asset = await client.videoAsset(assets[published].assetId);
    if (asset.status === 'FAILED') throw new Error(`EP${published + 1} transcode failed: ${asset.lastError ?? ''}`);
    if (asset.status !== 'READY') {
      await sleep(10_000);
      continue;
    }
    await client.publishEpisode(assets[published].episodeId);
    if (!dramaPublished) {
      await client.publishDrama(drama.id);
      dramaPublished = true;
    }
    published++;
    await client.patchImport(job.id, { publishedEpisodes: published, step: `Published ${published}/${assets.length}` });
  }
  await client.patchImport(job.id, { status: 'DONE', step: 'Done' });
  await rm(source, { force: true });
  console.log(`✔ ${job.slug}: ${published} episodes published`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  else if (command === 'poster') await replacePoster(args);
  else if (command === 'worker') await worker(args);
  else console.log('usage: npm run import -- <plan|import|publish|poster|worker> … (see src/main.ts)');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
