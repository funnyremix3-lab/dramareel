import { createReadStream, createWriteStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Config } from './config';

const CONTENT_TYPES: Record<string, string> = {
  m3u8: 'application/vnd.apple.mpegurl',
  ts: 'video/mp2t',
  jpg: 'image/jpeg',
  mp4: 'video/mp4',
};

export class Storage {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(config: Config) {
    this.bucket = config.S3_BUCKET;
    this.s3 = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async download(key: string, destination: string): Promise<void> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    await pipeline(res.Body as Readable, createWriteStream(destination));
  }

  async upload(key: string, file: string, contentType: string, cacheControl?: string): Promise<void> {
    const { size } = await stat(file);
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(file),
        ContentLength: size,
        ContentType: contentType,
        CacheControl: cacheControl,
      }),
    );
  }

  /** Uploads every file under `dir` to `prefix`, preserving relative paths. Returns uploaded keys. */
  async uploadDirectory(dir: string, prefix: string): Promise<string[]> {
    const files = await walk(dir);
    const keys: string[] = [];
    // Small fixed concurrency keeps memory flat and avoids provider rate limits.
    const queue = [...files];
    const workers = Array.from({ length: 6 }, async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        const rel = relative(dir, file).split(sep).join('/');
        const ext = rel.slice(rel.lastIndexOf('.') + 1);
        const key = `${prefix}${rel}`;
        // Playlists may be regenerated on re-encode; segments are immutable per encode.
        const cache = ext === 'm3u8' ? 'public, max-age=60' : 'public, max-age=31536000, immutable';
        await this.upload(key, file, CONTENT_TYPES[ext] ?? 'application/octet-stream', cache);
        keys.push(key);
      }
    });
    await Promise.all(workers);
    return keys;
  }

  /** Removes stale output from a previous attempt so retries never mix encodes. */
  async deletePrefix(prefix: string): Promise<void> {
    let token: string | undefined;
    do {
      const page = await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      const objects = (page.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (objects.length) await this.s3.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: objects } }));
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : Promise.resolve([join(dir, e.name)]))),
  );
  return nested.flat();
}
