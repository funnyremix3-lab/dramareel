import { existsSync } from 'node:fs';
import { z } from 'zod';

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  /** Transcoding is CPU-bound; keep this at 1 per vCPU pair. */
  TRANSCODER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  /** x264 preset: "veryfast" for production throughput, "ultrafast" for local sample data. */
  X264_PRESET: z.enum(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium']).default('veryfast'),
  WORK_DIR: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid transcoder configuration:\n${issues}`);
  }
  return parsed.data;
}
