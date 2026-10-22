// Runs in every test worker before modules load. Integration tests NEVER use .env.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://reeldrama:reeldrama@localhost:54329/reeldrama_test';
process.env.DIRECT_DATABASE_URL = process.env.DATABASE_URL;
process.env.DEV_JWT_SECRET = 'e2e-dev-secret-'.padEnd(48, 'x');
process.env.LOG_LEVEL = 'error';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_JWKS_URL = '';
process.env.SUPABASE_JWT_SECRET = '';
process.env.MEDIA_PUBLIC_BASE_URL = 'https://media.test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:63799';
process.env.S3_ENDPOINT = process.env.TEST_S3_ENDPOINT ?? 'http://localhost:9000';
process.env.S3_BUCKET = 'reel-drama-test';
process.env.S3_ACCESS_KEY_ID = 'reeldrama';
process.env.S3_SECRET_ACCESS_KEY = 'reeldrama-secret';
process.env.S3_FORCE_PATH_STYLE = 'true';
process.env.MEDIA_BASE_URL = 'https://media.test';
process.env.PLAYBACK_SIGNING_KEY = Buffer.alloc(32, 1).toString('base64');
process.env.DEV_MEDIA_PROXY = 'true';
