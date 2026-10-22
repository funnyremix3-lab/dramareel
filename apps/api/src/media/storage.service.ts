import { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app-exception';
import { ENV, Env } from '../config/env';

/** Object keys. Originals are private forever; processed media is served only via the token-checking edge. */
export const storageKeys = {
  original: (assetId: string, ext: string) => `originals/${assetId}/source.${ext}`,
  processedPrefix: (assetId: string) => `processed/${assetId}/`,
  processed: (assetId: string, path: string) => `processed/${assetId}/${path}`,
  subtitle: (episodeId: string, lang: string) => `subtitles/${episodeId}/${lang}.vtt`,
  publicImage: (kind: 'posters' | 'avatars' | 'creatives' | 'thumbnails', id: string, ext: string) => `public/${kind}/${id}.${ext}`,
};

@Injectable()
export class StorageService {
  private readonly client?: S3Client;
  readonly bucket: string;

  constructor(@Inject(ENV) env: Env) {
    this.bucket = env.S3_BUCKET;
    if (env.S3_ENDPOINT && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
      this.client = new S3Client({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
        credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
    }
  }

  private s3(): S3Client {
    if (!this.client) throw new AppException('INTERNAL', 'Object storage is not configured');
    return this.client;
  }

  /** Presigned PUT bound to the declared type and size — the upload must match both. */
  presignUpload(key: string, contentType: string, sizeBytes: number, expiresInSeconds = 900): Promise<string> {
    return getSignedUrl(
      this.s3(),
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes }),
      { expiresIn: expiresInSeconds, signableHeaders: new Set(['content-type', 'content-length']) },
    );
  }

  presignDownload(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.s3(), new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSeconds });
  }

  async head(key: string): Promise<{ size: number; contentType?: string } | null> {
    try {
      const res = await this.s3().send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: Number(res.ContentLength ?? 0), contentType: res.ContentType };
    } catch (err) {
      if (err instanceof NotFound || (err as { name?: string }).name === 'NotFound') return null;
      throw err;
    }
  }

  async get(key: string, range?: string) {
    try {
      const res = await this.s3().send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: range }));
      return {
        body: res.Body as Readable,
        contentLength: res.ContentLength,
        contentRange: res.ContentRange,
        contentType: res.ContentType,
      };
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === 'NoSuchKey' || name === 'NotFound') return null;
      throw err;
    }
  }

  async put(key: string, body: Buffer | Readable, contentType: string) {
    await this.s3().send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async delete(key: string) {
    await this.s3().send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async ensureBucket() {
    try {
      await this.s3().send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.s3().send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }
}
