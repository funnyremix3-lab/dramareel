/**
 * DEVELOPMENT ONLY. Generates synthetic vertical test clips (colour pattern + title + tone) for
 * episodes that have no video yet, uploads them as originals and runs the real transcode pipeline.
 *
 *   npm run seed:media                 # all episodes without video
 *   npm run seed:media -- --limit 12   # first 12
 */
import { existsSync } from 'node:fs';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import { loadConfig } from '../src/config';
import { run } from '../src/ffmpeg';
import { processAsset } from '../src/process-asset';
import { Storage } from '../src/storage';

const config = { ...loadConfig(), X264_PRESET: 'ultrafast' as const };
if (config.NODE_ENV === 'production') {
  console.error('Refusing to generate sample media in production');
  process.exit(1);
}

const prisma = new PrismaClient();
const storage = new Storage(config);
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const CLIP_SECONDS = 20;

function fontFile(): string {
  const candidates = [
    process.env.SAMPLE_FONT_FILE,
    'C:/Windows/Fonts/arialbd.ttf',
    'C:/Windows/Fonts/arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  ];
  const found = candidates.find((f) => f && existsSync(f));
  if (!found) throw new Error('No font found; set SAMPLE_FONT_FILE');
  return found;
}

/** Escapes a path for use inside an ffmpeg filtergraph option value. */
const filterPath = (p: string) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

async function ensureBucket() {
  const s3 = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
  });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.S3_BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: config.S3_BUCKET }));
    console.log(`created bucket ${config.S3_BUCKET}`);
  }
}

async function generateClip(dir: string, title: string, episode: number, hue: number): Promise<string> {
  const textFile = join(dir, 'title.txt');
  await writeFile(textFile, `${title}\nEpisode ${episode}`, 'utf8');
  const output = join(dir, 'clip.mp4');
  const font = filterPath(fontFile());
  const filter = [
    `hue=h=${hue}`,
    'drawbox=x=0:y=ih/2-140:w=iw:h=280:color=black@0.55:t=fill',
    `drawtext=fontfile='${font}':textfile='${filterPath(textFile)}':fontcolor=white:fontsize=44:line_spacing=18:x=(w-text_w)/2:y=(h-text_h)/2`,
    `drawtext=fontfile='${font}':text='%{pts\\:hms}':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=h-160`,
  ].join(',');
  await run(config.FFMPEG_PATH, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `testsrc2=size=720x1280:rate=30:duration=${CLIP_SECONDS}`,
    '-f', 'lavfi', '-i', `sine=frequency=${300 + episode * 15}:sample_rate=48000:duration=${CLIP_SECONDS}`,
    '-vf', filter,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k',
    '-shortest', output,
  ]);
  return output;
}

async function main() {
  await ensureBucket();
  const episodes = await prisma.episode.findMany({
    where: { currentVideoAssetId: null },
    orderBy: [{ drama: { trendingScore: 'desc' } }, { number: 'asc' }],
    include: { drama: { select: { title: true, slug: true } } },
    take: Number.isFinite(limit) ? limit : undefined,
  });
  console.log(`generating sample media for ${episodes.length} episodes`);

  for (const [i, ep] of episodes.entries()) {
    const dir = await mkdtemp(join(tmpdir(), 'sample-'));
    try {
      const hue = [...ep.drama.slug].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
      const clip = await generateClip(dir, ep.drama.title, ep.number, hue);
      const size = (await stat(clip)).size;

      const asset = await prisma.videoAsset.create({
        data: { episodeId: ep.id, originalKey: `pending/${crypto.randomUUID()}`, mimeType: 'video/mp4', sizeBytes: BigInt(size), status: 'UPLOADED' },
      });
      const originalKey = `originals/${asset.id}/source.mp4`;
      await prisma.videoAsset.update({ where: { id: asset.id }, data: { originalKey } });
      await storage.upload(originalKey, clip, 'video/mp4');

      await processAsset({ prisma, storage, config, log: () => undefined }, asset.id, true);
      console.log(`[${i + 1}/${episodes.length}] ${ep.drama.slug} ep${ep.number} → READY`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
